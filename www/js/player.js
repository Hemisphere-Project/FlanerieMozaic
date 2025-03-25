
class VideoPlayer {
    
    // constructor
    constructor(uuid, container) {
        this.uuid = uuid
        this.container = $(container);

        if (uuid >= 0) {
            this.backstage = $('<div class="backstage draggable"></div>').appendTo(this.container);
            this.backstage.attr('uuid', uuid)
            
            this.stage = $('<div class="stage draggable"></div>').appendTo(this.backstage);
            this.stage.attr('uuid', uuid)
            this.stagescale = 1.0
            this.stageoffset = {x: 0, y: 0}
            this.scaleStage(1.0)

            this.video = $('<video class="player draggable" loop playsinline></video>').appendTo(this.stage);
        }
        else this.video = $('<video class="player draggable" loop playsinline></video>').appendTo(this.container);
        
        this.video.attr('uuid', uuid)
        this._globalzoom = 1.0
        this._localzoom = 1.0
        this.videoscale = 1.0
        this.videooffset = {x: 0, y: 0}
        this.position({x: 0, y: 0})
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

    // global video zoom
    globalzoom(z) {
         // console.log('zoom', z)
         this._globalzoom = Math.max(0.1, z)
         this.videoscale = this._globalzoom * this._localzoom
         $('#zoom').text( Math.round(this._globalzoom*100) +"%")
        this.video.css('transform', 'scale('+this.videoscale+') translate('+this.videooffset.x/this.videoscale+'px, '+this.videooffset.y/this.videoscale+'px)')
    }

    // local device zoom
    localzoom(z) {
        // console.log('zoom', z)
        this._localzoom = Math.max(0.1, z)
        this.videoscale = this._globalzoom * this._localzoom
        $('#zoomdevice').text( Math.round(this._localzoom*100) +"%")
        this.video.css('transform', 'scale('+this.videoscale+') translate('+this.videooffset.x/this.videoscale+'px, '+this.videooffset.y/this.videoscale+'px)')
    }

    // video position
    position(pos) {
        pos.x = Math.round(pos.x)
        pos.y = Math.round(pos.y)
        // console.log('position', pos)
        $('#x').text(pos.x+" px")
        $('#y').text(pos.y+" px")
        this.videooffset = pos
        this.video.css('transform', 'scale('+this.videoscale+') translate('+this.videooffset.x/this.videoscale+'px, '+this.videooffset.y/this.videoscale+'px)')
    }

    // mode
    mode(m) {
        this.devicemode = m
        $('#mode').text(m)
    }

    // update
    updateConf(data) {
        console.log('UPDATE', data)
        this.position(data.position)
        this.mode(data.mode) 
        this.localzoom(data.zoomdevice)
    }

    load(media) {
        if (media == this.media) return
        console.log('load', media)
        this.media = media

        if (this.media == '#camera') 
        {
            navigator.mediaDevices.getUserMedia({video: true})
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
            if (this.video[0].srcObject) {
                this.video[0].srcObject.getTracks().forEach(track => track.stop());
                this.video[0].srcObject = null
            }
            this.video.attr('src', '/media/'+media)
            this.video[0].load()
            this.video[0].pause()
        }
    }

    play(media) {
        if (media) this.load(media)
        console.log('play!')
        // $('#logs').text('play! '+ media)
        this.video[0].play()
        this.video[0].style.visibility = 'visible'
    }

    pause() {
        console.log('pause!')
        this.video[0].pause()
    }

    stop() {
        console.log('stop')
        this.video[0].style.visibility = 'hidden'
        this.video[0].pause()
        this.media = ''
        this.video[0].currentTime = 0
    }

    duration() {
        return this.video[0].duration
    }
    

}