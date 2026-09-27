class StreamFrames {
    constructor(display, callback = null, enableAudio = false, onError = null) {
        if (!display) throw new Error("A valid display must be provided to start streaming.");

        this.config = {
            fps: 15,
            bitrate: 500000,
            timeslice: 50,
            callback: callback,
            onError: onError,
        };

        this.mediaRecorder = null;
        this.enableAudio = enableAudio && display.getAudioTracks().length > 0;
        this.display = display;
        this.stream = null;
        this.queue = Promise.resolve(); // keeps chunks sent in the order they were recorded

        const mimeTypes = this.enableAudio ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=h264,opus", "video/webm;codecs=avc1,opus", "video/webm;codecs=vp9,opus", "video/mp4;codecs=avc1,mp4a.40.2"] : ["video/webm;codecs=vp8", "video/webm;codecs=h264", "video/webm;codecs=avc1", "video/webm;codecs=vp9", "video/mp4;codecs=avc1"];
        this.codec = mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;

        if (!this.codec) throw new Error("No supported video codec was found.");
    }

    async start() {
        if (this.mediaRecorder) return;

        try {
            // clone the host's display tracks so stopping the stream here doesn't end the host's capture
            const tracks = [...this.display.getVideoTracks(), ...(this.enableAudio ? this.display.getAudioTracks() : [])];
            this.stream = new MediaStream(tracks.map((track) => track.clone()));

            await this.stream
                .getVideoTracks()[0]
                ?.applyConstraints({ frameRate: { max: this.config.fps } })
                .catch(() => {});

            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: this.codec,
                videoBitsPerSecond: this.config.bitrate,
            });

            this.mediaRecorder.ondataavailable = (event) => {
                if (!event.data || event.data.size === 0) return;

                this.queue = this.queue
                    .then(async () => {
                        const arrayBuffer = await event.data.arrayBuffer();
                        await this.config.callback(arrayBuffer);
                    })
                    .catch(() => {});
            };

            this.mediaRecorder.onerror = (error) => {
                console.error("An error occurred while recording the stream: ", error);
                this.stop();
                this.config.onError?.(error);
            };

            this.mediaRecorder.start(this.config.timeslice);
        } catch (error) {
            this.stop();
            throw new Error("An unknown error occurred while starting the stream: " + error, { cause: error });
        }
    }

    stop() {
        if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
            this.mediaRecorder.stop();
        }

        this.mediaRecorder = null;

        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }

        return true;
    }
}

module.exports = StreamFrames;
