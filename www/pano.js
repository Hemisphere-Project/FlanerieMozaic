feather.replace();

$('#logs').text("hello")

// LOGS
window.onerror = function (message, file, line, column, errorObj) {
    var msg = "ERROR:"
    if (errorObj) {
        msg += message+ " "
        msg += errorObj.stack
    }
    else {
        msg += message
        msg += " at " + file + ":" + line
    }
    alert(msg)
}

// URL PARAMS
const urlParams = new URLSearchParams(window.location.search);

// UUID
//
var uuid = urlParams.get('uuid') || Cookies.get('uuid') || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
if (!uuid || uuid == 0) uuid = Math.random().toString(36).substring(2, 15)
Cookies.set('uuid', uuid, { expires: 3700 })
$('#uuid').text(uuid)
// $('#uuid').text(urlParams)

// SocketIO
//
const socket = io()

// Get ROOM from URL
var room = urlParams.get('room') || window.location.pathname.split('#')[0].split('?')[0].split('/').pop()
if (!room) room = 'default'
console.log('room', room)

// set page title to room name
document.title = room + ' :: ' + uuid

// PLAYER
var player = new SyncPlayer( socket, uuid, 'body' )

socket.on('hello', () => {
    console.log('========= connected ===========')
    updateSize()
});

socket.on('devices', (data) => {
    console.log('devices', data)
    if (!data[room] || !data[room][uuid] || !data[room][uuid].alive) updateSize()
    else player.updateConf(data[room][uuid])
})

socket.on('ctrls', (data) => {
    console.log('ctrls', data)
    if (data) {
        $('#controls').show()
        $('.player').addClass('draggable')
    }
    else {
        $('#controls').hide()
        $('.player').removeClass('draggable')
    }
})

socket.on('state', (data, from) => {
    console.log('state', data, from)
    if (data.ctrls) {
        $('#controls').show()
        $('.player').addClass('draggable')
    }
    else {
        $('#controls').hide()
        $('.player').removeClass('draggable')
    }
})

socket.on('select', (uuid, selected) => {
    if (uuid == player.uuid) {
        if (selected) $('#selected').show()
        else $('#selected').hide()
    }
})

socket.on('reload', (uuid) => {
    if (uuid == player.uuid || uuid == 'all') location.reload()
})

socket.on('rename', (olduuid, newuuid) => {
    if (olduuid == uuid) {
        player.uuid = newuuid
        uuid = newuuid
        if (!newuuid.startsWith('guest')) Cookies.set('uuid', uuid, { expires: 3700 })
        $('#uuid').text(uuid)
        updateSize()
        socket.emit('remove', room, olduuid)
    }
})


// CONTROLS
//

$('#zoomPlusLocal').click(() => {    
    socket.emit('zoomdevice', room, uuid, player._localzoom + 0.01)
})

$('#zoomMinusLocal').click(() => {
    socket.emit('zoomdevice', room, uuid, Math.max(0.1, player._localzoom - 0.01))
})

$('#reset').click(() => {
    socket.emit('setPosition', uuid, room, {x: 0, y: 0})
})


// DRAG TO OFFSET VIDEO
//
player.video.on('drag', (e, delta) => {
    socket.emit('move', uuid, room, delta)
})

if (player.backstage)
    player.backstage.on('drag', (e, delta) => {
        socket.emit('move', uuid, room, delta)
    })

// ORIENTATION / RESOLUTION CHANGE
//

function updateSize() {
    if (window.innerWidth == 0 && window.innerHeight == 0) return
    $('#resolution').text(window.innerWidth+"x"+window.innerHeight)
    $('#ratio').text("ratio: "+window.devicePixelRatio)
    $('#logs').append("updateSize "+uuid+" "+room+" "+window.innerWidth+"x"+window.innerHeight+"<br>")
    console.log('updateSize', uuid, room, {x: window.innerWidth, y: window.innerHeight})
    socket.emit('hi', uuid, room, {x: window.innerWidth, y: window.innerHeight})
}
$(window).on('orientationchange resize ready', updateSize)

// SCROLL TO SCALE #player
//
// window.addEventListener("wheel", event => {
//     const sign = Math.sign(event.deltaY);
//     let s = Math.max(0.1, player.videoscale - sign * 0.1);
//     socket.emit('zoom', room, s)
//     // console.log(stagescale)
// });

// DOUBLE CLICK MENU
//
// $(window).on('dblclick', () => {
//     $('#controls').toggle()
//     $('.player').toggleClass('draggable')
// })
$('#controls').on('dblclick', (e) => {
    e.stopPropagation()
})


// CONTROLS / INFO
//

// RELOAD
$('#reload').click(() => {
    location.reload()
})

// PWA
// if ("serviceWorker" in navigator) {
//     window.addEventListener("load", function() {
//       navigator.serviceWorker
//         .register("/serviceWorker.js")
//         .then(res => console.log("service worker registered"))
//         .catch(err => console.log("service worker not registered", err))
//     })
//   }

$('#fullscreen').click(() => {
    fullscreen()
})


// WELCOME BUTTON
//

$('#go').click(() => {

    // if (mobileAndTabletCheck())
    $('#welcome').hide()
    wakeLock()
    fullscreen() 
    player.play()
})

setTimeout(() => {
    if (urlParams.has('go')) $('#go').click()
}, 1000)

// MISC
//
$(document).on('contextmenu', function (e) {
    e.preventDefault()
    return false;
});