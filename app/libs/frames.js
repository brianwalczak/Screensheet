class StreamFrames {
    constructor(screen, callback, enableAudio = false) {
        this.config = {
            fps: 15,
            bitrate: 500000,
            timeslice: 50,
            callback: callback
        };

        this.mediaRecorder = null;
        this.enableAudio = enableAudio;
        this.screen = screen;
        this.codec = null;
    }

    static async create(screen, callback) {
        const instance = new StreamFrames(screen, callback);
        await instance.start();

        return instance;
    }

    async start() {
        if (!this.stream && this.screen) {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: this.enableAudio ? {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                    }
                } : false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: this.screen.display[0].id,
                        frameRate: { ideal: this.config.fps, max: this.config.fps },
                        minWidth: this.screen.width,
                        minHeight: this.screen.height,
                        maxWidth: this.screen.width,
                        maxHeight: this.screen.height,
                    },
                },
            });
        }

        const mimeTypes = this.enableAudio ? [
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=h264,opus',
            'video/webm;codecs=avc1,opus',
            'video/webm;codecs=vp9,opus',
            'video/mp4;codecs=avc1,mp4a.40.2'
        ] : [
            'video/webm;codecs=vp8',
            'video/webm;codecs=h264',
            'video/webm;codecs=avc1',
            'video/webm;codecs=vp9',
            'video/mp4;codecs=avc1'
        ];

        for (const mimeType of mimeTypes) {
            if (MediaRecorder.isTypeSupported(mimeType)) {
                this.codec = mimeType;
                break;
            }
        }

        if (!this.codec) {
            throw new Error('No supported video codec found');
        }

        this.mediaRecorder = new MediaRecorder(this.stream, {
            mimeType: this.codec,
            videoBitsPerSecond: this.config.bitrate
        });

        this.mediaRecorder.ondataavailable = async (event) => {
            if (event.data && event.data.size > 0) {
                const arrayBuffer = await event.data.arrayBuffer();

                await this.config.callback(arrayBuffer);
            }
        };

        this.mediaRecorder.onerror = (error) => {
            this.stop();
            throw new Error(error);
        };

        this.mediaRecorder.start(this.config.timeslice);
    }

    stop() {
        if (this.mediaRecorder) {
            this.mediaRecorder.stop();
            this.mediaRecorder = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.codec = null;
        return true;
    }
}

module.exports = StreamFrames;