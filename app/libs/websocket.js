const { ipcRenderer } = require("electron");
const StreamFrames = require("./frames.js");

class WebSocketConnection extends EventTarget {
    constructor(display) {
        super();

        if (!window.MediaRecorder) {
            alert("Sorry, the MediaRecorder API is not supported by this device. You'll need to switch to a different protocol to continue.");
            throw new Error("MediaRecorder is not supported by this device.");
        }

        this.display = display;
        this.peers = new Map();
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

        peer.frames?.stop();
        this.peers.delete(peerId);

        this.dispatchEvent(new CustomEvent("remove", { detail: { peerId, reason } }));
        return true;
    }

    // Accepts an offer from a viewer and prepares its own frame stream
    acceptOffer({ peerId, enableAudio }) {
        const peer = this.getPeer(peerId);
        if (!this.display) return { success: false, error: new Error("No display is available to share.") };
        if (peer?.state !== "connecting" || peer.frames) return { success: false, error: new Error("This viewer is no longer waiting to connect.") };

        let frames;

        try {
            frames = new StreamFrames(
                this.display,
                (frame) => ipcRenderer.invoke("stream:frame", { sessionId: peerId, frame }),
                enableAudio,
                () => this.removePeer(peerId, "failed"), // recording broke so the viewer's stream is dead
            );
        } catch (error) {
            return { success: false, error };
        }

        this.updatePeer(peerId, { frames, step: "answering" }); // waiting for the viewer's answer

        return {
            success: true,
            response: {
                sessionId: peerId,
                type: "websocket",
                offer: {
                    codec: frames.codec,
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

    // Accepts an answer from a viewer and starts streaming to them
    async acceptAnswer(peerId) {
        const peer = this.getPeer(peerId);
        if (peer?.state !== "connecting" || !peer.frames) return { success: false, error: new Error("This viewer is not waiting for a connection.") };

        this.updatePeer(peerId, { step: "establishing" });

        try {
            await peer.frames.start();
        } catch (error) {
            return { success: false, error };
        }

        if (!this.getPeer(peerId)) return { success: false, error: new Error("This viewer is no longer waiting to connect.") };

        peer.meta.connectedAt = Date.now();
        this.updatePeer(peerId, { state: "connected", step: null });
        return { success: true };
    }

    // Allows audio sharing for websocket connections based on whether audio sharing is enabled
    updateAudio(enableAudio) {
        if (enableAudio) {
            return confirm("Audio sharing is highly experimental for WebSocket connections and may increase CPU usage, as well as cause instability. It's highly recommended to use WebRTC for audio sharing.\n\nIf you continue, all users will be disconnected before proceeding. Are you sure you want to enable audio sharing?") && confirm("This is your final warning. Are you absolutely sure you want to enable audio sharing for WebSocket connections?");
        }

        return confirm("Disabling audio sharing will disconnect all current users. Do you want to proceed?");
    }

    // Tears down the connection (stops every viewer's frame stream)
    dispose() {
        for (const peer of this.getPeers().values()) {
            peer.frames?.stop();
        }

        this.peers.clear();
    }
}

module.exports = WebSocketConnection;
