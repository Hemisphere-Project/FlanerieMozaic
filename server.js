import express from 'express';
import { SyncServer } from '@ircam/sync'
import { Server as HttpServer } from 'http';
import { Server as IoServer } from "socket.io";
import Conf from 'conf';
import fs from 'fs';
import 'dotenv/config'
import path from 'path';
import './media.js';
import { playlist } from './media.js';

if (!'PORT' in process.env) process.env.PORT = 5000;
if (!'VIDEO_PATH' in process.env) process.env.VIDEO_PATH = './www/video';


console.log("\n === Flanerie Mozaic Server === \n")

const __dirname = new URL('.', import.meta.url).pathname;
// const options={
//   key:fs.readFileSync(path.join(__dirname,'./cert/key.pem')),
//   cert:fs.readFileSync(path.join(__dirname,'./cert/cert.pem'))
// }

const config = new Conf({projectName: 'panoptic'});
// config.clear();

console.log("Loading config from: ", config.path)

var app = express();
var server = HttpServer(app);
var io = new IoServer(server);

// STATE
//
var defaultState = {
  zoom: 1.0,
  offsetTime: 0,
  media: '',
  paused: false,
  ctrls: false
}

// DEFAULT ROOM
var state = config.get('state', {});
if (!state['default']) 
  state['default'] = Object.assign({}, defaultState );

// DEFAULT MEDIA FOLDER
var defaultMediaFolder = path.join(process.env.VIDEO_PATH, 'default');
if (!fs.existsSync(defaultMediaFolder)) {
  fs.mkdirSync(defaultMediaFolder);
  console.log('Creating video folder: ', process.env.VIDEO_PATH);
}

// SYNC Server
//
const startTime = process.hrtime();
const getTimeFunction = () => {
  const now = process.hrtime(startTime);
  return now[0] + now[1] * 1e-9;
}

const syncServer = new SyncServer(getTimeFunction);

var GLOBAL_OFFSET_TIME = 0;

// Devices
//
var devices = config.get('devices', { 'default': {} });
for (let room in devices)
  for (let uuid in devices[room]) {
    devices[room][uuid].alive = false;
    if (devices[room][uuid].mode.startsWith('guest')) 
      devices[room][uuid].resolution = {x: 400, y: 800};
    if (!devices[room][uuid].zoomdevice) devices[room][uuid].zoomdevice = 1.0;
  }

// console.log('devices', devices);

// Create a new device entry if it doesn't exist
function bootstrapDevice(uuid, room, reso) {
  if (uuid === undefined) return;
  if (room === undefined) room = 'default';

  if (!devices[room]) devices[room] = {}
  if (!state[room]) state[room] = Object.assign({}, defaultState );

  devices[room][uuid] = devices[room][uuid] || {
    room: 'default',
    position: {x: 0, y: 0}, 
    resolution: {x: 400, y: 800},
    zoomdevice: 1.0,
    alive: false,
    selected: false,
    mode: 'new' // new, fixed, guest
  };
  if (reso) devices[room][uuid].resolution = reso;
  if (room) devices[room][uuid].room = room;
  if (reso) devices[room][uuid].alive = true;
}

// Save devices to config and emit to clients
function updateDevices(room) {
  config.set('devices', devices);
  io.to(room).emit('devices', devices);
}


// Socket.io Server
//
io.on('connection', (socket) => 
{
  //console.log('a user connected');

  socket.on('disconnect', () => {
    //console.log('user disconnected');
    if (socket.uuid && devices[socket.room]) {
      devices[socket.room][socket.uuid].alive = false;
      if (socket.uuid == -1 || socket.uuid.startsWith('guest')) devices[socket.room][socket.uuid].resolution = {x: 400, y: 800};
      updateDevices(socket.room);
    }
  });

  //
  // PER-ROOM commands
  //

  // Client is ready to receive initial data
  socket.on('hi', (uuid, room, reso) => 
  {
    if (room === undefined) room = 'default';

    socket.uuid = uuid;
    socket.room = room;
    socket.join(room);
    bootstrapDevice(uuid, room, reso);
    updateDevices(room);
    socket.emit('state', state[room])
    socket.emit('playlist', playlist(room));

    // if new, try to move to a dead guest
    if (devices[room][uuid].mode === 'new') {
      for (let guestid in devices[room]) {
        if (devices[room][guestid].mode === 'guest' && !devices[room][guestid].alive) {
          io.to(room).emit('rename', uuid, guestid);
          break;
        }
      }
    }
  })
  
  // Global zoom
  socket.on('zoom', (room, z) => {
    if (room === undefined) room = 'default';

    state[room].zoom = z;
    state[room].zoom = Math.max(0.1, state[room].zoom);
    config.set('state', state);
    io.to(room).emit('state', state[room]);
  })

  // Local zoom
  socket.on('zoomdevice', (room, uuid, z) => {
    if (room === undefined) room = 'default';
    if (uuid === undefined) return;

    bootstrapDevice(uuid, room);
    devices[room][uuid].zoomdevice = z;
    updateDevices(room);
  })

  // Rename device
  socket.on('rename', (room, uuid, newuuid) => {
    if (room === undefined) room = 'default';
    if (uuid === undefined) return;
    if (newuuid === undefined) return;
    
    devices[room][newuuid] = devices[room][uuid];
    io.to(room).emit('rename', uuid, newuuid);
  })

  // Remove device
  socket.on('remove', (room, uuid) => {
    if (room === undefined) room = 'default';
    if (uuid === undefined) return;
    if (devices[room][uuid]) {
      if (uuid.startsWith('guest')) io.to(room).emit('reload', uuid);
      delete devices[room][uuid];
      updateDevices(room);
    }
  })

  // Mode
  socket.on('mode', (room, uuid, mode) => {
    if (room === undefined) room = 'default';
    if (uuid === undefined) return;
    if (mode === undefined) return;

    bootstrapDevice(uuid, room);
    devices[room][uuid].mode = mode;
    config.set('state', state);
    updateDevices(room);
  })

  // select device
  socket.on('select', (room, uuid, selected) => {
    io.to(room).emit('select', uuid, selected);
  })

  // Add guest
  socket.on('guestAdd', (room) => {
    if (room === undefined) room = 'default';
    
    var guestCount = 0;
    for (let uuid in devices[room])
      if (devices[room][uuid].mode === 'guest') guestCount++;
    while (devices[room]['guest'+guestCount]) guestCount++;
    var uuid = "guest"+guestCount
    bootstrapDevice(uuid, room, {x: 400, y: 800});
    devices[room][uuid].alive = false;
    devices[room][uuid].mode = 'guest';
    updateDevices(room);
  })

  // Move device
  socket.on('move', (uuid, room, delta) => 
  {
    if (uuid === undefined) return;
    if (room === undefined) room = 'default';

    bootstrapDevice(uuid, room);
    devices[room][uuid].position.x += delta.x;
    devices[room][uuid].position.y += delta.y;
    updateDevices(room);
    // console.log('move', uuid, room, delta, devices[room][uuid].position); 
  })

  // Move all devices
  socket.on('moveAll', (room, delta) => 
  {
    if (room === undefined) room = 'default';
    if (!devices[room]) return;

    for (let uuid in devices[room]) {
      devices[room][uuid].position.x += delta.x;
      devices[room][uuid].position.y += delta.y;
    }
    updateDevices(room);
  })

  // Set device position
  socket.on('setPosition', (uuid, room, pos) => 
  {
    if (uuid === undefined) return;
    if (room === undefined) room = 'default';

    bootstrapDevice(uuid, room);
    devices[room][uuid].position = pos;
    updateDevices(room);
  })

  // Clear devices
  socket.on('clearDevices', (room) => 
  {
    if (room === undefined) room = 'default';
    if (!devices[room]) return;

    for (let uuid in devices[room]) {
      if (devices[room][uuid].alive) devices[room][uuid].alive = false;
      else if (!uuid.startsWith('guest')) delete devices[room][uuid];
    }
    updateDevices(room);
  })

  // Toggle controls
  socket.on('toggleCtrls', (room) => 
  {
    if (room === undefined) room = 'default';
    
    state[room].ctrls = !state[room].ctrls;
    io.to(room).emit('ctrls', state[room].ctrls);
  })

  // Load and play media
  socket.on('play', (room, media) => {
    if (room === undefined) room = 'default';
    state[room].offsetTime = getTimeFunction();
    if (media !== undefined) {
      state[room].media = media;
      state[room].lastmedia = media;
    }
    else state[room].media = state[room].lastmedia;
    state[room].paused = false;
    config.set('state', state);
    io.to(room).emit('state', state[room]);
  })

  // Stop media
  socket.on('stop', (room) => {
    if (room === undefined) room = 'default';
    state[room].media = '';
    state[room].paused = false;
    config.set('state', state);
    io.to(room).emit('stop');
  })

  // Pause
  socket.on('pause', (room) => {
    if (room === undefined) room = 'default';
    state[room].paused = !state[room].paused;
    io.to(room).emit( state[room].paused ? 'pause' : 'play' );
  })

  // reloadAll
  socket.on('reloadAll', (room) => {
    io.to(room).emit('reload', 'all');
  })
  
  socket.on('state?', (room) => {
    socket.emit('state', state[room]);
  })

  //
  // CROSS-ROOM
  //

  socket.on('getrooms', () => {
    // answer is a list of 
    // { room: 'room1', videos: ['video1', 'video2', ...], state }
    let rooms = [];
    for (let room in state) rooms.push({room: room, videos: playlist(room), state: state[room]});
    socket.emit('rooms', rooms);
  })

  // Playsync all rooms
  socket.on('playsync', () => {
    
    let offsetTime = getTimeFunction();
    for (let room in state) {
      state[room].media = state[room].lastmedia
      state[room].offsetTime = offsetTime
      state[room].paused = false;
    }
    config.set('state', state);
    for (let room in state) io.to(room).emit('state', state[room]);
  })

  // Pausesync all rooms
  socket.on('pausesync', () => {
    for (let room in state) state[room].paused = true;
    config.set('state', state);
    io.emit('pause');
  })

  // Stopsync all rooms
  socket.on('stopsync', () => {
    for (let room in state) {
      state[room].media = '';
      state[room].paused = false;
    }
    config.set('state', state);
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
