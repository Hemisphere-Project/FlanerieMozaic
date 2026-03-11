// SocketIO
//
const socket = io()

var ROOMS = []
var UUID = '_control-'+Math.random().toString(36).substring(2, 15)

// Check HTTPS cert acceptance for HTTP/2 video serving
;(function checkH2Cert() {
    const host = window.location.hostname
    if (host !== '10.0.0.1' && host !== '10.0.0.2') return
    const testUrl = 'https://' + host + ':8443/'
    fetch(testUrl, {mode: 'no-cors'}).catch(() => {
        // Show a clickable banner (user click = allowed popup)
        const banner = $('<div id="cert_banner">⚠ Video previews require accepting the HTTPS certificate. <a href="' + testUrl + '" target="_blank">Click here to accept it</a>, then reload this page.</div>')
        $('body').prepend(banner)
    })
})()

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

// FFmpeg toast
socket.on('ffmpeg-status', (jobs) => {
    const toast = $('#ffmpeg_toast')
    toast.empty()
    for (let j of jobs) {
        let cls = 'job' + (j.status === 'done' ? ' done' : j.status === 'error' ? ' error' : '')
        $('<div>').addClass(cls).text(`${j.type} ${j.description} — ${j.status}`).appendTo(toast)
    }
})

// Thumbvideo-aware play helper
function playIndex(index) {
    socket.emit('thumbvideo-status?', index, (statusMap) => {
        let missing = Object.keys(statusMap).filter(r => !statusMap[r])
        if (missing.length === 0) {
            socket.emit('playindex', index)
            return
        }
        if (confirm(`Thumbvideos missing for: ${missing.join(', ')}.\nGenerate them now?`)) {
            // Build entries list from rooms data
            let entries = []
            for (let k in ROOMS) {
                let room = ROOMS[k]
                let videos = Object.keys(room.videos).filter(v => !v.startsWith('_'))
                if (index < videos.length && !statusMap[room.room]) {
                    entries.push({ room: room.room, media: videos[index] })
                }
            }
            socket.emit('generateThumbvideos', entries)
            showNotification('Thumbvideo generation started — play will use thumbvideos once ready')
        }
        // Play full-res anyway
        socket.emit('playindex', index)
    })
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

    // clear previous room sockets
    for (let k in ROOMS) {
        if (ROOMS[k].socket) ROOMS[k].socket.disconnect()
    }

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
    playIndex(0)
    showNotification('Starting first media in all rooms')
    setTimeout(() => $('#play1').text('Play 1'), 1000)
})

$('#play2').click(() => {
    console.log('Play 2 - Starting second media in all rooms')
    $('#play2').text('Playing 2...')
    playIndex(1)
    showNotification('Starting second media in all rooms')
    setTimeout(() => $('#play2').text('Play 2'), 1000)
})

$('#play3').click(() => {
    console.log('Play 3 - Starting third media in all rooms')
    $('#play3').text('Playing 3...')
    playIndex(2)
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