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
        msg += " at " + file + ":" + line + ":" + column
    }
    if (line > 0) alert(msg)
}

// URL PARAMS
const urlParams = new URLSearchParams(window.location.search);

// UUID
//
var UUID = urlParams.get('uuid') || Cookies.get('uuid')
let urlargs = window.location.href.split('?')[1]
if (urlargs && !urlargs.includes('=')) UUID = urlargs
if (!UUID || UUID == 0) UUID = Math.random().toString(36).substring(2, 15)
Cookies.set('uuid', UUID, { expires: 3700 })
$('#uuid').text(UUID)

// SocketIO
//
const socket = io()
socket.uuid = UUID

// Get ROOM from URL
var room = urlParams.get('room') || window.location.pathname.split('#')[0].split('?')[0].split('/').pop()
if (!room) room = 'default'
socket.room = room
$('#roomname').text(room)

// set page title to room name
document.title = room + ' :: ' + UUID

// PLAYER
var player = new SyncPlayer( socket, 'body' )

socket.on('connect', () => {
    $('#logs').text('🔄 Connecting to sync server...');
});

socket.on('hello', () => {
    console.log('========= connected ===========')
    updateSize()
});

socket.on('no-room', () => {
    console.log('========= no room ===========')
    alert('This room does not exist. Please create it first !')
    // reload
    location.reload()
})

socket.on('devices', (data) => {
    console.log('devices', data)

    // not in device list: declare myself !
    if (!data || !data[UUID] || !data[UUID].alive) updateSize()

    // update my conf
    else player.updateDevice(data[UUID])
})

socket.on('state', (data) => {

    // Toggle controls
    if (data.ctrls) {
        $('#controls').show()
        $('.player').addClass('draggable')
        $('.backstage').addClass('draggable')
        $('.stage').addClass('draggable')
    }
    else {
        $('#controls').hide()
        $('.player').removeClass('draggable')
        $('.backstage').removeClass('draggable')
        $('.stage').removeClass('draggable')
    }

    // update media name
    $('#mediaplay').text(player.media)

    // update control class
    if (player.submediaplayback) {
        $('#controls').addClass('submedia')
        $('#controls').removeClass('mainmedia')
    }
    else {
        $('#controls').removeClass('submedia')
        $('#controls').addClass('mainmedia')
    }
})

socket.on('select', (selected) => {
    if (selected) $('#selected').show()
    else $('#selected').hide()
})

socket.on('reload', () => location.reload())

socket.on('setname', (newuuid) => {
    var olduuid = player.uuid
    player.uuid = newuuid
    UUID = newuuid
    if (!newuuid.startsWith('guest')) Cookies.set('uuid', UUID, { expires: 3700 })
    $('#uuid').text(UUID)
    updateSize()
    socket.emit('remove', olduuid)
})


// CONTROLS
//

$('#zoomPlusLocal').click(() => {    
    socket.emit('deviceconf', 'zoomdevice', Math.min(2, player._localzoom + 0.01))
})

$('#zoomMinusLocal').click(() => {
    socket.emit('deviceconf', 'zoomdevice', Math.max(0.1, player._localzoom - 0.01))
})

$('#reset').click(() => {
    socket.emit('deviceconf', 'position', {x: 0, y: 0})
})


// DRAG TO OFFSET VIDEO
//
player.video.on('drag', (e, delta) => {
    socket.emit('move', delta)
})

if (player.backstage)
    player.backstage.on('drag', (e, delta) => {
        socket.emit('move', delta)
    })

// ORIENTATION / RESOLUTION CHANGE
//

function updateSize() {
    if (window.innerWidth == 0 && window.innerHeight == 0) return
    $('#resolution').text(window.innerWidth+"x"+window.innerHeight)
    $('#ratio').text("ratio: "+window.devicePixelRatio)
    $('#logs').append("updateSize "+UUID+" "+room+" "+window.innerWidth+"x"+window.innerHeight+"<br>")
    console.log('updateSize', UUID, room, {x: window.innerWidth, y: window.innerHeight})

    socket.emit('hi', UUID, room, {x: window.innerWidth, y: window.innerHeight})
}
$(window).on('orientationchange resize ready', updateSize)


$('#controls').on('dblclick', (e) => {
    e.stopPropagation()
})

// CONTROLS / INFO
//

// RELOAD
$('#reload').click(() => {
    location.reload()
})

$('#fullscreen').click(() => {
    fullscreen()
})

$('#snap').click(() => {
    if (player.state.media == '') return
    socket.emit('snap', UUID, player.state.media)
})


// WELCOME BUTTON
//

$('#welcome').click(() => {
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