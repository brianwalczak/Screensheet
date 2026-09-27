class WebRTCConnection extends EventTarget {
    constructor(display) {
        super();

        if (!window.RTCPeerConnection) {
            alert("Sorry, WebRTC is not supported by this device. You'll need to switch to a different protocol to continue.");
            throw new Error("WebRTC is not supported by this device.");
        }

        this.display = display;
        this.peers = new Map();

        this.audioContext = null;
        this.emptyAudio = this.createEmptyAudio();
    }

    // Creates a silent audio track for when audio sharing is disabled
    createEmptyAudio() {
        try {
            this.audioContext = new AudioContext();
            return this.audioContext.createMediaStreamDestination().stream.getAudioTracks()[0] ?? null;
        } catch {
            return null;
        }
    }

    getPeers(filter) {
        return new Map([...this.peers].filter(([_, peer]) => !filter || peer.state === filter));
    }

    getPeer(peerId) {
        return this.peers.get(peerId);
    }

    addPeer(peerId, meta) {
        if (this.getPeer(peerId)) return false;

        const peer = { state: "pending", meta };
        this.peers.set(peerId, peer);

        this.dispatchEvent(new CustomEvent("add", { detail: { peerId, peer } }));
        return true;
    }

    updatePeer(peerId, changes) {
        const peer = this.getPeer(peerId);
        if (!peer) return false;

        Object.assign(peer, changes);
        this.dispatchEvent(new CustomEvent("change", { detail: { peerId, ...changes } }));
        return true;
    }

    removePeer(peerId, reason) {
        const peer = this.getPeer(peerId);
        if (!peer) return false;

        clearTimeout(peer.dropTimer);
        peer.pc?.close();
        this.peers.delete(peerId);

        this.dispatchEvent(new CustomEvent("remove", { detail: { peerId, reason } }));
        return true;
    }

    // Accepts an offer from a viewer and creates a new peer connection
    async acceptOffer({ peerId, iceServers, enableAudio }) {
        const peer = this.getPeer(peerId);
        if (!this.display) return { success: false, error: new Error("No display is available to share.") };
        if (peer?.state !== "connecting" || peer.pc) return { success: false, error: new Error("This viewer is no longer waiting to connect.") };

        const pc = new RTCPeerConnection({ iceServers: iceServers ?? [] });
        const channel = pc.createDataChannel("input");

        this.updatePeer(peerId, { pc, step: "offering" });

        channel.onopen = () => {
            try {
                channel.send(JSON.stringify({ type: "ready" }));
            } catch {}
        };

        channel.onmessage = (e) => {
            try {
                this.dispatchEvent(new CustomEvent("input", { detail: { peerId, message: JSON.parse(e.data) } }));
            } catch {}
        };

        pc.onconnectionstatechange = () => {
            clearTimeout(peer.dropTimer);

            switch (pc.connectionState) {
                case "connected":
                    if (peer.state === "connected") return; // recovered from a brief disconnect

                    peer.meta.connectedAt = Date.now();
                    this.updatePeer(peerId, { state: "connected", step: null });
                    break;
                case "disconnected": // could be a network thing, give them a few seconds
                    peer.dropTimer = setTimeout(() => this.removePeer(peerId, "dropped"), 5000);
                    break;
                case "failed":
                case "closed":
                    this.removePeer(peerId, "dropped"); // connection lost
                    break;
            }
        };

        try {
            this.display.getTracks().forEach((track) => {
                if (track.kind === "audio" && !enableAudio) return this.emptyAudio && pc.addTrack(this.emptyAudio, this.display); // replace with silent track if audio disabled (skipped if unavailable)
                pc.addTrack(track, this.display); // add actual track if audio enabled or if video
            });

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Wait for connection to finish gathering ICE candidates (10 seconds max, or until peer is removed)
            this.updatePeer(peerId, { step: "gathering" });
            await new Promise((resolve) => {
                if (pc.iceGatheringState === "complete") return resolve();

                const finish = () => {
                    clearTimeout(timeout);
                    this.removeEventListener("remove", onRemove);
                    resolve();
                };

                const onRemove = (e) => {
                    if (e.detail.peerId === peerId) finish();
                }; // stop gathering if peer disconnects early
                const timeout = setTimeout(finish, 10000);

                this.addEventListener("remove", onRemove);
                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === "complete") finish();
                };
            });

            if (!this.getPeer(peerId)) return { success: false, error: new Error("This viewer is no longer waiting to connect.") };
        } catch (error) {
            return { success: false, error };
        }

        this.updatePeer(peerId, { step: "answering" }); // waiting for the viewer's answer

        return {
            success: true,
            response: {
                sessionId: peerId,
                type: "webrtc",
                iceServers,
                offer: {
                    type: pc.localDescription.type,
                    sdp: pc.localDescription.sdp,
                },
            },
        };
    }

    // Declines an offer from a viewer
    declineOffer(peerId) {
        const peer = this.getPeer(peerId);
        if (!peer || peer.state === "connected") return { success: false, error: new Error("This viewer request can no longer be declined.") };

        this.removePeer(peerId, "declined");

        return {
            success: true,
            response: {
                sessionId: peerId,
                declined: true,
            },
        };
    }

    // Accepts an answer from a viewer and completes the peer connection
    async acceptAnswer(peerId, answer) {
        const peer = this.getPeer(peerId);
        if (peer?.state !== "connecting" || !peer.pc) return { success: false, error: new Error("This viewer is not waiting for a connection.") };

        try {
            await peer.pc.setRemoteDescription(answer);
        } catch (error) {
            return { success: false, error };
        }

        this.updatePeer(peerId, { step: "establishing" });
        return { success: true };
    }

    // Updates the audio track for all active connections based on whether audio sharing is enabled
    updateAudio(enableAudio) {
        if (!this.display) return false;

        for (const peer of this.getPeers().values()) {
            const pc = peer.pc;
            if (!pc) continue;

            for (let sender of pc.getSenders()) {
                if (sender.track?.kind === "audio") {
                    if (enableAudio) {
                        if (this.display.getAudioTracks().length !== 0) {
                            sender.replaceTrack(this.display.getAudioTracks()[0]);
                        }
                    } else if (this.emptyAudio) {
                        sender.replaceTrack(this.emptyAudio);
                    }
                }
            }
        }

        return true;
    }

    // Tears down the connection (closes every peer connection and releases its audio)
    dispose() {
        for (const peer of this.getPeers().values()) {
            clearTimeout(peer.dropTimer);
            peer.pc?.close();
        }

        this.peers.clear();
        this.audioContext?.close().catch(() => {});
    }
}

module.exports = WebRTCConnection;
