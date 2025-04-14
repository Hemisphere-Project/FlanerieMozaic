
const LOOP_NONE = 0
const LOOP_ONE = 1
const LOOP_ALL = 2

class Playlist extends EventEmitter {
    constructor() {
        super()
        this.playlist = []
        this.index = 0
        this.loop = LOOP_ALL
    }

    load(playlist, loop) {
        if (loop != undefined) this.loop = loop
        // if not array, convert to array
        if (!Array.isArray(playlist)) playlist = [playlist]
        this.playlist = playlist
        this.reload()
    }

    reload() {
        this.index = 0
        if (this.playlist.length > 0)
            this.emit('play', this.playlist[this.index], this.playlist.length == 1)
    }

    current() {
        if (this.playlist.length == 0) return null
        return this.playlist[this.index]
    }

    next() {
        if (this.playlist.length == 0) return null

        if (this.loop == LOOP_NONE && this.index == this.playlist.length-1) {
            this.index = -1
            this.emit('end')
            return
        }
        else if (this.loop == LOOP_ONE) this.index = this.index
        else this.index = (this.index + 1) % this.playlist.length

        this.emit('play', this.playlist[this.index], this.playlist.length == 1)   
    }

    clear() {
        this.playlist = []
        this.index = 0
    }

}