const { ipcRenderer } = require('electron');
const StreamFrames = require("./frames.js");

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
        if (!socketId || !screenSize) return null;

        let meta = this.peers.pending.get(socketId);
        if (!meta) return null;

        this.removeOffer(socketId); // remove from wait list
        this.peers.connected.set(socketId, { connectedAt: Date.now(), ip: meta?.ip });
        onStateChange("connected");

        try {
            const screen = await ipcRenderer.invoke('display');

            this.frames = await StreamFrames.create(screen, async (frame) => {
                await ipcRenderer.invoke('stream:frame', frame);
            }, enableAudio);
        } catch (error) {
            console.error("An error occurred while starting frame stream: ", error);
            
            onStateChange("disconnected");
            this.peers.connected.delete(socketId);
            return null;
        }

        const initial = await this.frames.fullFrame();

        return {
            sessionId: socketId,
            type: "websocket",
            offer: {
                frame: initial,
                width: screenSize.width,
                height: screenSize.height
            }
        };
    }

    // No answer needed for websocket (unlike webrtc)
    async acceptAnswer() {
        return true;
    }

    // Allows audio sharing for websocket connections based on whether audio sharing is enabled
    async updateAudio(enableAudio) {
        let confirmation = false;

        if (enableAudio) {
            confirmation = confirm('Audio sharing is highly experimental for WebSocket connections and may increase CPU usage, as well as cause instability. It\'s highly recommended to use WebRTC for audio sharing.\n\nIf you continue, all users will be disconnected before proceeding. Are you sure you want to enable audio sharing?');

            if (confirmation) {
                confirmation = confirm('This is your final warning. Are you absolutely sure you want to enable audio sharing for WebSocket connections?');
            }
        } else {
            confirmation = confirm('Disabling audio sharing will disconnect all current users. Do you want to proceed?');
        }

        return confirmation;
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