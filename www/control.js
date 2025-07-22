// SocketIO
//
const socket = io()

var ROOMS = []
var UUID = '_control-'+Math.random().toString(36).substring(2, 15)

// Notification function
function showNotification(message, duration = 3000) {
    const notification = $('#status_notification')
    notification.text(message)
    notification.css('opacity', '1')
    notification.show()
    
    setTimeout(() => {
        notification.css('opacity', '0')
        setTimeout(() => notification.hide(), 300)
    }, duration)
}

socket.on('connect', () => {
    socket.emit('rooms?')
})

socket.on('reload', () => {
    console.log('reload')
    location.reload()
})

// Rooms list
socket.on('rooms', (data) => {
    console.log('rooms', data)
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
        
        // Medialist individual selection
        let ul = $('<ul>').appendTo(rdiv)
        for(let v of Object.keys(room.videos)) {
            if (v.startsWith('_')) continue
            let li = $('<li>').appendTo(ul)
            let b = $('<button>').text(v).addClass('btn btn-fullwidth')
                .appendTo(li).click(() => {
                    console.log('<-play', ROOMS[k].socket.room+'/'+v)
                    ROOMS[k].socket.emit('play', ROOMS[k].socket.room+'/'+v)
                })
        }

        // Stop button
        ROOMS[k].videolist = Object.keys(room.videos).filter(v => !v.startsWith('_')).map(v => ROOMS[k].socket.room+'/'+v)
        let li = $('<li>').appendTo(ul)
        $('<button>').text('stop').addClass('btn btn-fullwidth btn-stop')
            .appendTo(li).click(() => {
                console.log('<-stop')
                ROOMS[k].socket.emit('stop')
            })

        // Mires
        for(let v of Object.keys(room.videos)) {
            if (!v.startsWith('_')) continue
            let li = $('<li>').appendTo(ul)
            let b = $('<button>').text(v).addClass('btn btn-fullwidth btn-mire')
                .appendTo(li).click(() => {
                    console.log('<-play', ROOMS[k].socket.room+'/'+v)
                    ROOMS[k].socket.emit('play', ROOMS[k].socket.room+'/'+v)
                })
        }

        // On media end, restart the same media (loop)
        ROOMS[k].player.on('end', () => {
            // Auto-restart current media for continuous loop
            if (ROOMS[k].player.media) {
                ROOMS[k].socket.emit('play', ROOMS[k].player.media)
            }
        })

        let rctrl = $('<div class="roomctrl">').appendTo(rdiv)
        // Delete room button
        $('<button>').text('delete room').addClass('btn btn-delete')
            .appendTo(rctrl).click(() => {
                if (!confirm('Are you sure you want to delete this room?')) return
                socket.emit('deleteroom', room.room)
            })

        // triggers infostate button
        $('<button>').text('infostate').addClass('btn btn-infostate')
            .appendTo(rctrl).click(() => {
                ROOMS[k].socket.emit('infostate')
            })
        
    }
})


// CONTROLS
$('#play1').click(() => {
    console.log('Play 1 - Starting first media in all rooms')
    $('#play1').text('Playing 1...')
    socket.emit('playindex', 0)
    showNotification('Starting first media in all rooms')
    setTimeout(() => $('#play1').text('Play 1'), 1000)
})

$('#play2').click(() => {
    console.log('Play 2 - Starting second media in all rooms')
    $('#play2').text('Playing 2...')
    socket.emit('playindex', 1)
    showNotification('Starting second media in all rooms')
    setTimeout(() => $('#play2').text('Play 2'), 1000)
})

$('#play3').click(() => {
    console.log('Play 3 - Starting third media in all rooms')
    $('#play3').text('Playing 3...')
    socket.emit('playindex', 2)
    showNotification('Starting third media in all rooms')
    setTimeout(() => $('#play3').text('Play 3'), 1000)
})

$('#resyncall').click(() => {
    console.log('Resync All - Resetting start offset for all rooms')
    $('#resyncall').text('Resyncing...')
    socket.emit('resyncall')
    showNotification('Resyncing all rooms to current time')
    setTimeout(() => $('#resyncall').text('Resync All'), 1000)
})

$('#stopsync').click(() => {
    socket.emit('stopsync')
    showNotification('Stopping all media playback')
})

$('#newroom').click(() => {
    let name = prompt('Enter new room name:')
    if (!name) return
    socket.emit('newroom', name)
})

$('#mediaload').click(() => {
    socket.emit('mediaload')
    $('#mediaload_overlay').show()
})


// LAUNCH INIT
var FIRST_CLICK = true
$('body').click(() => {
    if (FIRST_CLICK) {
        FIRST_CLICK = false
        for (let k in ROOMS) ROOMS[k].socket.emit('state?')
    }
})