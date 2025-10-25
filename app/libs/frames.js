class StreamFrames {
    constructor(screen, callback = null, enableAudio = false) {
        if (!screen) throw new Error('A valid screen must be provided to start streaming.');

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

    static async create(screen, callback = null, enableAudio = false) {
        try {
            const instance = new StreamFrames(screen, callback, enableAudio);
            await instance.start();

            return instance;
        } catch (error) {
            console.error("Failed to create a new instance: ", error);
            return null;
        }
    }

    async start() {
        if (!this.screen) return null;
        if (!window.MediaRecorder) {
            alert('Whoops, looks like your device does not support the MediaRecorder API! You may need to use a different protocol, such as WebRTC.');
            throw new Error("MediaRecorder is not supported by this device.");
        }

        try {
            if (!this.stream) {
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
                            frameRate: { min: this.config.fps - 5, ideal: this.config.fps, max: this.config.fps + 5 },
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
                    try {
                        const arrayBuffer = await event.data.arrayBuffer();

                        await this.config.callback(arrayBuffer);
                    } catch { };
                }
            };

            this.mediaRecorder.onerror = (error) => {
                this.stop();
                throw new Error(error);
            };

            this.mediaRecorder.start(this.config.timeslice);
        } catch (error) {
            this.stop();
            throw new Error("An unknown error occurred while starting the stream: " + error);
        }
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