// TOUCH DRAG
//
var dragUUID = -1;
var touchStart = null
var lastStart = 0

function draggable(element) {
    element = $(element)
    element.addClass('draggable')
    element.off('touchstart mousedown')
    element.on('touchstart mousedown', (e)=>{
        if (dragUUID != -1) return
        dragUUID = $(e.target).attr('uuid')
        element.addClass('dragging')
        element.triggerHandler('dragstart')
    })
}

// on document ready
$(function() {

    // Apply to .draggable
    $('.draggable').each((i, e) => {
        draggable(e)
    })

    $('body').on('touchstart mousedown', (e)=>{
        // console.log('touchstart')
        // handle both mouse and touch events
        if (e.touches) {
            if (e.touches.length > 1) return // don't handle multitouch
            e = e.touches[0]
        }
        touchStart = {x: e.clientX, y: e.clientY}
    }) 
    $('body').on('touchmove mousemove', (e)=>{
        if (!touchStart) return
    
        // handle both mouse and touch events
        if (e.touches) e = e.touches[0]
    
        var delta = {x: e.clientX - touchStart.x, y: e.clientY - touchStart.y}

        // trigger drag event on element with uuid attribute
        $('.dragging').each((i, e) => {
            $(e).triggerHandler('drag', delta)
        })

        touchStart = {x: e.clientX, y: e.clientY}
    })
    $('body').on('touchend mouseup', (e)=>{
        if (!touchStart) return
        $('.dragging').each((i, e) => {
            $(e).triggerHandler('dragend')
        })
        touchStart = null
        dragUUID = -1
        $('.dragging').removeClass('dragging')
        // console.log('touchend')
    })
})




