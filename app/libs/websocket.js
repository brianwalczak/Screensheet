const { ipcRenderer } = require('electron');
const StreamFrames = require("./frames.js");
const StreamAudio = require("./audio.js");

class WebSocketConnection {
    constructor() {
        this.peers = {
            connected: new Map(), // stores active socket connections
            pending: new Map() // stores pending connection requests
        };

        this.frames = null;
        this.audio = null;
    }

    getPending() {
        return this.peers.pending;
    }

    isConnected(socketId) {
        return this.peers.connected.has(socketId);
    }

    isPending(socketId) {
        return this.peers.pending.has(socketId);
    }

    addOffer(socketId, meta) {
        return this.peers.pending.set(socketId, meta);
    }

    removeOffer(socketId) {
        return this.peers.pending.delete(socketId);
    }

    // Filters connections by their status; returns metadata of matching sockets
    filterConnections(status = "all") {
        let connections = {};

        switch (status) {
            case "connected":
                for (let [socketId, meta] of this.peers.connected.entries()) {
                    connections[socketId] = meta;
                }
                break;
            case "pending":
                for (let [socketId, meta] of this.peers.pending.entries()) {
                    connections[socketId] = meta;
                }
                break;
        }

        return connections;
    }

    // Accepts an offer from a viewer and creates a new websocket connection
    async acceptOffer(socketId, { display, screenSize }, enableAudio, onMessage, onStateChange) {
        let meta = this.peers.pending.get(socketId);
        if (!meta) return null;

        this.removeOffer(socketId); // remove from wait list
        this.peers.connected.set(socketId, { connectedAt: Date.now(), ip: meta?.ip });
        onStateChange("connected");

        const screen = await ipcRenderer.invoke('display');
        
        this.frames = await StreamFrames.create(screen, async (frame) => {
            await ipcRenderer.invoke('stream:frame', frame);
        });

        if (enableAudio) {
            this.audio = new StreamAudio(screen, async (chunk) => {
                await ipcRenderer.invoke('stream:audio', chunk);
            });
        }

        return {
            sessionId: socketId,
            type: "websocket",
            offer: {
                width: screenSize.width,
                height: screenSize.height,
                codec: this.frames.codec
            }
        };
    }

    // No answer needed for websocket (unlike webrtc)
    async acceptAnswer() {
        return true;
    }

    // Allows audio sharing for websocket connections based on whether audio sharing is enabled
    async updateAudio(enableAudio, { display }) {
        if (enableAudio && !this.audio && display) {
            this.audio = new StreamAudio(display, async (chunk) => {
                await ipcRenderer.invoke('stream:audio', chunk);
            });
        } else if (!enableAudio && this.audio) {
            this.audio.stop();
            this.audio = null;
        }
        
        return true;
    }

    // Disconnects a specific socket connection
    async disconnect(socketId) {
        if (!this.peers.connected.has(socketId)) return null;
        this.peers.connected.delete(socketId);

        if (this.frames) this.frames.stop() && (this.frames = null);
        if (this.audio) this.audio.stop() && (this.audio = null);
        return true;
    }

    // Disconnects all active socket connections
    async disconnectAll() {
        this.peers.connected.clear();
        this.peers.pending.clear();

        if (this.frames) this.frames.stop() && (this.frames = null);
        if (this.audio) this.audio.stop() && (this.audio = null);
        return true;
    }
}

module.exports = WebSocketConnection;