class WebSocketConnection {
    constructor() {
        this.peers = {
            connected: new Map(), // stores active peer connections
            pending: new Map() // stores pending connection requests
        };
    }

    // working on it!
}

module.exports = WebSocketConnection;