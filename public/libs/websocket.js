const video_container = document.querySelector("#video-container");
const video = document.querySelector("#video-container video");

class WebSocketConnection {
    constructor(socket = null) {
        if (typeof io !== "function" || !window.MediaSource) {
            alert("Whoops, looks like your browser does not support WebSockets! Please try using a different protocol, such as WebRTC, or use a different browser (Google Chrome recommended).");
            throw new Error("WebSockets are not supported by this browser.");
        }

        if (socket && typeof socket.on !== "function") {
            console.warn("An invalid socket instance was provided, defaulting to new.");
            socket = io(); // create a new socket instance
        }

        this.socket = socket || io();
        this.eventsReady = false;
    }

    // Accepts an offer from a viewer and sets up the connection
    async acceptOffer(offer) {
        if (!this.socket || !offer) return null;

        this.eventsReady = true;

        try {
            const mediaSource = new MediaSource();
            let sourceBuffer = null;

            video.src = URL.createObjectURL(mediaSource);
            mediaSource.addEventListener("sourceopen", () => {
                if (!offer.codec) return alert("Whoops, looks like your browser does not support the required codec!");

                sourceBuffer = mediaSource.addSourceBuffer(offer.codec);
            });

            this._onFrame = async (chunk) => {
                if (sourceBuffer && !sourceBuffer.updating) {
                    sourceBuffer.appendBuffer(chunk);
                }
            };

            this.socket.on("stream:frame", this._onFrame);

            video_container.classList.remove("hidden");
        } catch (error) {
            console.error("An unknown error occurred while accepting WebSocket offer: ", error);
            return null;
        }

        return { type: "websocket" };
    }

    // Send a remote control event to the server directly (no need to relay via peer)
    sendEvent(data) {
        if (!data || !this.eventsReady) return;

        if (data.name && data.method) {
            this.socket.emit(`input:${data.name}`, data);
        }
    }

    // End the session and clean up
    disconnect() {
        this.eventsReady = false;

        // only remove our own listener since the socket is shared with the page
        if (this.socket && this._onFrame) {
            this.socket.off("stream:frame", this._onFrame);
            this._onFrame = null;
        }

        return true;
    }
}

export default WebSocketConnection;
