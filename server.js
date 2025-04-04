import express from 'express';
import { SyncServer } from '@ircam/sync'
import { Server as HttpServer } from 'http';
import { Server as IoServer } from "socket.io";
import Conf from 'conf';
import fs from 'fs';
import 'dotenv/config'
import path from 'path';
import MediaManager from './MediaManager.js';
import LazyStorage from './LazyStorage.mjs';
import { info } from 'console';
const __dirname = new URL('.', import.meta.url).pathname;

if (!'PORT' in process.env) process.env.PORT = 5000;
if (!'VIDEO_PATH' in process.env) process.env.VIDEO_PATH = './www/video';
if (!'STORE_FILE' in process.env) process.env.STORE_FILE = './torage/store.json';

console.log("\n === Flanerie Mozaic Server === \n")

const STORE = LazyStorage(process.env.STORE_FILE);
const MEDIA = MediaManager();

console.log("Loading STORE from: ", process.env.STORE_FILE)

var app = express();
var server = HttpServer(app);
var io = new IoServer(server);


// DEFAULTS 
const defaultState = {
  offsetTime: 0,
  media: null,
  lastmedia: null,
  mediainfo: {},
  paused: false,
  ctrls: false,
}

const defaultDevice = {
  position: {x: 0, y: 0},
  resolution: {x: 400, y: 800},
  zoomdevice: 1.0,
  alive: false,
  selected: false,
  mode: 'new' // new, fixed, guest
}

// STORES
var ROOMS = STORE.rooms;
if (!ROOMS) ROOMS = STORE.rooms = {};

function room(roomid) {
  if (typeof roomid === 'object' && !Array.isArray(roomid) && roomid !== null && 'room' in roomid) roomid = roomid.room;  // allow to pass entire socket object
  if (!roomid) roomid = 'default';
  if (!STORE.rooms[roomid]) STORE.rooms[roomid] = {state: Object.assign({}, defaultState), devices: {}};
  return STORE.rooms[roomid];
}

function roomstate(roomid) {
  return room(roomid).state;
}

function roomdevices(roomid) {
  return room(roomid).devices;
}

function device(uuid, roomid) {
  if (uuid.startsWith('_')) return Object.assign({}, defaultDevice, {mode: 'control'});
  var devices = roomdevices(roomid);
  devices[uuid] = Object.assign({}, defaultDevice, devices[uuid]);
  return devices[uuid];
}

// SYNC Server
//
const startTime = process.hrtime();
const getTimeFunction = () => {
  const now = process.hrtime(startTime);
  return now[0] + now[1] * 1e-9;
}
const syncServer = new SyncServer(getTimeFunction);

// INIT Devices to default state
//
for (let room in STORE.rooms) {
  for (const uuid in STORE.rooms[room].devices) {
    let dev = device(uuid, room);
    if (dev.mode.startsWith('guest')) dev.resolution = {x: 400, y: 800};
    dev = Object.assign({}, defaultDevice, dev, {alive: false});
  }
}

// Create a new device entry if it doesn't exist
function bootstrapDevice(uuid, room, reso) {
  if (uuid === undefined) return;
  if (room === undefined) room = 'default';

  let dev = device(uuid, room);

  if (reso) {
    dev.resolution = reso;
    dev.alive = true;
  }

  return dev
}

// Send room state to all clients
function infoState(roomid, targetid) {
  roomid = roomid || 'default';
  targetid = targetid || roomid;

  let state = roomstate(roomid);

  let media = state.media || state.lastmedia;
  state.lastmedia = media;
  state.mediainfo = media ? MEDIA.info(roomid, media) : {};

  // send light state (without devices)
  state = Object.assign({}, state);
  delete state.devices; 
  io.to(targetid).emit('state', state);

  // store modified state
  STORE._save();
}

// Send devices state to all clients
function infoDevices(roomid, targetid) {
  roomid = roomid || 'default';
  targetid = targetid || roomid;
  let devices = Object.assign({}, room(roomid).devices);
  io.to(targetid).emit('devices', devices);
  STORE._save();
}

function infoMedialist(roomid, targetid) {
  roomid = roomid || 'default';
  targetid = targetid || roomid;
  io.to(targetid).emit('medialist', MEDIA.medialist(roomid));
  STORE._save();
}

// Check if socket is valid
function checkSocket(socket) {
  if (!('uuid' in socket) || !('room' in socket)) return false;
  if (!(socket.room in STORE.rooms)) return false;
  if (!(socket.uuid.startsWith('_')) && !(socket.uuid in roomdevices(socket))) return false;
  return true;
}




// Socket.io Server
//
io.on('connection', (socket) => 
{
  socket.on('disconnect', () => {

    // if socket.uuid is master of a room, stop that room
    if (socket.uuid && socket.uuid === roomstate(socket.room).master) {
      roomstate(socket.room).media = '';
      infoState(socket.room);
    }

    if (!socket.uuid || socket.uuid.startsWith('_')) return; // ignore controler / mapper

    if (!checkSocket(socket)) return;
    device(socket.uuid, socket.room).alive = false;
    if (socket.uuid.startsWith('guest')) 
      device(socket.uuid, socket.room).resolution = {x: 400, y: 800};
    infoDevices(socket.room);
    console.log('device disconnected');
  });

  //
  // PER-ROOM commands
  //

  // Client is ready to receive initial data
  socket.on('hi', (uuid, room, reso) => 
  {
    uuid = String(uuid).trim();
    if (uuid === '') {
      console.error('uuid is undefined');
      socket.emit('error', 'uuid is undefined');
      return;
    }

    if (room === undefined) room = 'default';

    socket.uuid = uuid;
    socket.room = room;
    socket.join(room);
    socket.join(uuid);

    if (uuid.startsWith('_')) {
      console.log('anonymous player connected');
    }
    else {
      console.log('device connected', uuid, room);

      let dev = bootstrapDevice(uuid, room, reso);
      
      // if new, try to move to a dead guest
      if (dev.mode === 'new') {
        for (let uuid in STORE.rooms[room].devices) {
          if (device(uuid,room).mode === 'guest' && !device(uuid,room).alive) {
            io.to(uuid).emit('setname', guestid);
            break;
          }
        }
      }
    }

    infoDevices(room);
    infoState(room, uuid);
    infoMedialist(room, uuid);
  })

  // Configure media
  socket.on('mediaconf', (media, key, val) => {
    if (!checkSocket(socket)) return;
    MEDIA.configure(socket.room, media, key, val)
    infoState(socket.room)
  })

  // Configure device
  socket.on('deviceconf', (key, val, uuid) => {
    if (!checkSocket(socket)) return;
    uuid = uuid || socket.uuid;
    bootstrapDevice(uuid, socket.room)[key] = val; 
    infoDevices(socket.room);
  })
  
  // Rename device
  socket.on('rename', (olduuid, newuuid) => {
    if (!checkSocket(socket)) return;
    if (olduuid === undefined) return;
    if (newuuid === undefined) return;
    
    let r = room(socket);    
    r.devices[newuuid] = Object.assign({}, r.devices[olduuid]);
    delete r.devices[olduuid];

    io.to(olduuid).emit('setname', newuuid);
  })

  // Remove device
  socket.on('remove', (uuid) => {
    if (!checkSocket(socket)) return;
    if (uuid === undefined) return;
    
    if (uuid.startsWith('guest')) io.to(uuid).emit('reload');
    delete room(socket).devices[uuid];
    
    infoDevices(socket.room);
  })

  // select device
  socket.on('select', (selected, uuid) => {
    if (!checkSocket(socket)) return;
    uuid = uuid || socket.uuid;
    io.to(uuid).emit('select', selected);
  })

  // Add guest
  socket.on('guestAdd', () => {
    if (!checkSocket(socket)) return;
    
    var guestCount = 0;
    for (let uuid in room(socket).devices)
      if (room(socket).devices[uuid].mode === 'guest') guestCount++;
    while (room(socket).devices['guest'+guestCount]) guestCount++;

    var uuid = "guest"+guestCount
    let dev = bootstrapDevice(uuid, socket.room, {x: 400, y: 800});
    dev.mode = 'guest';
    dev.alive = false;

    infoDevices(socket.room);
  })

  // Move device
  socket.on('move', (delta, uuid) => 
  {
    if (!checkSocket(socket)) return;
    uuid = uuid || socket.uuid;
    // console.log('move', uuid, socket.room, delta);
    var dev = bootstrapDevice(uuid, socket.room);
    dev.position.x += delta.x;
    dev.position.y += delta.y;
    infoDevices(socket.room);
  })

  // Move all devices
  socket.on('moveAll', (delta) => 
  {
    if (!checkSocket(socket)) return;
    for (let uuid in room(socket).devices) {
      let dev = device(uuid, socket);
      dev.position.x += delta.x*dev.zoomdevice;
      dev.position.y += delta.y*dev.zoomdevice;
    }
    infoDevices(socket.room);
  })

  // Clear devices
  socket.on('clearDevices', () => 
  {
    if (!checkSocket(socket)) return;
    for (let uuid in room(socket).devices) {
      let dev = device(uuid, socket);
      if (dev.alive) dev.alive = false;
      else if (!uuid.startsWith('guest')) delete room(socket).devices[uuid];
    }
    infoDevices(socket.room);
  })

  // Toggle controls
  socket.on('toggleCtrls', () => 
  {
    if (!checkSocket(socket)) return;
    roomstate(socket).ctrls = !roomstate(socket).ctrls
    infoState(socket.room);
  })

  // Load and play media
  socket.on('play', (media) => {
    console.log('play', media, socket.room, socket.uuid);
    if (!checkSocket(socket)) return;
    var state = roomstate(socket)
    state.offsetTime = getTimeFunction();
    if (media !== undefined) state.media = media;
    else state.media = state.lastmedia;
    state.paused = false;
    state.master = socket.uuid
    infoState(socket.room);
    console.log('play', media, roomstate(socket));
  })

  // Stop media
  socket.on('stop', () => {
    if (!checkSocket(socket)) return;
    roomstate(socket).media = null;
    infoState(socket.room);
  })

  // Pause
  socket.on('pause', () => {
    if (!checkSocket(socket)) return;
    roomstate(socket).paused = !roomstate(socket).paused;
    infoState(socket.room);
  })

  // reloadAll
  socket.on('reloadAll', () => {
    if (!checkSocket(socket)) return;
    io.to(socket.room).emit('reload');
  })
  
  socket.on('state?', () => {
    if (!checkSocket(socket)) return;
    infoState(socket.room, socket.uuid);
  })

  socket.on('medialist?', () => {
    if (!checkSocket(socket)) return;
    infoMedialist(socket.room, socket.uuid);
  })

  socket.on('devices?', () => {
    if (!checkSocket(socket)) return;
    infoDevices(socket.room, socket.uuid);
  })

  //
  // CROSS-ROOM
  //

  socket.on('rooms?', () => {
    // answer is a list of 
    // { room: 'room1', videos: ['video1', 'video2', ...] }
    let rooms = [];
    for (let roomid in STORE.rooms) rooms.push({room: roomid, videos: MEDIA.medialist(roomid)});
    socket.emit('rooms', rooms);
  })

  // Playsync all rooms
  socket.on('playsync', (roomlist) => {
    let offsetTime = getTimeFunction();
    for (let roomid in STORE.rooms) {
      if (roomlist && !roomlist.includes(roomid)) continue;
      console.log('playsync', roomid, roomstate(roomid).media, roomstate(roomid).lastmedia);
      roomstate(roomid).offsetTime = offsetTime;
      // roomstate(roomid).media = roomstate(roomid).lastmedia;
      roomstate(roomid).paused = false;
      infoState(roomid);
    }
  })

  // Pausesync all rooms
  socket.on('pausesync', () => {
    for (let roomid in STORE.rooms) room(roomid).paused = true;
    io.emit('pause');
  })

  // Stopsync all rooms
  socket.on('stopsync', () => {
    for (let roomid in STORE.rooms) roomstate(roomid).media = null;
    io.emit('stop');
  })

  // SYNC Server - client init
  syncServer.start( 
    (...args) => { socket.emit('pong', ...args) },  // send  
    (callback) => { socket.on('ping', (...args) => { callback(...args) }) },  // receive
  );
  
  // Send initial HELLO trigger
  socket.emit('hello');

});


// Express Server
//

server.listen(process.env.PORT, function() {
  console.log('listening on *:' + process.env.PORT);
});

app.get(['/qr', '/qrcode'], function(req, res) {
  res.sendFile(__dirname + '/www/qr.html');
});

app.get('/mapping/:room?', function(req, res) {
  res.sendFile(__dirname + '/www/mapping.html');
});

app.get('/control', function(req, res) {
  res.sendFile(__dirname + '/www/control.html');
});

app.get('/:room?', function(req, res) {
  res.sendFile(__dirname + '/www/index.html');
});



// Serve static files /static
app.use('/static', express.static('www'));
app.use('/media', express.static(process.env.VIDEO_PATH));
