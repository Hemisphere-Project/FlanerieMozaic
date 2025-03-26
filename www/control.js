// SocketIO
//
const socket = io()

var ROOMS = []

socket.on('connect', () => {
    socket.emit('rooms?')
})

// Rooms list
socket.on('rooms', (data) => {
    $('#rooms').empty()

    // clear previous rooms
    // TODO

    ROOMS = data

    for(let k in ROOMS) 
    {
        let room = ROOMS[k]

        ROOMS[k].socket = io('/', {'force new connection': true})
        ROOMS[k].socket.on('hello', () => {
            console.log(`================ hello : ${room.room} ================`)
            ROOMS[k].socket.emit('hi', -1, room.room, {x: window.innerWidth, y: window.innerHeight})
        });  

        let rdiv = $('<div>').addClass('room').appendTo('#rooms')
        $('<h2>').text(room.room).appendTo(rdiv).on('click', () => { window.open('/mapping/'+room.room) })
        $('<br />').appendTo(rdiv)
        
        // Miniplayer
        let playerDiv = $('<div>').addClass('miniplayer').appendTo(rdiv)
        ROOMS[k].player = new SyncPlayer( ROOMS[k].socket, -1, playerDiv )

        // Playlist
        let ul = $('<ul>').appendTo(rdiv)
        for(let v of room.videos) {
            let li = $('<li>').appendTo(ul)
            $('<button>').text(v).addClass('btn btn-fullwidth')
                .appendTo(li).click(() => {
                    socket.emit('play', v)
                })
        }
    }
})


// CONTROLS
$('#playsync').click(() => {
    socket.emit('playsync')
})

$('#stopsync').click(() => {
    socket.emit('stopsync')
})


// LAUNCH INIT
var FIRST_CLICK = true
$('body').click(() => {
    if (FIRST_CLICK) {
        FIRST_CLICK = false
        for (let k in ROOMS) ROOMS[k].socket.emit('state?')
    }
})