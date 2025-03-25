
// // Browserified + Babelified version of https://github.com/chrisguttandin/timing-provider
// // Connecting to local server https://github.com/chrisguttandin/timing-provider-server
// const timingProvider = new TimingProvider('ws://10.2.8.99:4567');  
// // timing object
// var to = new TIMINGSRC.TimingObject({provider:timingProvider});

// // set up video sync
// var sync1 = MCorp.mediaSync(document.getElementById('player1'), to);

// // set up video sync
// var sync2 = MCorp.mediaSync(document.getElementById('player2'), to);


// CONTROL PAGE
feather.replace();

//UUID
const uuid = 0;

// SocketIO
//
const socket = io()

// Get ROOM from URL
var room = window.location.pathname.split('/').pop()
if (!room || room == 'control') room = 'default'
console.log('room', room)

// Set page title to room name
document.title = room + ' :: MAPPING'
$('#roomname').text(room)

// Players
//
var player = new SyncPlayer( socket, uuid, 'body' )
var devices = new DevicePool( room, player )

var touchStart = null

// INIT 
player.scaleStage(0.5)
player.moveStage({x: 220, y: 100})


socket.on('hello', () => {
    console.log('================ hello ================')
    socket.emit('hi', uuid, room, {x: window.innerWidth, y: window.innerHeight})
});

socket.on('zoom', (data) => {
   player.globalzoom(data)
})

socket.on('devices', (data) => {
    devices.update(data)
})

socket.on('playlist', (data) => {
    // Create button for each video
    $('#playlist').empty()
    data.forEach((v) => {
        $('#playlist').append(`<button class="btn btn-fullwidth" onclick="socket.emit('play', '${room}', '${v}')">${v}</button><br />`)
    })
})

$('#zoomPlus').click(() => {    
    socket.emit('zoom', room, player.videoscale + 0.1)
})

$('#zoomMinus').click(() => {
    socket.emit('zoom', room, Math.max(0.1, player.videoscale - 0.1))
})

$("#ctrls").click((e) => {
    socket.emit('toggleCtrls', room)
})

$('#clear').click(() => {
    if (!confirm('Clear all inactive devices?')) return
    socket.emit('clearDevices', room)
})

$('#alive').click(() => {
    $('.device').not('.alive').toggle()
})

$('#pause').click(() => {
    socket.emit('pause', room)
})

$('#stop').click(() => {
    socket.emit('stop', room)
})

$('#camera').click(() => {
    socket.emit('play', room, '#camera')
})

$('#mediaBtn').click(() => {
    $('#playlist').toggle()
})

$('#guest').click(() => {
    socket.emit('guestAdd', room)
})

// body click
var FIRST_CLICK = true
$('body').click(() => {
    if (FIRST_CLICK) {
        FIRST_CLICK = false
        socket.emit('state?', room)
        console.log('resume')
    }
})

// change href
document.getElementById('browser_link').href = window.location.protocol + "//" + window.location.hostname + ":8080/";

// DRAG VIDEO -> MOVE ALL DEVICES
// player.video.on('drag', (e, delta) => {
//     // socket.emit('move', uuid, delta)
//     socket.emit('moveAll', room, delta)

//     delta = {x: delta.x*player.stagescale, y: delta.y*player.stagescale}
//     player.moveStage(delta)
// })

// DOUBLE CLICK VIDEO => SELECT ALL DEVICES
// player.video.on('dblclick', (e) => {
//     devices.toggleSel()
// })

// CATCH DBLC CLICK #controls
$('#controls').on('dblclick', (e) => {
    e.stopPropagation()
})

// DRAG VIDEO -> DRAG STAGE
player.video.on('drag', (e, delta) => {
    player.moveStage(delta)
})

// DOUBLE CLICK STAGE => SELECT ALL DEVICES
player.backstage.on('dblclick', (e) => {
    devices.toggleSel()
})

// DRAG STAGE
player.backstage.on('drag', (e, delta) => {
    player.moveStage(delta)
})

// SCROLL TO SCALE STAGE
window.addEventListener("wheel", event => {
    const sign = Math.sign(event.deltaY);
    let s = Math.max(0.1, player.stagescale - sign * 0.1);
    player.scaleStage(s)
    // console.log(stagescale)
});

document.getElementById('controls').addEventListener('wheel', (e) => {
    e.stopPropagation()
})


// CONTROLS / INFO
//

// RELOAD
$('#reloadAll').click(() => {
    if (!confirm('Reload all devices?')) return
    socket.emit('reloadAll', room)
})

// SELECT
$('#selectAll').click(() => {
    devices.toggleSel()
})


// KEYBOARD CONTROL
//

// arrow key to move
$('body').on('keydown', (e)=>{
    var deltaPos = {x: 0, y: 0}
    if (e.key == 'ArrowUp') deltaPos.y = -1
    if (e.key == 'ArrowDown') deltaPos.y = 1
    if (e.key == 'ArrowLeft') deltaPos.x = -1
    if (e.key == 'ArrowRight') deltaPos.x = 1
    if (deltaPos.x || deltaPos.y)
        $('.selected').each((i, e) => {
            $(e).triggerHandler('drag', deltaPos)
        })

    var deltaZoom = 0
    if (e.key == '+') deltaZoom = 0.01
    if (e.key == '-') deltaZoom = -0.01
    if (deltaZoom)
        $('.selected').each((i, e) => {
            $(e).triggerHandler('zoomdelta', deltaZoom)
        })
})
