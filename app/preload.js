const { contextBridge, ipcRenderer } = require('electron');

let peers = new Map();
let active = false;
let display = null;
let screenSize = null;

window.addEventListener('DOMContentLoaded', () => {
    const input = document.querySelector('#code');
    const status = document.querySelector('#status');
    const statusDot = document.querySelector('#status_dot');

    const start = document.querySelector('#start');
    const stop = document.querySelector('#stop');
    const copy = document.querySelector('#copy');

    const container = document.querySelector('#container');
    const warning = document.querySelector('#warning');

    const audioToggle = document.querySelector('#audio_toggle');
    const audio = document.querySelector('#audio');
    const port = document.querySelector('#port');

    const emptyAudio = (() => {
        const ctx = new AudioContext();
        const dst = ctx.createMediaStreamDestination();

        return dst.stream.getAudioTracks()[0];
    })();

    function toggleAudio(val) {
        const span = audioToggle.querySelector('span');

        if (val) {
            audioToggle.classList.remove('bg-gray-300');
            audioToggle.classList.add('bg-gray-900');
            span.classList.remove('translate-x-1');
            span.classList.add('translate-x-6');
        } else {
            audioToggle.classList.remove('bg-gray-900');
            audioToggle.classList.add('bg-gray-300');
            span.classList.remove('translate-x-6');
            span.classList.add('translate-x-1');
        }
    }

    ipcRenderer.invoke('settings:load').then(settings => {
        if (settings) {
            audio.checked = (settings.audio ?? true);
            port.value = (settings.port ?? 3000);

            toggleAudio(audio.checked);
        }
    });

    audioToggle.addEventListener('click', () => {
        audio.checked = (!audio.checked);

        ipcRenderer.invoke('settings:update', {
            audio: audio.checked
        });

        toggleAudio(audio.checked);
        return updateAudio();
    });

    async function updateAudio() {
        if (!active || !display) return;

        for (let pc of peers.values()) {
            for (let sender of pc.getSenders()) {
                if (sender.track.kind === 'audio') {
                    if (audio.checked) {
                        if (display.getAudioTracks().length !== 0) {
                            sender.replaceTrack(display.getAudioTracks()[0]);
                        }
                    } else {
                        sender.replaceTrack(emptyAudio);
                    }
                }
            }
        }
    }

    let oldPort = null;
    port.addEventListener('focus', () => {
        oldPort = port.value;
    });

    port.addEventListener('change', () => {
        const portValue = parseInt(port.value);

        if (portValue >= 1024 && portValue <= 65535) {
            ipcRenderer.invoke('settings:update', {
                port: portValue
            });
        } else {
            port.value = oldPort ?? 3000;
        }
    });

    async function createDisplay() {
        const screen = await ipcRenderer.invoke('display');

        display = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: screen.display[0].id,
                    minFrameRate: 30,
                    maxFrameRate: 120,
                    minWidth: screen.width,
                    minHeight: screen.height,
                    maxWidth: screen.width,
                    maxHeight: screen.height,
                },
            },
        });

        screenSize = { width: screen.width, height: screen.height };
        return display;
    }

    function updateStatus(text, colorClass) {
        status.textContent = text;
        statusDot.classList.remove('bg-gray-400', 'bg-green-500', 'bg-yellow-500', 'bg-red-500');

        statusDot.classList.add(colorClass);
    }

    async function onRequest(event, { sessionId }) {
        if (!active) return;
        peers.set(sessionId, new RTCPeerConnection());
        const pc = peers.get(sessionId);

        if (!display) {
            await createDisplay();
        }

        const channel = pc.createDataChannel('input');

        channel.onopen = () => {
            channel.send(JSON.stringify(screenSize));
        };

        channel.onmessage = (e) => {
            try {
                const message = JSON.parse(e.data);

                if (message.name && message.method) {
                    ipcRenderer.invoke(`nutjs:${message.name}`, message);
                }
            } catch { };
        };

        display.getTracks().forEach(track => {
            if (track.kind === 'audio' && !audio.checked) return pc.addTrack(emptyAudio, display); // replace with silent track if audio disabled
            pc.addTrack(track, display); // add actual track if audio enabled or if video
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await new Promise(resolve => {
            if (pc.iceGatheringState === "complete") {
                resolve();
            } else {
                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === "complete") resolve();
                };
            }
        });

        await ipcRenderer.invoke('session:response', {
            sessionId,
            offer: {
                type: pc.localDescription.type,
                sdp: pc.localDescription.sdp
            }
        });

        pc.onconnectionstatechange = () => statusChange(sessionId, pc.iceConnectionState);
        return pc;
    }

    async function onAnswer(event, { sessionId, answer }) {
        if (!active) return;
        if (!sessionId || !answer) return;
        const pc = peers.get(sessionId);
        if (!pc) return;

        await pc.setRemoteDescription(answer);
        return true;
    };

    function statusChange(sessionId, state) {
        if (!active) return;
        if (["connected", "completed"].includes(state)) {
            updateStatus('Connected', 'bg-green-500');
        } else if (["disconnected", "failed", "closed"].includes(state)) {
            peers.delete(sessionId);

            let anyConnected = false;
            for (let pc of peers.values()) {
                if (["connected", "completed"].includes(pc.iceConnectionState)) {
                    anyConnected = true;
                    break;
                }
            }

            if (!anyConnected) {
                updateStatus('Disconnected', 'bg-red-500');
            }
        }
    }

    contextBridge.exposeInMainWorld('session', {
        start: async () => {
            updateStatus('Waiting', 'bg-yellow-500');
            start.innerHTML = 'Starting session...';

            await createDisplay();
            start.classList.add('hidden');
            stop.classList.remove('hidden');

            updateStatus('Active', 'bg-green-500');
            start.innerHTML = 'Start Session';

            input.value = await ipcRenderer.invoke('session:start');
            container.classList.remove('hidden');
            warning.classList.remove('hidden');

            ipcRenderer.on('session:request', onRequest);
            ipcRenderer.on('session:answer', onAnswer);
            active = true;
        },
        stop: async () => {
            if (!active) return;
            for (let pc of peers.values()) {
                pc.getSenders().forEach(sender => {
                    if (sender.track) {
                        sender.track.stop();
                    }
                });

                pc.close();
            }

            peers.clear();

            await ipcRenderer.invoke('session:stop', input.value);

            stop.classList.add('hidden');
            start.classList.remove('hidden');

            updateStatus('Inactive', 'bg-gray-400');

            input.value = '';
            container.classList.add('hidden');
            warning.classList.add('hidden');

            ipcRenderer.removeListener('session:request', onRequest);
            ipcRenderer.removeListener('session:answer', onAnswer);
            active = false;
        },
        copy: async () => {
            if (!active) return;

            input.select();
            document.execCommand('copy');
            input.selectionEnd = input.selectionStart;
            copy.textContent = 'Copied!';

            setTimeout(() => {
                copy.textContent = 'Copy';
            }, 1000);
        }
    });
});