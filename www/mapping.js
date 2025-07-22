
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

// URL PARAMS
const urlParams = new URLSearchParams(window.location.search);

//UUID
var UUID = '_mapping-'+Math.random().toString(36).substring(2, 15)

// ACTIVEMEDIA
var ACTIVEMEDIA = null

// SocketIO
//
const socket = io()
socket.uuid = UUID

// Get ROOM from URL
var room = window.location.pathname.split('/').pop()
if (!room || room == 'control') room = 'default'
socket.room = room

// Set page title to room name
document.title = room + ' :: MAPPING'
$('#roomname').text(room)

// Players
//
var player = new SyncPlayer( socket, 'body' )
var devices = new DevicePool( room, player )

var touchStart = null

// INIT 
player.scaleStage(0.5)
player.moveStage({x: 220, y: 100})


socket.on('hello', () => {
    console.log('================ hello ================')
    socket.emit('hi', UUID, room, {x: window.innerWidth, y: window.innerHeight})
});

// socket.on('zoom', (data) => {
//    player.globalzoom(data)
// })

socket.on('devices', (data) => {
    devices.update(data)
})

socket.on('medialist', (data) => {

    $('#medialist').empty()
    console.log('medialist', data)

    // convert data to array
    data = Object.keys(data).map((key) => {
        return data[key]
    })

    // Create button for each video
    data.forEach((v) => {
        if (v.file.startsWith('_')) return
        $(`<button class="btn btn-fullwidth">${v.file}</button><br />`).appendTo('#medialist')
            .on('click', () => {
                console.log('<-play', v.filepath)
                socket.emit('play', v.filepath)
            })
    })
    
    // Stop button
    $(`<button class="btn btn-fullwidth btn-stop">stop</button><br />`).appendTo('#medialist')
        .on('click', () => {
            socket.emit('stop')
        })
    
    // Create button for each mire
    data.forEach((v) => {
        if (!v.file.startsWith('_')) return
        $(`<button class="btn btn-fullwidth btn-mire">${v.file}</button><br />`).appendTo('#medialist')
            .on('click', () => {
                console.log('<-play', v.filepath)
                socket.emit('play', v.filepath)
            })
    })
})

socket.on('state', (data) => {
    // media
    ACTIVEMEDIA = {media: (data.media != '') ? data.media : data.lastmedia, mediainfo: data.mediainfo}
    $('#medianame').text(ACTIVEMEDIA.media.split('/').pop())

    // submedia per devices
    if (data.mediainfo.submedias !== undefined) devices.updateSubmedia(data.mediainfo.submedias)
})

$('#zoomPlus').click(() => {    
    console.log('zoomPlus', ACTIVEMEDIA)
    if (ACTIVEMEDIA)
        socket.emit('mediaconf', ACTIVEMEDIA.media, 'zoom', ACTIVEMEDIA.mediainfo.zoom + 0.1)
})

$('#zoomMinus').click(() => {
    if (ACTIVEMEDIA)
        socket.emit('mediaconf', ACTIVEMEDIA.media, 'zoom', Math.max(0.1, ACTIVEMEDIA.mediainfo.zoom - 0.1))
})

$('#panLeft').click(() => {
    if (ACTIVEMEDIA)
        socket.emit('mediaconf', ACTIVEMEDIA.media, 'offset', {x: ACTIVEMEDIA.mediainfo.offset.x - 10, y: ACTIVEMEDIA.mediainfo.offset.y})
})

$('#panRight').click(() => {
    console.log('panRight', ACTIVEMEDIA)
    if (ACTIVEMEDIA)
        socket.emit('mediaconf', ACTIVEMEDIA.media, 'offset', {x: ACTIVEMEDIA.mediainfo.offset.x + 10, y: ACTIVEMEDIA.mediainfo.offset.y})
})

$('#panUp').click(() => {
    if (ACTIVEMEDIA)
        socket.emit('mediaconf', ACTIVEMEDIA.media, 'offset', {x: ACTIVEMEDIA.mediainfo.offset.x, y: ACTIVEMEDIA.mediainfo.offset.y - 10})
})

$('#panDown').click(() => {
    if (ACTIVEMEDIA)
        socket.emit('mediaconf', ACTIVEMEDIA.media, 'offset', {x: ACTIVEMEDIA.mediainfo.offset.x, y: ACTIVEMEDIA.mediainfo.offset.y + 10})
})

$('#panReset').click(() => {
    if (ACTIVEMEDIA)
        socket.emit('mediaconf', ACTIVEMEDIA.media, 'offset', {x: 0, y: 0})
})

$("#ctrls").click((e) => {
    socket.emit('toggleCtrls')
})

$('#clear').click(() => {
    if (!confirm('Clear all inactive devices?')) return
    socket.emit('clearDevices')
})

$('#alive').click(() => {
    $('.device').not('.alive').toggle()
})

$('#pause').click(() => {
    socket.emit('pause')
})

$('#stop').click(() => {
    socket.emit('stop')
})

$('#camera').click(() => {
    socket.emit('play', '#camera')
})

$('#mediaBtn').click(() => {
    $('#medialist').toggle()
})

$('#guest').click(() => {
    socket.emit('guestAdd')
})

// body click
var FIRST_CLICK = true
$('body').click(() => {
    if (FIRST_CLICK) {
        FIRST_CLICK = false
        socket.emit('state?')
        console.log('resume')
    }
})

// change href
document.getElementById('browser_link').href = window.location.protocol + "//" + window.location.hostname + ":8080/";

// DRAG VIDEO -> set media offset
player.video.on('drag', (e, delta) => {
    // socket.emit('move', delta, player.uuid)
    // socket.emit('moveAll', delta)

    // var pos = {x: player.videooffset.x + delta.x*player.stagescale, y: player.videooffset.y + delta.y*player.stagescale}

})

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
    socket.emit('reloadAll')
})

// SNAP
$('#snapAll').click(() => {
    if (!ACTIVEMEDIA) return 
    if (!confirm('Create snap for all devices ?')) return
    socket.emit('snapAll', ACTIVEMEDIA.media) 
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
