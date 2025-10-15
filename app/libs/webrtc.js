class WebRTCConnection {
    constructor() {
        this.peers = {
            connected: new Map(), // stores active peer connections
            pending: new Map() // stores pending connection requests
        };
    }

    // Creates an empty audio track for when audio sharing is disabled
    emptyAudio = (() => {
        const ctx = new AudioContext();
        const dst = ctx.createMediaStreamDestination();

        return dst.stream.getAudioTracks()[0];
    })();

    getPending() {
        return this.peers.pending;
    }

    isConnected(peerId) {
        return this.peers.connected.has(peerId);
    }

    isPending(peerId) {
        return this.peers.pending.has(peerId);
    }

    addOffer(peerId, meta) {
        return this.peers.pending.set(peerId, meta);
    }

    removeOffer(peerId) {
        return this.peers.pending.delete(peerId);
    }

    // Filters connections by their ICE connection state; returns metadata of matching peers
    filterConnections(status = "all") {
        let connections = {};
        let filter = [];

        switch (status) {
            case "connected":
                filter = ["connected", "completed"];
                break;
            case "disconnected":
                filter = ["disconnected", "failed", "closed"];
                break;
            case "connecting":
                filter = ["new", "checking", "connecting"];
                break;
            case "pending":
                for (let [peerId, meta] of this.peers.pending.entries()) {
                    connections[peerId] = meta;
                }

                return connections;
        }

        for (let [peerId, peer] of this.peers.connected.entries()) {
            let pc = peer?.pc;

            if (status === "all" || filter.includes(pc.connectionState)) {
                connections[peerId] = peer.meta;
            }
        }

        return connections;
    }

    // Accepts an offer from a viewer and creates a new peer connection
    async acceptOffer(peerId, { display, screenSize }, enableAudio, onMessage, onStateChange) {
        let meta = this.peers.pending.get(peerId);
        if (!meta) return null;

        this.removeOffer(peerId); // remove from wait list
        this.peers.connected.set(peerId, { pc: new RTCPeerConnection(), meta: { connectedAt: Date.now(), ip: meta?.ip } });

        const pc = this.peers.connected.get(peerId)?.pc;
        const channel = pc.createDataChannel('input');

        channel.onopen = () => {
            channel.send(JSON.stringify(screenSize));
        };

        channel.onmessage = onMessage;

        display.getTracks().forEach(track => {
            if (track.kind === 'audio' && !enableAudio) return pc.addTrack(this.emptyAudio, display); // replace with silent track if audio disabled
            pc.addTrack(track, display); // add actual track if audio enabled or if video
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Wait for connection to finish gathering ICE candidates
        await new Promise(resolve => {
            if (pc.iceGatheringState === "complete") {
                resolve();
            } else {
                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === "complete") resolve();
                };
            }
        });

        pc.onconnectionstatechange = () => {
            let state = pc.connectionState;

            if (["connected", "completed"].includes(pc.connectionState)) {
                state = "connected";
            } else if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
                state = "disconnected";
            } else if(["new", "checking", "connecting"].includes(pc.connectionState)) {
                state = "connecting";
            }

            return onStateChange(state);
        };

        return {
            sessionId: peerId,
            type: "webrtc",
            offer: {
                type: pc.localDescription.type,
                sdp: pc.localDescription.sdp
            }
        };
    }

    // Accepts an answer from a viewer and completes da peer connection
    async acceptAnswer(peerId, answer) {
        const pc = this.peers.connected.get(peerId)?.pc;
        if (!pc) return null;

        await pc.setRemoteDescription(answer);
        return true;
    }

    // Updates the audio track for all active connections based on whether audio sharing is enabled
    async updateAudio(enableAudio, { display }) {
        for (let peer of this.peers.connected.values()) {
            let pc = peer?.pc;

            for (let sender of pc.getSenders()) {
                if (sender.track.kind === 'audio') {
                    if (enableAudio) {
                        if (display.getAudioTracks().length !== 0) {
                            sender.replaceTrack(display.getAudioTracks()[0]);
                        }
                    } else {
                        sender.replaceTrack(this.emptyAudio);
                    }
                }
            }
        }
    }

    // Disconnects a specific peer connection
    async disconnect(peerId) {
        let pc = this.peers.connected.get(peerId)?.pc;
        if (!pc) return null;

        pc.close();
        this.peers.connected.delete(peerId);
        return true;
    }

    // Disconnects all active peer connections
    async disconnectAll() {
        for (let peer of this.peers.connected.values()) {
            let pc = peer?.pc;

            pc.getSenders().forEach(sender => {
                if (sender.track) {
                    sender.track.stop();
                }
            });

            pc.close();
        }

        this.peers.connected.clear();
        this.peers.pending.clear();
    }
}

module.exports = WebRTCConnection;