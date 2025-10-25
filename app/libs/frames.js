class StreamFrames {
    constructor(screen, callback = null) {
        if (!screen) throw new Error('A valid screen must be provided to start streaming.');

        this.config = {
            fps: 15,
            quality: 0.5,
            blockSize: 64,
            callback: callback
        };

        this.screen = screen;
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.prev = null;
        this.running = false;
        this.off = null;
        this.offCtx = null;

        
    }

    static async create(screen, callback = null) {
        try {
            const instance = new StreamFrames(screen, callback);
            await instance.start();

            return instance;
        } catch (error) {
            console.error("Failed to create a new instance: ", error);
            return null;
        }
    }

    async start() {
        if (!this.screen) return null;

        try {
            if (!this.stream) {
                this.stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
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

            this.video = document.createElement('video');
            this.video.srcObject = this.stream;
            this.video.muted = true;
            this.video.playsInline = true;

            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
            this.off = document.createElement('canvas');
            this.offCtx = this.off.getContext('2d');
            this.offCtx.imageSmoothingEnabled = false;

            const drawFrame = () => {
                if (!this.running) return;
                this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
                const curr = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

                if (this.prev) {
                    this.diffAndSend(this.ctx, curr);
                }

                this.prev = curr;
                this.video.requestVideoFrameCallback(() => drawFrame());
            };

            return await new Promise((resolve, reject) => {
                this.video.addEventListener('loadedmetadata', async () => {
                    try {
                        this.canvas.width = this.video.videoWidth;
                        this.canvas.height = this.video.videoHeight;

                        await this.video.play();
                        this.running = true;
                        
                        drawFrame();
                        resolve(true);
                    } catch (err) {
                        reject(err);
                    }
                }, { once: true });
            });
        } catch (error) {
            this.stop();
            throw new Error("An unknown error occurred while starting the stream: " + error);
        }
    }

    async fullFrame() {
        if (!this.running) return null;

        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        const curr = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        this.off.width = this.canvas.width;
        this.off.height = this.canvas.height;

        this.offCtx.putImageData(curr, 0, 0);

        const blob = await new Promise(resolve =>
            this.off.toBlob(resolve, 'image/webp', this.config.quality)
        );

        if (!blob) return null;
        return (await blob.arrayBuffer());
    }

    async diffAndSend(ctx, curr) {
        if (!this.running) return;

        const { blockSize } = this.config;
        const { width, height, data } = curr;
        const prev = this.prev.data;
        const changed = [];

        let y = 0;
        while (y < height) {
            let x = 0;

            while (x < width) {
                // clamp block size at edges to prevent overflow
                const w = Math.min(blockSize, width - x);
                const h = Math.min(blockSize, height - y);
                let isDiff = false;

                let deltaY = 0;
                while (deltaY < h && !isDiff) {
                    let deltaX = 0;

                    while (deltaX < w) {
                        const pixelX = x + deltaX;
                        const pixelY = y + deltaY;
                        const index = (pixelY * width + pixelX) * 4;

                        // check if R, G, B, or A values have been changed
                        const r = data[index] !== prev[index];
                        const g = data[index + 1] !== prev[index + 1];
                        const b = data[index + 2] !== prev[index + 2];
                        const a = data[index + 3] !== prev[index + 3];

                        if (r || g || b || a) {
                            isDiff = true;
                            break;
                        }

                        deltaX++;
                    }

                    deltaY++;
                }

                if (isDiff) {
                    this.off.width = w;
                    this.off.height = h;
                    this.offCtx.putImageData(ctx.getImageData(x, y, w, h), 0, 0);

                    const blob = await new Promise(resolve =>
                        this.off.toBlob(resolve, 'image/webp', this.config.quality)
                    );

                    if (blob) {
                        changed.push({ x, y, w, h, data: await blob.arrayBuffer() });
                    }
                }

                x += blockSize;
            }

            y += blockSize;
        }

        if (changed.length > 0) {
            await this.config.callback(changed);
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.video) {
            this.video.pause();
            this.video.srcObject = null;
        }

        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.prev = null;
        this.running = false;
        this.off = null;
        this.offCtx = null;
        return true;
    }
}

module.exports = StreamFrames;