
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
    this._refreshInterval = 50;  // Compromise: 50ms for better sync accuracy vs 20ms
    this._correctionTime = 3000;  // Reduce from 5000 for more responsive corrections
    this._seekThreshold = 1000;    // Reduce from 2000 for more accurate seeking
    
    // Skip loop prevention
    this._lastSeekTime = 0;
    this._seekCooldown = 2000;  // Minimum 2s between seeks
    this._consecutiveSeeks = 0;
    this._maxConsecutiveSeeks = 3;
    this._adaptiveThreshold = 1000;  // Dynamic threshold that increases with problems

    // websocket (socket.io)
    this.socket = socket;
    
    // init IRCAM sync client with fast initial sync + stable long-term
    this.syncClient = new SyncClient( 
      () => { return performance.now() / 1000; },
      {
        pingSeriesIterations: 8,        // Slightly more for better initial accuracy
        pingSeriesPeriod: 0.25,         // Back to default for faster initial sync
        pingSeriesDelay: { min: 5, max: 12 }, // Much more frequent initial sync series
        longTermDataTrainingDuration: 30, // Reduce to 30s for faster "sync" status
        estimationStability: 250e-6     // Slightly more adaptive for faster convergence
      }
    );

    // Connect to Sync server WS
    //
    socket.on('connect', () => {
      console.log('connected to sync server WS !');

      // start synchronization process with faster initial sync
      this.syncClient.start(
        (pingId, clientPingTime) => { this.socket.emit('ping', pingId, clientPingTime) },
        (callback) => { this.socket.on('pong', (...args) => { callback(...args) }) },
        (status) => { 
          // Allow sync during 'training' phase if offset is reasonable (< 100ms)
          const isTrainingButGood = (status.status === 'training' && 
                                   Math.abs(status.timeOffset) < 0.1 && 
                                   status.statusDuration > 5);
          
          this.synced = (status.status === 'sync' || isTrainingButGood);
          
          if (status.status === 'sync') {
            console.log('✅ Fully synchronized - offset:', Math.round(status.timeOffset * 1000), 'ms');
          } else if (isTrainingButGood) {
            console.log('🟡 Training but usable - offset:', Math.round(status.timeOffset * 1000), 'ms');
          }
          
          // Debug info for initial sync optimization
          if (status.status === 'training' && status.statusDuration < 10) {
            console.log('⏱️ Initial sync progress:', Math.round(status.statusDuration), 's, offset:', Math.round(status.timeOffset * 1000), 'ms');
          }
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

      // Media
      let mediaplay = data.media || ''
      let playingsubmedia = false
      
      if (mediaplay != '')
        for (let submedia of data.mediainfo.submedias) {
          if (submedia.split('-').slice(0, -1).join('-') == this.uuid) {
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
      
      // Reset sync adaptation when media changes
      this._resetSyncAdaptation()

    })

    // media element
    this.element = this.video[0];
    this.update();
    
    socket.on('play', (media) => {
      this.play(media)
      this._resetSyncAdaptation()
    })

    socket.on('stop', () => {
      this.stop()
      this._resetSyncAdaptation()
    })

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

    const targetTime = this.getSyncTime();
    const currentTime = this.element.currentTime;
    const now = performance.now();
    
    // Validate all time values to prevent non-finite errors
    if (!isFinite(targetTime) || targetTime < 0 || !isFinite(currentTime) || !isFinite(this.element.duration) || this.element.duration <= 0) {
      console.warn('Invalid time values detected:', { targetTime, currentTime, duration: this.element.duration });
      return this.nextupdate();
    }
    
    const normalizedTargetTime = targetTime % this.element.duration;
    var inBound = (normalizedTargetTime >= 0) && (normalizedTargetTime <= this.element.duration);

    // Out of bound: stop
    if (this.element.duration && !inBound) {
      return this.nextupdate()
    }
    
    const diff = normalizedTargetTime - currentTime;
    const absDiff = Math.abs(diff);
    
    // Additional validation for diff values
    if (!isFinite(diff) || !isFinite(absDiff)) {
      console.warn('Invalid diff calculation:', { diff, absDiff, normalizedTargetTime, currentTime });
      return this.nextupdate();
    }
    
    // Skip loop detection and prevention
    const timeSinceLastSeek = now - this._lastSeekTime;
    const isInSeekCooldown = timeSinceLastSeek < this._seekCooldown;
    
    // Adaptive threshold - increases if we're having seeking problems
    if (this._consecutiveSeeks >= this._maxConsecutiveSeeks) {
      this._adaptiveThreshold = Math.min(5000, this._adaptiveThreshold * 1.5);
      console.warn('Skip loop detected, increasing threshold to', this._adaptiveThreshold);
      this._consecutiveSeeks = 0; // Reset counter
    }
    
    // Determine if we should seek (with cooldown and adaptive thresholds)
    const shouldSeek = absDiff >= (this._adaptiveThreshold / 1000) && !isInSeekCooldown;
    
    if (shouldSeek) {
      // Validate targetTime before seeking
      if (isFinite(normalizedTargetTime) && normalizedTargetTime >= 0 && normalizedTargetTime <= this.element.duration) {
        this.element.currentTime = normalizedTargetTime;
        this.element.playbackRate = 1.0; // Reset to normal rate after seek
        this._lastSeekTime = now;
        this._consecutiveSeeks++;
        
        console.log('Seeking:', Math.round(diff*1000), 'ms diff, consecutive seeks:', this._consecutiveSeeks);
        
        // Longer update interval after seeking to let it settle
        this._updateTimer = window.setTimeout(() => { this.update(); }, this._refreshInterval * 3);
        return;
      } else {
        console.warn('Invalid seek target time:', normalizedTargetTime);
        return this.nextupdate();
      }
    } 
    else if (absDiff < 0.05) {
      // Very close - reset adaptive threshold and consecutive seeks
      this._adaptiveThreshold = Math.max(this._seekThreshold, this._adaptiveThreshold * 0.9);
      this._consecutiveSeeks = 0;
      this.element.playbackRate = 1.0;
    }
    else {
      // Use playback rate adjustment for smaller differences
      const rate = 1.0 + Math.sign(diff) * Math.min(0.3, absDiff * 2); // Gentler rate adjustment
      
      // Validate rate before setting
      if (!isFinite(rate) || rate <= 0) {
        console.warn('Invalid playback rate calculated:', rate);
        this.element.playbackRate = 1.0; // Reset to safe value
      } else if (rate < 0.95 || rate > 1.25) {
        // Rate too extreme, but we're in cooldown - just wait
        if (isInSeekCooldown) {
          const safeRate = Math.max(0.95, Math.min(1.25, rate));
          if (isFinite(safeRate)) {
            this.element.playbackRate = safeRate;
          }
        }
      } else if (this.element.playbackRate !== rate && isFinite(rate)) {
        this.element.playbackRate = rate;
        this._consecutiveSeeks = Math.max(0, this._consecutiveSeeks - 1); // Reduce seek count on successful rate adjustment
      }
    }
    
    return this.nextupdate();    
  }

  nextupdate() {
    if (this._updateTimer) { window.clearTimeout(this._updateTimer); this._updateTimer = null; }
    this._updateTimer = window.setTimeout(() => { this.update(); }, this._refreshInterval);
  }

  // Reset sync adaptation parameters
  _resetSyncAdaptation() {
    this._lastSeekTime = 0;
    this._consecutiveSeeks = 0;
    this._adaptiveThreshold = this._seekThreshold;
    console.log('Sync adaptation reset');
  }

  // get synced time
  getSyncTime = () => {
    if (!this.syncClient || !this.synced) return -1;
    
    try {
      const syncTime = this.syncClient.getSyncTime();
      const offsetTime = this.offsetTime || 0;
      
      // Validate sync time values
      if (!isFinite(syncTime) || !isFinite(offsetTime)) {
        console.warn('Invalid sync time values:', { syncTime, offsetTime });
        return -1;
      }
      
      this.currentTime = syncTime - offsetTime;
      
      // Ensure we return a valid time
      if (!isFinite(this.currentTime)) {
        console.warn('Invalid calculated currentTime:', this.currentTime);
        return -1;
      }
      
      return this.currentTime;
    } catch (error) {
      console.error('Error in getSyncTime:', error);
      return -1;
    }
  }

}



// play => on click => send play to server = Reset offset
// document.getElementById("play").addEventListener("click", function() {
//     socket.send(JSON.stringify(['play']));
// });





