const video_container = document.querySelector('#video-container');
const canvas = document.querySelector('#video-container canvas');

class WebSocketConnection {
    constructor(socket = null) {
        this.socket = socket || io();
        this.screenSize = null;
        this.eventsReady = false;

        this._disconnectHandler = null;
    }

    // Accepts an offer from a viewer and sets up the connection
    async acceptOffer(offer, onDisconnect) {
        if (offer && offer.width && offer.height) {
            this.screenSize = { width: offer.width, height: offer.height };
            this.eventsReady = true;
        }

        this._disconnectHandler = onDisconnect;

        this.socket.on('stream:frame', (frame) => {
            canvas.width = frame.width;
            canvas.height = frame.height;

            const ctx = canvas.getContext('2d');
            const imageData = ctx.createImageData(frame.width, frame.height);

            imageData.data.set(new Uint8ClampedArray(frame.data));
            ctx.putImageData(imageData, 0, 0);
        });

        this.socket.on('stream:audio', (audioData) => {
            console.log('Received audio data:', audioData);
        });

        this.socket.on('session:disconnect', () => {
            if (this._disconnectHandler) this._disconnectHandler();
        });

        video_container.classList.remove('hidden');
        return { accepted: true, type: 'websocket' };
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

        this.socket.off('stream:frame');
        this.socket.off('stream:audio');
        this.socket.off('session:disconnect');
        return true;
    }
}

export default WebSocketConnection;