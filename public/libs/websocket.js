const video_container = document.querySelector('#video-container');
const video = document.querySelector('#video-container video');

class WebSocketConnection {
    constructor(socket = null) {
        if (typeof io !== "function" || !window.MediaSource) {
            alert('Whoops, looks like your browser does not support WebSockets! Please try using a different protocol, such as WebRTC, or use a different browser (Google Chrome recommended).');
            throw new Error("WebSockets are not supported by this browser.");
        }

        if (socket && typeof socket.on !== "function") {
            console.warn("An invalid socket instance was provided, defaulting to new.");
            socket = io(); // create a new socket instance
        }

        this.socket = socket || io();
        this.screenSize = null;
        this.eventsReady = false;

        this._disconnectHandler = null;
    }

    // Accepts an offer from a viewer and sets up the connection
    async acceptOffer(offer, onDisconnect) {
        if (!this.socket || !offer || !offer.width || !offer.height) return null;

        this.screenSize = { width: offer.width, height: offer.height };
        this.eventsReady = true;
        this._disconnectHandler = onDisconnect;

        try {
            const mediaSource = new MediaSource();
            let sourceBuffer = null;

            video.src = URL.createObjectURL(mediaSource);
            mediaSource.addEventListener('sourceopen', () => {
                if (!offer.codec) return alert('Whoops, looks like your browser does not support the required codec!');

                sourceBuffer = mediaSource.addSourceBuffer(offer.codec);
            });

            this.socket.on('stream:frame', async (chunk) => {
                if (sourceBuffer && !sourceBuffer.updating) {
                    sourceBuffer.appendBuffer(chunk);
                }
            });

            this.socket.on('session:disconnect', () => {
                if (this._disconnectHandler) this._disconnectHandler();
            });

            video_container.classList.remove('hidden');
        } catch (error) {
            console.error("An unknown error occurred while accepting WebSocket offer: ", error);
            return null;
        }

        return { type: 'websocket' };
    }

    // Send a remote control event to the server directly (no need to relay via peer)
    sendEvent(data) {
        if (!data || !this.eventsReady) return;

        if (data.name && data.method) {
            this.socket.emit(`nutjs:${data.name}`, data);
        }
    }

    // End the session and clean up
    disconnect() {
        this.screenSize = null;
        this.eventsReady = false;
        this._disconnectHandler = null;

        if (this.socket) {
            this.socket.off('stream:frame');
            this.socket.off('session:disconnect');
        }

        return true;
    }
}

export default WebSocketConnection;