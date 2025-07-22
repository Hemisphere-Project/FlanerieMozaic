import express from 'express';
import { SyncServer } from '@ircam/sync'
import { Server as HttpServer } from 'http';
import { Server as IoServer } from "socket.io";
import Conf from 'conf';
// import fs from 'fs';
import fs from 'fs/promises';
import 'dotenv/config'
import path from 'path';
import MediaManager from './MediaManager.js';
import LazyStorage from './LazyStorage.mjs';
import { info } from 'console';
const __dirname = new URL('.', import.meta.url).pathname;

// const blocked = require('blocked-at');
import blocked from 'blocked-at';
blocked((time, stack) => {
  console.log(`!!!!! Blocked for ${time}ms at:\n${stack}`);
}, { threshold: 100 }); // Alert if blocked >100ms

if (!'PORT' in process.env) process.env.PORT = 5000;
if (!'VIDEO_PATH' in process.env) { console.log('VIDEO_PATH not defined in .env'); exit(1); }
if (!'STORE_FILE' in process.env) process.env.STORE_FILE = './storage/devices.json';
if (!'MEDIA_FILE' in process.env) process.env.MEDIA_FILE = './storage/media.json';

const STORE_FILE = path.resolve(process.env.STORE_FILE);
const MEDIA_FILE = path.resolve(process.env.MEDIA_FILE);
const VIDEO_PATH = path.resolve(process.env.VIDEO_PATH);

console.log("                                                                                ")
console.log("                                                                                ")
console.log("░▒▓██████████████▓▒░ ░▒▓██████▓▒░░▒▓████████▓▒░░▒▓██████▓▒░░▒▓█▓▒░░▒▓██████▓▒░  ")
console.log("░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ ")
console.log("░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░    ░▒▓██▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░▒▓█▓▒░        ")
console.log("░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░  ░▒▓██▓▒░  ░▒▓████████▓▒░▒▓█▓▒░▒▓█▓▒░        ")
console.log("░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░░▒▓██▓▒░    ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░▒▓█▓▒░        ")
console.log("░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ ")
console.log("░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░░▒▓██████▓▒░░▒▓████████▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓██████▓▒░  ")
console.log("                                                                                ")
console.log("                                                                                ")

console.log('STORE_FILE', STORE_FILE);
console.log('MEDIA_FILE', MEDIA_FILE);
console.log('VIDEO_PATH', VIDEO_PATH);
console.log('PORT', process.env.PORT);
console.log()

const STORE = LazyStorage(STORE_FILE);
const MEDIA = MediaManager(MEDIA_FILE, VIDEO_PATH);

var app = express();
var server = HttpServer(app);
var io = new IoServer(server, {
  // Ultra-aggressive settings for local WiFi sync
  maxHttpBufferSize: 2e6,   // Larger buffer for HD content
  pingTimeout: 15000,       // Very fast timeout detection
  pingInterval: 5000,       // Ultra-frequent pings for precision
  // transports: ['websocket'], // Websocket only for lowest latency
  upgradeTimeout: 2000,     // Near-instant upgrade
  compression: false,       // Disable compression for lower latency
  allowEIO3: false,         // Force latest protocol
  perMessageDeflate: false  // Disable deflate for real-time performance
});


// DEFAULTS 
const defaultState = {
  offsetTime: 0,
  media: null,
  lastmedia: null,
  mediainfo: {},
  paused: false,
  ctrls: false,
  valid: false
}

const defaultDevice = {
  position: {x: 0, y: 0},
  resolution: {x: 400, y: 800},
  zoomdevice: 1.0,
  alive: false,
  selected: false,
  volume: 0.0,
  mode: 'new' // new, fixed, guest
}

// STORES
var ROOMS = STORE.rooms;
if (!ROOMS) ROOMS = STORE.rooms = {};

function room(roomid) {
  if (typeof roomid === 'object' && !Array.isArray(roomid) && roomid !== null && 'room' in roomid) roomid = roomid.room;  // allow to pass entire socket object
  if (!roomid || !STORE.rooms[roomid]) return {state: Object.assign({}, defaultState), devices: {}};
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
  devices[uuid] = Object.assign({'uuid': uuid}, defaultDevice, devices[uuid]);
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
  if (room === undefined) return;

  var dev = device(uuid, room);

  if (reso) {
    dev.resolution = reso;
    dev.alive = true;
  }

  return dev
}

// Debounced update functions to batch multiple rapid updates
const updateTimeouts = new Map();

function debouncedInfoState(roomid, delay = 50) {
  if (updateTimeouts.has(`state-${roomid}`)) {
    clearTimeout(updateTimeouts.get(`state-${roomid}`));
  }
  
  updateTimeouts.set(`state-${roomid}`, setTimeout(() => {
    infoState(roomid);
    updateTimeouts.delete(`state-${roomid}`);
  }, delay));
}

function debouncedInfoDevices(roomid, delay = 50) {
  if (updateTimeouts.has(`devices-${roomid}`)) {
    clearTimeout(updateTimeouts.get(`devices-${roomid}`));
  }
  
  updateTimeouts.set(`devices-${roomid}`, setTimeout(() => {
    infoDevices(roomid);
    updateTimeouts.delete(`devices-${roomid}`);
  }, delay));
}
function infoState(roomid, targetid) {
  roomid = roomid || 'default';
  targetid = targetid || roomid;

  let state = roomstate(roomid);

  let media = state.media || state.lastmedia;
  state.lastmedia = media;
  state.mediainfo = media ? MEDIA.info(media) : {};
  // console.log('infoState', roomid, state.mediainfo);

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




// Connection tracking for performance monitoring
let connectionCount = 0;
let connectionBurst = false;

// Socket.io Server
//
io.on('connection', (socket) => 
{
  connectionCount++;
  
  // Detect connection burst (more than 10 connections in 30 seconds)
  if (connectionCount > 10) {
    if (!connectionBurst) {
      console.log(`⚠️  Connection burst detected: ${connectionCount} connections`);
      connectionBurst = true;
    }
  }
  
  // Reset counter every 30 seconds
  setTimeout(() => {
    connectionCount = Math.max(0, connectionCount - 1);
    if (connectionCount <= 5) connectionBurst = false;
  }, 30000);
  socket.on('disconnect', () => {
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
  socket.on('hi', (uuid, roomid, reso) => 
  {
    uuid = String(uuid).trim();
    if (uuid === '') {
      console.error('uuid is undefined');
      socket.emit('error', 'uuid is undefined');
      return;
    }

    // invalid room
    if (!roomid || !room(roomid).valid) {
      socket.emit('no-room');
      return;
    }

    socket.uuid = uuid;
    socket.room = roomid;
    socket.join(roomid);
    socket.join(uuid);

    if (uuid.startsWith('_')) {
      // console.log('anonymous player connected');
    }
    else {
      // console.log('device connected', uuid, roomid);

      let dev = bootstrapDevice(uuid, roomid, reso);
      
      // if new, try to move to a dead guest
      if (dev.mode === 'new') {
        for (let uuid in STORE.rooms[roomid].devices) {
          if (device(uuid,roomid).mode === 'guest' && !device(uuid,roomid).alive) {
            io.to(uuid).emit('setname', guestid);
            break;
          }
        }
      }
    }

    // Use debounced updates during connection bursts
    debouncedInfoDevices(roomid, 100);
    setTimeout(() => infoState(roomid, uuid), 100);
    infoMedialist(roomid, uuid);
  })

  // Configure media
  socket.on('mediaconf', (media, key, val) => {
    if (!checkSocket(socket)) return;
    MEDIA.configure(media, key, val)
    infoState(socket.room)
  })

  // Configure device
  socket.on('deviceconf', (key, val, uuid) => {
    if (!checkSocket(socket)) return;
    uuid = uuid || socket.uuid;
    device(uuid, socket.room)[key] = val; 
    
    let dc = false
    if (key === 'position' || key === 'zoomdevice')
      dc = MEDIA.devicechanged(uuid, socket.room)

    if (dc) infoState(socket.room);
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

  // generatee submedia 
  socket.on('snap', (uuid, media) => {
    if (!checkSocket(socket)) return;
    if (!uuid) return;
    if (uuid.startsWith('guest')) return;
    if (uuid.startsWith('_')) return;

    if (media === undefined) media = roomstate(socket.room).media;

    let dev = device(uuid, socket.room);

    MEDIA.unsnap(dev, media)
    infoState(socket.room, uuid);
    var now = Date.now();

    MEDIA.snap(dev, media)
      .then(() => {
        // wait at least 2s since now
        setTimeout(() => {
          infoMedialist(socket.room);
          infoState(socket.room);
        }, Math.max(2000 - (Date.now() - now), 0));
      })
      .catch((err) => {
        console.error('Error during snap', err);
      })
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
    let dc = false;
    uuid = uuid || socket.uuid;
    // console.log('move', uuid, socket.room, delta);
    var dev = device(uuid, socket.room);
    dev.position.x += delta.x;
    dev.position.y += delta.y;

    dc = MEDIA.devicechanged(uuid, socket.room)
    if (dc) infoState(socket.room);
    infoDevices(socket.room);
  })

  // Move all devices
  socket.on('moveAll', (delta) => 
  {
    if (!checkSocket(socket)) return;
    let dc = false;
    for (let uuid in room(socket).devices) {
      let dev = device(uuid, socket);
      dev.position.x += delta.x*dev.zoomdevice;
      dev.position.y += delta.y*dev.zoomdevice;
      dc = MEDIA.devicechanged(uuid, socket.room)
    }
    if (dc) infoState(socket.room);
    infoDevices(socket.room);
  })

  // Clear devices
  socket.on('clearDevices', () => 
  {
    if (!checkSocket(socket)) return;
    let dc = false;
    for (let uuid in room(socket).devices) {
      let dev = device(uuid, socket);
      if (dev.alive) dev.alive = false;
      else if (!uuid.startsWith('guest')) {
        delete room(socket).devices[uuid];
        dc = MEDIA.devicechanged(uuid, socket.room)
      }
    }
    if (dc) infoState(socket.room);
    infoDevices(socket.room);
  })

  // Toggle controls
  socket.on('toggleCtrls', () => 
  {
    if (!checkSocket(socket)) return;
    roomstate(socket).ctrls = !roomstate(socket).ctrls
    infoState(socket.room);
  })

  // Infostate
  socket.on('infostate', () => 
  {
    if (!checkSocket(socket)) return;
    infoState(socket.room);
    console.log('infostate', socket.room);
  })

  // Load and play media
  socket.on('play', (media) => {
    if (!checkSocket(socket)) return;
    var state = roomstate(socket)
    state.offsetTime = getTimeFunction();
    if (media !== undefined) state.media = media;
    else state.media = state.lastmedia;
    state.paused = false;
    infoState(socket.room);
    // console.log('play', media, roomstate(socket));
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

  // snapAll
  socket.on('snapAll', (media) => {
    if (!checkSocket(socket)) return;

    for (let uuid in room(socket).devices) {
      let dev = device(uuid, socket);
      MEDIA.unsnap(dev, media)
    }
    infoState(socket.room);
    var now = Date.now();
    

    async function snapAll() {
      for (let uuid in room(socket).devices) {
        let dev = device(uuid, socket);
        await MEDIA.snap(dev, media).then(() => {
          // wait at least 2s since now
          setTimeout(() => {
            infoMedialist(socket.room);
            infoState(socket.room);
          }, Math.max(2000 - (Date.now() - now), 0));
        })
        .catch((err) => {
          console.error('Error during snap', err);
        })
      }
    } 

    snapAll()

    //
    
    // let allPromises = [];
    // for (let uuid in room(socket).devices) {
    //   let dev = device(uuid, socket);
    //   allPromises.push( MEDIA.snap(dev, media) )
    // }

    
    

    // do each snap sequentially
    // allPromises = allPromises.reduce((p, fn) => p.then(fn), Promise.resolve());

    // Promise.all(allPromises)
    //   .then(() => {
    //     // wait at least 2s since now
    //     setTimeout(() => {
    //       infoMedialist(socket.room);
    //       infoState(socket.room);
    //     }, Math.max(2000 - (Date.now() - now), 0));
    //   })
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

  socket.on('newroom', (roomid) => {
    if (!roomid) return
    if (ROOMS[roomid]) return
    console.log('new room', roomid);
    STORE.rooms[roomid] = {state: Object.assign({}, defaultState), devices: {}};
    STORE.rooms[roomid].valid = true;
    STORE._save();
    MEDIA.addRoom(roomid);
    socket.emit('reload');
  })

  socket.on('deleteroom', (roomid) => {
    if (!roomid) return
    if (!ROOMS[roomid]) return
    console.log('delete room', roomid);
    delete STORE.rooms[roomid];
    STORE._save();
    socket.emit('reload');
  })

  socket.on('mediaload', () => {
    MEDIA.load()
    socket.emit('reload');
  })

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

  // Play indexed media across all rooms with shared sync
  socket.on('playindex', (index) => {
    let offsetTime = getTimeFunction();
    console.log('playindex command received for index:', index);
    
    for (let roomid in STORE.rooms) {
      try {
        // Get media list for this room (excluding those starting with _)
        let mediaList = Object.keys(MEDIA.medialist(roomid)).filter(v => !v.startsWith('_'));
        console.log('Room', roomid, 'media list:', mediaList);
        
        if (index < mediaList.length && index >= 0) {
          // Play the media at the specified index
          let media = roomid + '/' + mediaList[index];
          roomstate(roomid).media = media;
          roomstate(roomid).offsetTime = offsetTime;
          roomstate(roomid).paused = false;
          console.log('playindex', index, roomid, media, 'at time', offsetTime);
        } else {
          // No media at this index, stop playback
          roomstate(roomid).media = null;
          console.log('playindex', index, roomid, 'no media at index - stopping');
        }
        infoState(roomid);
      } catch (error) {
        console.error('Error in playindex for room', roomid, ':', error);
      }
    }
  })

  // Resync all rooms
  socket.on('resyncall', () => {
    let offsetTime = getTimeFunction();
    console.log('resyncall command received, new sync time:', offsetTime);
    
    let syncedRooms = 0;
    for (let roomid in STORE.rooms) {
      try {
        if (roomstate(roomid).media) {
          roomstate(roomid).offsetTime = offsetTime;
          roomstate(roomid).paused = false;
          console.log('resyncall - room', roomid, 'media:', roomstate(roomid).media, 'synced to time:', offsetTime);
          infoState(roomid);
          syncedRooms++;
        } else {
          console.log('resyncall - room', roomid, 'has no active media, skipping');
        }
      } catch (error) {
        console.error('Error in resyncall for room', roomid, ':', error);
      }
    }
    console.log('resyncall completed for', syncedRooms, 'rooms');
  })

  // SYNC Server - ultra-aggressive for local WiFi perfect sync
  const syncInitDelay = Math.random() * 500; // Reduced to 0.5s for fastest sync startup
  
  setTimeout(() => {
    syncServer.start( 
      (...args) => { socket.emit('pong', ...args) },  // send  
      (callback) => { socket.on('ping', (...args) => { callback(...args) }) },  // receive
    );
  }, syncInitDelay);
  
  // Send initial HELLO trigger immediately
  socket.emit('hello');

});


// Express Server
//

server.listen(process.env.PORT, function() {
  console.log('\nSERVER: listening on *:' + process.env.PORT);
});

app.get(['/qr', '/qrcode'], function(req, res) {
  res.sendFile(__dirname + '/www/qr.html');
});

app.get('/mapping/:room', function(req, res) {
  res.sendFile(__dirname + '/www/mapping.html');
});

app.get('/mapping', function(req, res) {
  res.redirect('/control');
});

app.get('/control', function(req, res) {
  res.sendFile(__dirname + '/www/control.html');
});

app.get(['/ply/:room', '/p/:room', '/player/:room'], function(req, res) {
  let roomid = req.params.room;
  console.log('ply', roomid);
  if (!roomid || !ROOMS[roomid]) {
    // send text "This room does not exist"
    res.status(404).send('This room does not exist');
  }
  else res.sendFile(__dirname + '/www/index.html');
});

// app.get('/', function(req, res) {
//   res.redirect('/control');
// });




// Serve static files /static
app.use('/static', express.static('www'));
// app.use('/media', express.static(VIDEO_PATH));



// const { createReadStream } = require('fs');
import { createReadStream } from 'fs';

// Security: Validate and sanitize file paths
const sanitizePath = (userPath) => {
  const relativePath = path.normalize(userPath).replace(/^(\.\.(\/|\\|$))+/, '');
  return path.join(VIDEO_PATH, relativePath);
};

app.get('/media/*', async (req, res) => {
  try {
    const subPath = req.params[0]; // Captures everything after /media/
    const fullPath = sanitizePath(subPath);
    
    // Verify the resolved path is within allowed directory
    if (!fullPath.startsWith(path.resolve(VIDEO_PATH))) {
      return res.status(403).send('Forbidden');
    }

    const stat = await fs.stat(fullPath);
    
    // Handle range requests (crucial for media streaming)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

      if (start >= stat.size || end >= stat.size) {
        res.status(416).header('Content-Range', `bytes */${stat.size}`).send();
        return;
      }

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=31536000'
      });

      createReadStream(fullPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=31536000'
      });
      createReadStream(fullPath).pipe(res);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).send('File not found');
    } else {
      console.error('Stream error:', error);
      res.status(500).send('Server error');
    }
  }
});
