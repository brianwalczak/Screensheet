class StreamFrames {
    constructor(display, fps, callback) {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.fps = fps || 30;
        this.callback = callback;

        this.animationId = null;
        this.lastTime = 0;
        this.isProcessing = false;

        this.start(display);
    }

    start(display) {
        this.video = document.createElement("video");
        this.video.srcObject = display;

        this.video.addEventListener("loadedmetadata", () => {
            this.canvas = document.createElement("canvas");
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            this.ctx = this.canvas.getContext("2d");

            this.video.play();
            this.lastTime = performance.now();

            const renderFrame = async (time) => {
                if (!this.video || !this.ctx || !this.canvas) return;

                if (time - this.lastTime >= (1000 / this.fps) && !this.isProcessing) {
                    this.isProcessing = true;
                    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

                    const frame = await new Promise(resolve => {
                        this.canvas.toBlob(blob => {
                            if (blob) {
                                blob.arrayBuffer().then(buffer => resolve(buffer));
                            } else {
                                resolve(null);
                            }
                        }, "image/jpeg", 0.7);
                    });

                    if (frame) await this.callback(frame);
                    this.lastTime = time;
                    this.isProcessing = false;
                }

                this.animationId = requestAnimationFrame(renderFrame);
            };

            this.animationId = requestAnimationFrame(renderFrame);
        });
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.video) {
            this.video.pause();
            this.video.srcObject = null;
            this.video = null;
        }

        this.canvas = null;
        this.ctx = null;
    }
}

module.exports = StreamFrames;