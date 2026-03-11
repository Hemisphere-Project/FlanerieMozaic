// Global load queue: serialize video loads so each fully buffers before the next starts,
// avoiding HTTP/1.1 connection exhaustion (browsers limit ~6 connections per origin)
// Disabled when HTTP/2 is available (_control pages use port 8443)
const _loadQueue = []
let _loadActive = 0
const _loadMax = 1

function _processLoadQueue() {
    while (_loadActive < _loadMax && _loadQueue.length > 0) {
        const job = _loadQueue.shift()
        _loadActive++
        job.run().finally(() => {
            _loadActive--
            _processLoadQueue()
        })
    }
}

class VideoPlayer extends EventEmitter {
    
    // constructor
    constructor(uuid, container) 
    {
        super();

        // state
        this.media = '';
        this.playing = false;
        this.paused = false;
        this.ended = false;

        this.uuid = uuid
        this.container = $(container);
        this.backstage = null
        this.stage = null
        this.origin = null
        
        this.submediaplayback = false
        
        
        // the video element
        this.video = $('<video class="player draggable" preload="auto" loop playsinline></video>')
        this.video.attr('uuid', uuid)

        // Add ended event listener for continuous looping
        this.video.on('ended', () => {
            if (this.media && this.playing) {
                console.log('Video ended, restarting for continuous loop')
                this.video[0].currentTime = 0
                this.video[0].play()
            }
        })

        
        // Full backstage/stage/origin layered player
        //
        let target = this.container
        if (!uuid.startsWith('_control')) 
        {
            this.backstage = $('<div class="backstage draggable"></div>').appendTo(this.container);
            this.backstage.attr('uuid', uuid)
            
            this.stage = $('<div class="stage draggable"></div>').appendTo(this.backstage);
            this.stage.attr('uuid', uuid)
            this.stagescale = 1.0
            this.stageoffset = {x: 0, y: 0}
            this.scaleStage(1.0)

            // add origin cross to stage
            if (uuid.startsWith('_mapping'))
                this.origin = $('<div class="origin"></div>').appendTo(this.stage)
            
            target = this.stage
        }
        this.video.appendTo(target);

        // Muted for controlers / mappers
        if (uuid.startsWith('_')) this.volume(0.0)
        else this.volume(1.0)

        this.video.on('ended', () => {
            this.stop(false)
            this.emit('end')
        })

        this._globalzoom = 1.0
        this._localzoom = 1.0

        this._globalposition = {x: 0, y: 0}
        this._localposition = {x: 0, y: 0}

        this.globalposition({x: 0, y: 0})
        this.globalzoom(1.0)

        this.devicemode = 'new'
    }

    // stage scale 0->1
    scaleStage(s) {
        // console.log('scale', s)
        $('#scale').text( Math.round(s*100) +"%")
        this.stagescale = Math.max(0.1, s)
        this.stage.css('transform', 'scale('+this.stagescale+') translate('+this.stageoffset.x/this.stagescale+'px, '+this.stageoffset.y/this.stagescale+'px)')
    }

    // stage move
    moveStage(delta) {
        // console.log('move', delta)
        this.stageoffset.x += delta.x
        this.stageoffset.y += delta.y
        this.stage.css('transform', 'scale('+this.stagescale+') translate('+this.stageoffset.x/this.stagescale+'px, '+this.stageoffset.y/this.stagescale+'px)')
    }

    // video css
    setvideocss() {
        if (this.submediaplayback) {
            this.video.addClass('maxiplayer')
            let scale = this._globalzoom* this._localzoom
            this.video.css('transform', 'scale('+scale+') translate( 0px, 0px)')
        }
        else {
            this.video.removeClass('maxiplayer')
            let scale = this._globalzoom * this._localzoom
            let x = (this._localposition.x + this._globalposition.x * this._localzoom ) / scale
            let y = (this._localposition.y + this._globalposition.y * this._localzoom) / scale
            this.video.css('transform', 'scale('+scale+') translate('+x+'px, '+y+'px)')
        }
    }
        

    // global video zoom
    globalzoom(z) {
        // console.log('zoom', z)
        this._globalzoom = Math.max(0.1, z)
        $('#zoom').text( Math.round(this._globalzoom*100) +"%")
        this.setvideocss()
    }

    // local device zoom
    localzoom(z) {
        // console.log('zoom', z)
        this._localzoom = Math.max(0.1, z)
        $('#zoomdevice').text( Math.round(this._localzoom*100) +"%")
        this.setvideocss()
    }

    // global video position
    globalposition(pos) {
        pos.x = Math.round(pos.x)
        pos.y = Math.round(pos.y)
        this._globalposition = pos
        // console.log('position', pos)
        this.setvideocss()
    }

    // local video position
    localposition(pos) {
        pos.x = Math.round(pos.x)
        pos.y = Math.round(pos.y)
        this._localposition = pos
        // console.log('position', pos)
        $('#x').text(pos.x+" px")
        $('#y').text(pos.y+" px")
        this.setvideocss()
    }

    // submedia mode (fullscreen with no zoom/offset)
    setsubmediamode(mode) {
        this.submediaplayback = mode
        this.setvideocss()
    }

    // mode
    mode(m) {
        this.devicemode = m
        $('#mode').text(m)
    }

    // update
    updateDevice(data) {
        console.log('UPDATE', data)
        this.localposition(data.position)
        this.localzoom(data.zoomdevice)
        this.mode(data.mode)
        if ('volume' in data) this.volume(data.volume)
    }

    load(media) {
        if (media == this.media) return
        this.media = media

        if (this.media == '#camera') 
        {
            this._loadReady = navigator.mediaDevices.getUserMedia({video: true})
                .then((stream) => {
                    this.video[0].srcObject = stream;
                    this.video[0].play()
                })
                .catch((error) => {
                    console.error(error.name + ': ' + error.message);
                });
        } 
        else 
        {   
            this._loadReady = this._loadSource(media)
        }
        console.log('load', media, 'src:', this.video.attr('src'))
    }

    _loadSource(media) {
        if (this.video[0].srcObject) {
            this.video[0].srcObject.getTracks().forEach(track => track.stop());
            this.video[0].srcObject = null
        }
        let src = '/media/'+media
        
        // Serve media from NGINX
        if (window.location.href.indexOf('10.0.0.1') != -1 || window.location.href.indexOf('10.0.0.2') != -1) {
            let host = window.location.href.indexOf('10.0.0.1') != -1 ? '10.0.0.1' : '10.0.0.2'
            // Control pages use HTTPS/HTTP2 port to avoid connection limit
            if (this.uuid.startsWith('_control'))
                src = 'https://'+host+':8443/'+media
            else
                src = 'http://'+host+':8888/'+media
        }

        // Control pages bypass queue (HTTP/2 handles multiplexing)
        if (this.uuid.startsWith('_control')) {
            this.video.attr('src', src)
            this.video[0].load()
            this.video[0].pause()
            return new Promise((resolve, reject) => {
                const cleanup = () => {
                    this.video[0].removeEventListener('loadedmetadata', onReady)
                    this.video[0].removeEventListener('error', onError)
                }
                const onReady = () => { cleanup(); resolve() }
                const onError = () => {
                    cleanup()
                    console.error('Failed to load', media)
                    reject(new Error('Failed to load media: ' + media))
                }
                this.video[0].addEventListener('loadedmetadata', onReady, {once: true})
                this.video[0].addEventListener('error', onError, {once: true})
            })
        }

        // Non-control: queue loads to respect HTTP/1.1 connection limit
        return new Promise((resolve, reject) => {
            const job = {
                run: () => {
                    if (this.media !== media) { resolve(); return Promise.resolve() }
                    this.video.attr('src', src)
                    this.video[0].load()
                    this.video[0].pause()
                    return new Promise((queueDone) => {
                        const cleanup = () => {
                            this.video[0].removeEventListener('loadedmetadata', onMeta)
                            this.video[0].removeEventListener('progress', onProgress)
                            this.video[0].removeEventListener('error', onError)
                        }
                        const onMeta = () => {
                            resolve()
                        }
                        const onProgress = () => {
                            const buf = this.video[0].buffered
                            const dur = this.video[0].duration
                            if (buf.length > 0 && dur > 0 && buf.end(buf.length - 1) >= dur - 0.5) {
                                cleanup()
                                queueDone()
                            }
                        }
                        const onError = () => {
                            cleanup()
                            console.error('Failed to load', media)
                            reject(new Error('Failed to load media: ' + media))
                            queueDone()
                        }
                        this.video[0].addEventListener('loadedmetadata', onMeta, {once: true})
                        this.video[0].addEventListener('progress', onProgress)
                        this.video[0].addEventListener('error', onError, {once: true})
                        setTimeout(() => { cleanup(); queueDone() }, 15000)
                    })
                }
            }
            _loadQueue.push(job)
            _processLoadQueue()
        })
    }

    play(media) {
        if (media && media != this.media) this.load(media)
        else if (this.media == '') return Promise.resolve()
        console.log('play!')

        // Wait for source to be loaded before playing
        const doPlay = () => this._doPlay()
        if (this._loadReady) {
          return this._loadReady.then(doPlay).catch(err => {
            console.warn('Load not ready, will retry on next sync:', err.message)
            return Promise.resolve()
          })
        }

        return this._doPlay()
    }

    _doPlay() {
        this.video[0].currentTime = 0
        this.video[0].style.visibility = 'visible'
        
        // Return the promise from play() to handle interruptions
        const playPromise = this.video[0].play()
        if (playPromise !== undefined) {
          return playPromise.then(() => {
            this.playing = true
            this.paused = false
          }).catch(error => {
            // Handle play interruption gracefully
            if (error.name === 'AbortError') {
              console.log('Play was interrupted, this is normal during sync adjustments')
            } else {
              console.error('Play error:', error)
            }
            throw error
          })
        } else {
          this.playing = true
          this.paused = false
          return Promise.resolve()
        }
    }

    pause() {
        console.log('pause!')
        this.video[0].pause()
        this.paused = true
    }

    stop(hide=true) {
        console.log('stop')
        if (hide) this.video[0].style.visibility = 'hidden'
        this.video[0].pause()
        this.media = ''
        this.video[0].currentTime = 0
        this.playing = false
        this.paused = false
    }

    duration() {
        return this.video[0].duration
    }

    loop(loop) {
        this.video[0].loop = loop
    }

    volume(vol) {
        console.log('SET volume', vol)
        this.video[0].volume = vol
    }

    mute(mute) {
        this.video[0].muted = mute
    }

}