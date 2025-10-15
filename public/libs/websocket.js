class WebSocketConnection {
    constructor(io = null) {
        this.socket = io || io();
    }

    // working on it!
}

export default WebSocketConnection;