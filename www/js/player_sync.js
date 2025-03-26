
// Virtual html5 media player
// With event emitter

class SyncPlayer extends VideoPlayer {
  constructor( socket, uuid, container )  // Provide destination media element
  {
    super(uuid, container);
    
    // time
    this.currentTime = 0;
    this.offsetTime = 0;
    
    // state
    this.media = null;
    this.playing = true;
    this.paused = false;
    this.ended = false;
    this.synced = false;
    
    // syncer
    this._updateTimer = null;
    this._refreshInterval = 250;  // 250
    this._correctionTime = 5000;  // 5000
    this._seekThreshold = 400;    // 400

    // websocket (socket.io)
    this.socket = socket;
    
    // init IRCAM sync client
    this.syncClient = new SyncClient( () => { return performance.now() / 1000; });

    // Connect to Sync server WS
    //
    this.socket.on('connect', () => {
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

    this.socket.on('disconnect', () => {
      console.log('disconnected from sync server WS !');
      this.syncClient.stop();
      this.synced = false;
    })

    // State
    this.socket.on('state', (data) => 
    {
      console.log('state', data)

      // this.globalzoom(data.zoom)
      if (data.mediainfo) {
        if (data.mediainfo.offset) this.globalposition(data.mediainfo.offset)
        if (data.mediainfo.zoom) this.globalzoom(data.mediainfo.zoom)
      }
      
        this.offsetTime = data.offsetTime

      if (data.media != this.media || data.paused != this.element.paused) {
        if (data.media == '') this.stop()
        else if(!data.paused) this.play(data.media)
        else this.load(data.media)
      }

    
    })

    // media element
    this.element = this.video[0];
    this.update();
    
    socket.on('play', (media) => {
      this.play(media)
    })

    socket.on('pause', () => {
      this.pause()
    })

    socket.on('stop', () => {
      this.stop()
    })
  }

    
  update()  {
    if (this._updateTimer) { window.clearTimeout(this._updateTimer); this._updateTimer = null; }

    // Not playing
    if (!this.media || this.element.paused) {
      this._updateTimer = window.setTimeout(() => { this.update(); }, this._refreshInterval);
      return
    }

    const targetTime = this.getSyncTime() % this.element.duration;
    const currentTime = this.element.currentTime;

    const diff = targetTime - currentTime;
    const rate = 1.0 + 1000*diff*diff / this._correctionTime // * this.remote.playbackRate;

    // console.log('targetTime', targetTime, 'currentTime', currentTime, 'diff', diff, 'rate', rate, 'sourcePaused', sourcePaused, 'sourcePlaybackRate', sourcePlaybackRate);

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





