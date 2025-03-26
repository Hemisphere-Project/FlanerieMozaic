
// DEVICES
//

class Device {

    constructor(uuid, room, player) 
    {
        uuid = String(uuid)
        this.uuid = uuid
        this.room = room
        this.position = {x: 0, y: 0}
        this.resolution = {x: 100, y: 100}
        this.zoomdevice = 1.0
        this.selected = false
        this.alive = false
        this.dom =  $('<div class="device" id="'+uuid+'"></div>')
        this.dom.attr('uuid', uuid)
        draggable(this.dom)

        player.stage.append(this.dom)

        this.dom.on('dragstart', () => { this.select(true) })
        this.dom.on('dragend', () => { this.select(false) })
        this.dom.on('dblclick', () => { this.select(true); return false; })

        // Drag
        this.dom.on('drag', (e, delta) => {
            let d = {x: -1*delta.x/player.stagescale, y: -1*delta.y/player.stagescale}
            socket.emit('move', d, this.uuid)
        })

        // Zoom
        this.dom.on('zoomdelta', (e, delta) => {
            socket.emit('deviceconf', 'zoomdevice', Math.max(0.1, this.zoomdevice + delta), this.uuid)
        })

        // device controls
        var controls = $('<div class="devCtrls"></div>').appendTo(this.dom)

        // uuid
        $('<input type="text" value="'+uuid+'"></input>').appendTo(controls).on('change', (e) => {
            let newuuid = $(e.target).val()
            socket.emit('rename', this.uuid, newuuid)
        })
        
        // mode select
        $(controls).append('<br>')
        var mode = $('<select></select>').appendTo(controls)
        mode.append('<option value="new">new</option>')
        mode.append('<option value="fixed">fixed</option>')
        mode.append('<option value="guest">guest</option>')
        mode.on('change', (e) => {
            let newmode = $(e.target).val()
            socket.emit('deviceconf', 'mode', newmode, this.uuid)
        })
        $(controls).append('<br><br>')

        // zoomdevice
        $('<div class="zdev">zoom <span></span></div>').appendTo(controls)
        $('<button class="btnZoom">-</button>').appendTo(controls).on('click', () => {
            this.dom.trigger('zoomdelta', -0.01)
        })
        $('<button class="btnZoom">+</button>').appendTo(controls).on('click', () => {
            this.dom.trigger('zoomdelta', 0.01)
        })

        // remove
        $(controls).append('<br><br>')
        $('<button class="btnRem">remove</button>').appendTo(controls).on('click', () => {
            socket.emit('remove', this.uuid)
        })
        
    }

    update(data) {
        this.position = data.position
        this.resolution = data.resolution
        this.zoomdevice = data.zoomdevice
        this.alive = data.alive

        this.dom.removeClass(this.mode)
        this.mode = data.mode
        this.dom.addClass(this.mode)

        // update select with mode
        this.dom.find('select').val(this.mode)

        // zoom value
        this.dom.find('.zdev span').text(Math.round(this.zoomdevice*100) + '%')

        if (this.alive) this.dom.addClass('alive')
        else this.dom.removeClass('alive')

        this.dom.css('left', -1*data.position.x/data.zoomdevice)
        this.dom.css('top', -1*data.position.y/data.zoomdevice)
        this.dom.css('width', data.resolution.x/data.zoomdevice)
        this.dom.css('height', data.resolution.y/data.zoomdevice)
    }
    
    remove() {
        this.dom.remove()
    }

    select(s) {
        if (s == undefined) s = !(this.selected)
        this.selected = s
        if (this.selected) this.dom.addClass('selected')
        else this.dom.removeClass('selected')
        socket.emit('select', this.selected)
    }
}        

class DevicePool {

    constructor(room, player) {
        this.devices = {}
        this.player = player
        this.room = room || 'default'
    }

    update(data) 
    {
        if (!data) return
        console.log('update', data)   

        for (let uuid in data) 
            if (uuid != 0 && uuid != -1)
            {
                // console.log('update', uuid, data[uuid])
                if (!this.devices[uuid]) this.devices[uuid] = new Device(uuid, this.room, this.player)
                this.devices[uuid].update(data[uuid])
            }

        for (let uuid in this.devices)
            if (!data[uuid]) this.remove(uuid)
    }

    remove(uuid) {
        if (!this.devices[uuid]) return
        this.devices[uuid].remove()
        delete this.devices[uuid]
    }

    toggleSel() {
        var doSel = true

        for (let uuid in this.devices) 
            if (this.devices[uuid].selected) doSel = false
        
        for (let uuid in this.devices)
            this.devices[uuid].select(doSel)
    }

}

