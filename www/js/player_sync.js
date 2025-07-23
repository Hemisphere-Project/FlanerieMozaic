
// Virtual html5 media player

function logp(...message) {
    console.log(...message);

    try {
        $('#logs').append( message.join(' ') + '<br>' );
        // Scroll to bottom
        $('#logs').scrollTop($('#logs')[0].scrollHeight);
    } catch (error) {
    }
}


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
    this._refreshInterval = 20;  // Compromise: 50ms for better sync accuracy vs 20ms
    this._correctionTime = 3000;  // Reduce from 5000 for more responsive corrections
    this._seekThreshold = 1000;    // Reduce from 2000 for more accurate seeking
    
    // Skip loop prevention
    this._lastSeekTime = 0;
    this._seekCooldown = 2000;  // Minimum 2s between seeks
    this._consecutiveSeeks = 0;
    this._maxConsecutiveSeeks = 3;
    this._adaptiveThreshold = 1000;  // Dynamic threshold that increases with problems
    
    // Play/pause state management
    this._lastPlayPauseTime = 0;
    this._playPauseCooldown = 500;  // Minimum 500ms between play/pause calls
    this._pendingPlayPromise = null;

    // websocket (socket.io)
    this.socket = socket;
    
    // init IRCAM sync client with fast initial sync + stable long-term
    this.syncClient = new SyncClient( 
      () => { return performance.now() / 1000; },
      {
        pingSeriesIterations: 8,        // Slightly more for better initial accuracy
        pingSeriesPeriod: 0.25,         // Back to default for faster initial sync
        pingSeriesDelay: { min: 2, max: 4 }, // Much more frequent initial sync series
        longTermDataTrainingDuration: 20, // Reduce to 20s for faster "sync" status
        estimationStability: 500e-6     // Slightly more adaptive for faster convergence
      }
    );

    // Connect to Sync server WS
    //
    socket.on('connect', () => {
      logp('connected to sync server WS !');
      var lastOffset = 0;

      // start synchronization process with faster initial sync
      this.syncClient.start(
        (pingId, clientPingTime) => { this.socket.emit('ping', pingId, clientPingTime) },
        (callback) => { this.socket.on('pong', (...args) => { callback(...args) }) },
        (status) => { 

          // Allow sync during 'training' phase if offset is reasonable (< 100ms)
          const isTrainingButGood = (status.status === 'training' && 
                                   lastOffset > 0 &&
                                   Math.abs(lastOffset - status.timeOffset) < 0.1 && 
                                   status.statusDuration > 5);

          this.synced = (status.status === 'sync' || isTrainingButGood);
          
          if (status.status === 'sync') {
            logp('✅ Fully synchronized - offset:', Math.round(status.timeOffset * 1000), 'ms');
          } else if (isTrainingButGood) {
            logp('🟡 Training but usable - offset:', Math.round(status.timeOffset * 1000), 'ms');
          }
          
          // Debug info for initial sync optimization
          else {
            logp('⏱️ Initial sync progress:', Math.round(status.statusDuration), 's, offset:', Math.round(Math.abs(lastOffset - status.timeOffset) * 1000), 'ms');
          }

          lastOffset = status.timeOffset;

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

    const currentTime = performance.now();
    const timeSinceLastPlayPause = currentTime - this._lastPlayPauseTime;

    // Not synced: pause (but avoid interrupting ongoing play requests)
    if (!this.synced) {
      if (this.playing && !this.paused && !this.element.seeking && 
          timeSinceLastPlayPause > this._playPauseCooldown) {
        // Add a small delay to prevent interrupting play() calls
        if (this.element.readyState >= 2) { // HAVE_CURRENT_DATA or higher
          this._lastPlayPauseTime = currentTime;
          // this.pause();
        }
      }
      return this.nextupdate()
    }

    // Now synced: play (but avoid conflicting with pause calls)
    if (this.synced && this.playing && this.paused && !this.element.seeking &&
        timeSinceLastPlayPause > this._playPauseCooldown) {
      // Ensure the element is ready before trying to play
      if (this.element.readyState >= 2) { // HAVE_CURRENT_DATA or higher
        this._lastPlayPauseTime = currentTime;
        
        // Cancel any pending play promise
        if (this._pendingPlayPromise) {
          this._pendingPlayPromise = null;
        }
        
        this._pendingPlayPromise = this.play().catch(error => {
          if (error.name !== 'AbortError') {
            logp('Play error:', error.message);
          }
          this._pendingPlayPromise = null;
        });
      }
    }

    const targetTime = this.getSyncTime();
    const videoCurrentTime = this.element.currentTime;
    const now = currentTime; // Use the same timestamp for consistency
    
    // Validate all time values to prevent non-finite errors
    if (!isFinite(targetTime) || !isFinite(videoCurrentTime) || !isFinite(this.element.duration) || this.element.duration <= 0) {
      logp('WARN: Invalid time values detected:', JSON.stringify({ targetTime, videoCurrentTime, duration: this.element.duration }));
      return this.nextupdate();
    }
    
    // Handle negative targetTime properly with positive modulo
    var normalizedTargetTime = (targetTime % this.element.duration) 
    while (normalizedTargetTime < 0) normalizedTargetTime += this.element.duration;
    normalizedTargetTime = normalizedTargetTime % this.element.duration; // Ensure it's within bounds
    var inBound = (normalizedTargetTime >= 0) && (normalizedTargetTime <= this.element.duration);

    // Out of bound: stop
    if (this.element.duration && !inBound) {
      logp('WARN: Out of bounds target time:', normalizedTargetTime, 'for duration:', this.element.duration);
      return this.nextupdate()
    }
    
    const diff = normalizedTargetTime - videoCurrentTime;
    const absDiff = Math.abs(diff);
    
    // Additional validation for diff values
    if (!isFinite(diff) || !isFinite(absDiff)) {
      logp('WARN: Invalid diff calculation:', { diff, absDiff, normalizedTargetTime, videoCurrentTime });
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
        logp('Rate reset to 1.0 after seek');
        this._lastSeekTime = now;
        this._consecutiveSeeks++;
        logp('Seeking:', Math.round(diff*1000), 'ms diff, consecutive seeks:', this._consecutiveSeeks);
        
        // Longer update interval after seeking to let it settle
        this._updateTimer = window.setTimeout(() => { this.update(); }, this._refreshInterval * 3);
        return;
      } else {
        logp('WARN: Invalid seek target time:', normalizedTargetTime);
        return this.nextupdate();
      }
    } 
    else if (absDiff < 0.05) {
      // Very close - reset adaptive threshold and consecutive seeks
      this._adaptiveThreshold = Math.max(this._seekThreshold, this._adaptiveThreshold * 0.9);
      this._consecutiveSeeks = 0;
      if (this.element.playbackRate !== 1.0) {
        this.element.playbackRate = 1.0; // Reset to normal rate
        logp('Rate reset to 1.0 after close diff');
      }
    }
    else {
      
      // Use playback rate adjustment for smaller differences
      const rate = 1.0 + Math.sign(diff) * Math.min(0.3, absDiff * 2); // Gentler rate adjustment

      // Validate rate before setting
      if (!isFinite(rate) || rate <= 0) {
        logp('WARN: Invalid playback rate calculated:', rate);
        this.element.playbackRate = 1.0; // Reset to safe value
        logp('Rate reset to 1.0 after invalid rate');
      } else if (this.element.playbackRate !== rate) {
        this.element.playbackRate = rate;
        logp('Playback rate adjusted to', rate, 'for diff:', Math.round(diff*1000), 'ms');
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
    this._lastPlayPauseTime = 0;
    this._pendingPlayPromise = null;
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
        logp('WARN: Invalid sync time values:', { syncTime, offsetTime });
        return -1;
      }
      
      this.currentTime = syncTime - offsetTime;
      
      // Ensure we return a valid time
      if (!isFinite(this.currentTime)) {
        logp('WARN: Invalid calculated currentTime:', this.currentTime);
        return -1;
      }
      
      return this.currentTime;
    } catch (error) {
      logp('ERROR: Error in getSyncTime:', error);
      return -1;
    }
  }

}



// play => on click => send play to server = Reset offset
// document.getElementById("play").addEventListener("click", function() {
//     socket.send(JSON.stringify(['play']));
// });





