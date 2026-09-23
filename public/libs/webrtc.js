const video_container = document.querySelector('#video-container');
const video = document.querySelector('#video-container video');

const DEFAULT_ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
];

// Uses the STUN/TURN servers the host sent with its offer
function createPeerConnection(iceServers) {
    if (Array.isArray(iceServers) && iceServers.length > 0) {
        try {
            return new RTCPeerConnection({ iceServers });
        } catch (error) {
            console.error("Invalid ICE servers received from host, falling back to default: ", error);
        }
    }

    return new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
}

class WebRTCConnection {
    constructor(iceServers) {
        if (!window.RTCPeerConnection) {
            alert('Whoops, looks like your browser does not support WebRTC! Please try using a different browser (Google Chrome recommended), or a different protocol, such as WebSockets.');
            throw new Error("WebRTC is not supported by this browser.");
        }

        this.iceServers = iceServers;
        this.pc = createPeerConnection(iceServers);
        this.screenSize = null;
        this.eventsReady = false;
        this.channel = null;
    }

    // Accepts an offer from a viewer and creates a new peer connection
    async acceptOffer(offer, onDisconnect) {
        if (!this.pc || !offer || !offer.sdp) return null;

        this.pc.ontrack = (event) => {
            if (!event.streams || !event.streams[0]) return;

            video_container.classList.remove('hidden');
            video.srcObject = event.streams[0];
        };

        try {
            await this.pc.setRemoteDescription(offer);

            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);

            // Wait for connection to finish gathering ICE candidates (10 seconds max)
            await new Promise(resolve => {
                if (this.pc.iceGatheringState === "complete") {
                    resolve();
                } else {
                    const timeout = setTimeout(resolve, 10000);

                    this.pc.onicegatheringstatechange = () => {
                        if (this.pc.iceGatheringState === "complete") {
                            clearTimeout(timeout);
                            resolve();
                        }
                    };
                }
            });

            this.pc.ondatachannel = (event) => {
                event.channel.onmessage = (e) => {
                    if (!e.data) return;

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
                if (["disconnected", "failed", "closed"].includes(this.pc.connectionState) && onDisconnect) {
                    onDisconnect();
                }
            };
        } catch (error) {
            console.error("An unknown error occurred while accepting WebRTC offer: ", error);
            return null;
        }

        return {
            type: this.pc.localDescription.type,
            sdp: this.pc.localDescription.sdp
        };
    }

    // Send a remote control event to the host peer
    sendEvent(data) {
        if (!data || !this.channel || !this.eventsReady) return;

        try {
            const string = JSON.stringify(data);
            this.channel.send(string);
        } catch (error) {
            console.error("An unknown error occurred while sending WebRTC event: ", error);
        }
    }

    // End the session and close the P2P connection
    disconnect() {
        if (this.channel) {
            this.channel.close();
        }

        this.screenSize = null;
        this.channel = null;
        this.eventsReady = false;

        if (this.pc) {
            this.pc.close();
        }

        if (!window.RTCPeerConnection) {
            alert('Whoops, looks like your browser does not support WebRTC! Please try using a different browser (Google Chrome recommended), or a different protocol, such as WebSockets.');
            throw new Error("WebRTC is not supported by this browser.");
        }

        this.pc = createPeerConnection(this.iceServers);
        return true;
    }
}

export default WebRTCConnection;