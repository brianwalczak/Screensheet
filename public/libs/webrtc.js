const video_container = document.querySelector('#video-container');
const video = document.querySelector('#video-container video');
const canvas = document.querySelector('#video-container canvas');

class WebRTCConnection {
    constructor() {
        this.pc = new RTCPeerConnection();
        this.screenSize = null;
        this.eventsReady = false;
        this.channel = null;
    }

    // Accepts an offer from a viewer and creates a new peer connection
    async acceptOffer(offer, onDisconnect) {
        this.pc.ontrack = (event) => {
            video_container.classList.remove('hidden');
            video.srcObject = event.streams[0];

            const ctx = canvas.getContext("2d");

            video.addEventListener('loadedmetadata', () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                drawFrame();
            });

            function drawFrame() {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                video.requestVideoFrameCallback(drawFrame);
            }
        };

        await this.pc.setRemoteDescription(offer);

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        this.pc.ondatachannel = (event) => {
            event.channel.onmessage = (e) => {
                try {
                    const message = JSON.parse(e.data);

                    if (message.width && message.height) {
                        this.screenSize = { width: message.width, height: message.height };
                        this.channel = event.channel;
                        this.eventsReady = true;
                    }
                } catch { };
            };
        };

        this.pc.onconnectionstatechange = async () => {
            if (["disconnected", "failed", "closed"].includes(this.pc.connectionState)) {
                onDisconnect();
            }
        };

        return {
            type: this.pc.localDescription.type,
            sdp: this.pc.localDescription.sdp
        };
    }

    // Send a remote control event to the host peer
    sendEvent(data) {
        if (!data || !this.channel || !this.eventsReady) return;

        this.channel.send(JSON.stringify(data));
    }

    // End the session and close the P2P connection
    disconnect() {
        this.screenSize = null;
        this.channel = null;
        this.eventsReady = false;

        this.pc.close();
        this.pc = new RTCPeerConnection();
        return true;
    }
}

export default WebRTCConnection;