class EventEmitter {
    constructor() {
      this.events = {};
    }
  
    // Add a listener for a specific event
    on(event, listener) {
      if (!this.events[event]) {
        this.events[event] = [];
      }
      this.events[event].push(listener);
    }
  
    // Emit an event, invoking all listeners bound to it
    emit(event, ...args) {
      if (this.events[event]) {
        this.events[event].forEach(listener => listener(...args));
      }
    }
  
    // Remove all listeners for a specific event
    off(event, listener = null) {
      if (this.events[event]) {
        if (listener) {
          // Remove specific listener
          this.events[event] = this.events[event].filter(l => l !== listener);
        } else {
          // Remove all listeners for the event
          delete this.events[event];
        }
      }
    }
  }