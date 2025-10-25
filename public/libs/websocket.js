const video_container = document.querySelector('#video-container');
const canvas = document.querySelector('#video-container canvas');
const ctx = canvas.getContext('2d');

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

        if (!window.createImageBitmap) {
            console.warn("createImageBitmap is not supported on this browser, performance may be degraded. :[");
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
            canvas.width = this.screenSize.width;
            canvas.height = this.screenSize.height;

            // if an initial frame is provided, render it first
            if (offer.frame) {
                const img = new Image();
                img.src = URL.createObjectURL(new Blob([offer.frame], { type: 'image/webp' }));

                img.onload = () => {
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    URL.revokeObjectURL(img.src);
                };
            }

            this.socket.on('stream:frame', async (arr) => {
                for (const chunk of arr) {
                    try {
                        if (!chunk) return;
                        const { x = 0, y = 0, w, h, data } = chunk;
                        const blob = new Blob([data], { type: 'image/webp' });

                        if (!window.createImageBitmap) {
                            console.warn("createImageBitmap is not supported, performance may be degraded.");
                        }

                        if (typeof createImageBitmap === 'function') {
                            const bitmap = await createImageBitmap(blob);

                            ctx.drawImage(bitmap, x, y, (w || bitmap.width), (h || bitmap.height));
                            bitmap.close && bitmap.close();
                        } else {
                            const url = URL.createObjectURL(blob);
                            const img = new Image();

                            img.onload = () => {
                                try {
                                    ctx.drawImage(img, x, y, (w || img.width), (h || img.height));
                                } catch { };

                                URL.revokeObjectURL(url);
                            };

                            img.onerror = () => {
                                URL.revokeObjectURL(url);
                            };

                            img.src = url;
                        }
                    } catch { };
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