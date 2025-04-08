// SocketIO
//
const socket = io()

var ROOMS = []
var UUID = '_control-'+Math.random().toString(36).substring(2, 15)

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
        ROOMS[k].socket.uuid = UUID+'-'+k
        ROOMS[k].socket.room = room.room

        ROOMS[k].socket.on('hello', () => {
            console.log(`================ hello : ${room.room} ================`)
            ROOMS[k].socket.emit('hi', ROOMS[k].socket.uuid, room.room, {x: window.innerWidth, y: window.innerHeight})
        });  

        let rdiv = $('<div>').addClass('room').appendTo('#rooms')
        $('<h2>').text(room.room).appendTo(rdiv).on('click', () => { window.open('/mapping/'+room.room) })
        $('<br />').appendTo(rdiv)
        
        // Miniplayer
        let playerDiv = $('<div>').addClass('miniplayer').appendTo(rdiv)
        ROOMS[k].player = new SyncPlayer( ROOMS[k].socket, playerDiv )

        // Reorder room.videos to put the starting with '_' first
        room.videos.sort((a, b) => {
            if (a.startsWith('_') && !b.startsWith('_')) return -1
            if (!a.startsWith('_') && b.startsWith('_')) return 1
            return 0
        })

        // Medialist individual selection
        let ul = $('<ul>').appendTo(rdiv)
        for(let v of room.videos) {
            let li = $('<li>').appendTo(ul)
            let b = $('<button>').text(v).addClass('btn btn-fullwidth')
                .appendTo(li).click(() => {
                    console.log('<-playlist', ROOMS[k].socket.room+'/'+v)
                    ROOMS[k].player.playlist.load([ROOMS[k].socket.room+'/'+v], LOOP_ALL)
                })
            if (v.startsWith('_')) b.addClass('btn-mire')
        }

        // On Playlist end reload all playlists (if play synced)
        ROOMS[k].player.playlist.on('end', () => {
            if (ROOMS[k].player.playlist.loop != LOOP_NONE) return
            let synced_rooms = ROOMS.filter(r => r.player.playlist.loop == LOOP_NONE)
            for (let r of synced_rooms) r.player.playlist.reload() 
            socket.emit('playsync', ROOMS.filter(r => r.player.playlist.loop != LOOP_NONE).map(r => r.room))
        })

        // Playlist button
        ROOMS[k].videolist = room.videos.filter(v => !v.startsWith('_')).map(v => ROOMS[k].socket.room+'/'+v)
        let li = $('<li>').appendTo(ul)
        $('<button>').text('playlist').addClass('btn btn-fullwidth btn-playlist')
            .appendTo(li).click(() => {
                console.log('<-playlist', ROOMS[k].videolist)
                ROOMS[k].player.playlist.load(ROOMS[k].videolist, LOOP_ALL)
            })
    }
})


// CONTROLS
$('#playsync').click(() => {
    for(let k in ROOMS) {   
        ROOMS[k].player.playlist.loop = LOOP_NONE
        ROOMS[k].player.playlist.reload()
    }
    socket.emit('playsync')
})

$('#stopsync').click(() => {
    socket.emit('stopsync')
})

$('#listsync').click(() => {
    for(let k in ROOMS) ROOMS[k].player.playlist.load(ROOMS[k].videolist, LOOP_ALL)
    socket.emit('playsync')
})


// LAUNCH INIT
var FIRST_CLICK = true
$('body').click(() => {
    if (FIRST_CLICK) {
        FIRST_CLICK = false
        for (let k in ROOMS) ROOMS[k].socket.emit('state?')
    }
})