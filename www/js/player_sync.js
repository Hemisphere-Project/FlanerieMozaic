
// Virtual html5 media player

class SyncPlayer extends VideoPlayer {
  constructor( socket, container )  // Provide destination media element
  {
    super(socket.uuid, container);
    
    // time
    this.currentTime = 0;
    this.offsetTime = 0;
    
    // state
    this.synced = false;
    
    // syncer
    this._updateTimer = null;
    this._refreshInterval = 20;  // 250
    this._correctionTime = 5000;  // 5000
    this._seekThreshold = 400;    // 400

    // websocket (socket.io)
    this.socket = socket;
    
    // init IRCAM sync client
    this.syncClient = new SyncClient( () => { return performance.now() / 1000; });

    // Connect to Sync server WS
    //
    socket.on('connect', () => {
      console.log('connected to sync server WS !');

      // start synchronization process
      this.syncClient.start(
        (pingId, clientPingTime) => { this.socket.emit('ping', pingId, clientPingTime) },
        (callback) => { this.socket.on('pong', (...args) => { callback(...args) }) },
        (status) => { 
          this.synced = true; 
          //console.log("status", status); 
        }
      );
    })

    socket.on('disconnect', () => {
      console.log('disconnected from sync server WS !');
      this.syncClient.stop();
      this.synced = false;
    })

    // State
    socket.on('state', (data) => 
    {
      console.log('state', data)

      // Master
      if(this.socket.uuid != data.master) this.playlist.clear()

      // Media
      let mediaplay = data.media || ''
      let playingsubmedia = false
      
      if (mediaplay != '')
        for (let submedia of data.mediainfo.submedias) {
          if (submedia.split('.').slice(0, -1).join('.') == this.uuid) {
            mediaplay = data.mediainfo.subfolder + '/' + submedia
            playingsubmedia = true
            break
          }
        }
      // console.log('mediaplay', mediaplay, data)
      console.log('playingsubmedia', playingsubmedia)

      if (mediaplay != this.media || data.paused != this.element.paused) {
        if (mediaplay == '') this.stop()
        else if(!data.paused) this.play(mediaplay)
        else this.load(mediaplay)
      }

      // Submedia mode
      this.setsubmediamode(playingsubmedia)

      // Media position & zoom
      if (data.mediainfo.offset) this.globalposition(data.mediainfo.offset)
      if (data.mediainfo.zoom) this.globalzoom(data.mediainfo.zoom)
      
      // Save state
      this.state = data
        
      // Sync offset
      this.offsetTime = data.offsetTime

    })

    // media element
    this.element = this.video[0];
    this.update();
    
    socket.on('play', (media) => {
      this.play(media)
    })

    socket.on('stop', () => {
      this.stop()
    })

    // Playlist
    this.playlist = new Playlist()
    this.playlist.on('play', (video, oneloop) => { socket.emit('play', video)  })
    this.playlist.on('end', () => { console.log('playlist-end'); this.emit('playlist-end'); })
    this.on('end', () => { console.log('end'); this.playlist.next()})

  }

    
  update()  {
    if (this._updateTimer) { window.clearTimeout(this._updateTimer); this._updateTimer = null; }

    // Not playing
    if (!this.media) return this.nextupdate()

    // Not synced: pause
    if (!this.synced) {
      if (this.playing && !this.paused) this.pause();
      return this.nextupdate()
    }

    // Now synced: play
    if (this.synced && this.playing && this.paused) {
      this.play();
    }

    const targetTime = this.getSyncTime() // % this.element.duration;
    const currentTime = this.element.currentTime;
    
    var inBound = (targetTime >= 0) && (targetTime <= this.element.duration);

    // Out of bound: stop
    if (this.element.duration && !inBound) {
      // console.log('out of bound', targetTime, currentTime);
      // this.stop();
      return this.nextupdate()
    }
    
    const diff = targetTime - currentTime;
    const rate = 1.0 + 1000*diff*diff / this._correctionTime // * this.remote.playbackRate;

    // console.log('targetTime', targetTime, 'currentTime', currentTime, 'diff', diff, 'rate', rate);

    if (rate < 0.97 || rate > 1.03 || Math.abs(diff) >= this._seekThreshold/1000) {
      this.element.currentTime = targetTime;
      this.element.playbackRate = 1.01; // this.remote.playbackRate;
      // console.log('seeking', Math.round(diff*100)/100);
      // $('#logs').text('seeking ' + Math.round(diff*100)/100 + " rate: " + rate);
      this._updateTimer = window.setTimeout(() => { this.update(); }, this._refreshInterval/10);
      return
    } 
    else if (rate && this.element.playbackRate !== rate)  {
      // console.log('adapting rate: ', rate);
      // $('#logs').text('adapting rate: ' + rate);
      this.element.playbackRate = rate;
    }
    
    return this.nextupdate();    
  }

  nextupdate() {
    if (this._updateTimer) { window.clearTimeout(this._updateTimer); this._updateTimer = null; }
    this._updateTimer = window.setTimeout(() => { this.update(); }, this._refreshInterval);
  }

  // get synced time
  getSyncTime = () => {
    if (!this.syncClient || !this.synced) return -1
    this.currentTime = this.syncClient.getSyncTime() - this.offsetTime;
    return this.currentTime;
  }

}



// play => on click => send play to server = Reset offset
// document.getElementById("play").addEventListener("click", function() {
//     socket.send(JSON.stringify(['play']));
// });





