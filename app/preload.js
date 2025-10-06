const { contextBridge, ipcRenderer } = require('electron');
const labels = {
    normal: {
        title: "Screensheet",
        description: "Share your desktop remotely in seconds",
        codeLabel: "Connection Code",
        warningTitle: "Security Warning",
        warningDescription: `<span class="font-semibold">Never</span> share this code with anyone you don't trust. It grants full device access.`,

        startBtn: "Start Session",
        startingBtn: "Starting session...",
        endBtn: "Stop Session",
        copyBtn: "Copy",
        copiedBtn: "Copied!",

        connected: "Connected",
        disconnected: "Disconnected",
        waiting: "Waiting",
        active: "Active",
        inactive: "Inactive",

        audioSharing: "Audio Sharing",
        remoteControl: "Remote Control",
        serverPort: "Server Port"
    },
    magic: {
        title: "Magic Mode",
        description: "Summon a portal to your dimension in seconds",
        codeLabel: "Portal Key",
        warningTitle: "Portal Warning",
        warningDescription: `<span class="font-semibold">Never</span> share this key with untrusted beings. It grants complete access to your dimension.`,

        startBtn: "Summon Portal",
        startingBtn: "Summoning portal...",
        endBtn: "Close Portal",
        copyBtn: "Grab Key",
        copiedBtn: "Grabbed!",

        connected: "Portal Opened",
        disconnected: "Portal Closed",
        waiting: "Summoning",
        active: "Open",
        inactive: "Sealed",

        audioSharing: "Sound Relay",
        remoteControl: "Portal Control",
        serverPort: "Portal Node"
    }
};

let peers = new Map();
let active = false;
let display = null;
let screenSize = null;

window.addEventListener('DOMContentLoaded', () => {
    const magicToggle = document.querySelector('#magic_toggle');
    const magic = document.querySelector('#magic');

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
    const controlToggle = document.querySelector('#control_toggle');
    const control = document.querySelector('#control');
    const port = document.querySelector('#port');

    const emptyAudio = (() => {
        const ctx = new AudioContext();
        const dst = ctx.createMediaStreamDestination();

        return dst.stream.getAudioTracks()[0];
    })();

    function toggleChange(toggle, val) {
        const span = toggle.querySelector('span');

        if (val) {
            toggle.classList.remove('bg-gray-300');
            toggle.classList.add('bg-gray-900');
            span.classList.remove('translate-x-1');
            span.classList.add('translate-x-6');
        } else {
            toggle.classList.remove('bg-gray-900');
            toggle.classList.add('bg-gray-300');
            span.classList.remove('translate-x-6');
            span.classList.add('translate-x-1');
        }
    }

    function getLabel(key) {
        return magic.checked ? labels.magic[key] : labels.normal[key];
    }

    const findMatching = (text, location) => {
        const keyName = Object.keys(labels[location]).find(k => labels[location][k] === text);
        if (!keyName) return null;

        return labels[location === 'normal' ? 'magic' : 'normal'][keyName] ?? null;
    };

    function updateLabels() {
        document.querySelector('.title').textContent = getLabel('title');
        document.querySelector('.description').textContent = getLabel('description');
        document.querySelector('.code_label').textContent = getLabel('codeLabel');
        document.querySelector('.warning_title').textContent = getLabel('warningTitle');
        document.querySelector('.warning_description').innerHTML = getLabel('warningDescription');

        start.textContent = getLabel('startBtn');
        stop.textContent = getLabel('endBtn');
        copy.textContent = getLabel('copyBtn');
        status.textContent = findMatching(status.textContent, (magic.checked ? 'normal' : 'magic')) ?? status.textContent;

        document.querySelector('.settings span[for="audio"]').textContent = getLabel('audioSharing');
        document.querySelector('.settings span[for="control"]').textContent = getLabel('remoteControl');
        document.querySelector('.settings span[for="port"]').textContent = getLabel('serverPort');

        if (magic.checked) {
            document.body.classList.remove('bg-white');
            document.body.classList.add('bg-purple-100');

            document.querySelector('.settings').classList.remove('bg-gray-50');
            document.querySelector('.settings').classList.remove('border-gray-200');
            document.querySelector('.settings').classList.add('bg-purple-50');
            document.querySelector('.settings').classList.add('border-purple-200');

            magicToggle.classList.remove('bg-white');
            magicToggle.classList.remove('hover:bg-gray-100');
            magicToggle.classList.add('bg-purple-200');
            magicToggle.classList.add('hover:bg-purple-300');
        } else {
            document.body.classList.remove('bg-purple-100');
            document.body.classList.add('bg-white');

            document.querySelector('.settings').classList.remove('bg-purple-50');
            document.querySelector('.settings').classList.remove('border-purple-200');
            document.querySelector('.settings').classList.add('bg-gray-50');
            document.querySelector('.settings').classList.add('border-gray-200');

            magicToggle.classList.remove('bg-purple-200');
            magicToggle.classList.remove('hover:bg-purple-300');
            magicToggle.classList.add('bg-white');
            magicToggle.classList.add('hover:bg-gray-100');
        }
    }

    ipcRenderer.invoke('settings:load').then(settings => {
        if (settings) {
            magic.checked = (settings.magic ?? false);
            audio.checked = (settings.audio ?? true);
            control.checked = (settings.control ?? true);
            port.value = (settings.port ?? 3000);

            toggleChange(audioToggle, audio.checked);
            toggleChange(controlToggle, control.checked);
            if(magic.checked) updateLabels();
        }
    });

    magicToggle.addEventListener('click', () => {
        magic.checked = (!magic.checked);

        ipcRenderer.invoke('settings:update', {
            magic: magic.checked
        });

        return updateLabels();
    });

    audioToggle.addEventListener('click', () => {
        audio.checked = (!audio.checked);

        ipcRenderer.invoke('settings:update', {
            audio: audio.checked
        });

        toggleChange(audioToggle, audio.checked);
        return updateAudio();
    });

    controlToggle.addEventListener('click', () => {
        control.checked = (!control.checked);

        ipcRenderer.invoke('settings:update', {
            control: control.checked
        });

        return toggleChange(controlToggle, control.checked);
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

                if (message.name && message.method && control.checked) {
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
            updateStatus(getLabel('connected'), 'bg-green-500');
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
                updateStatus(getLabel('disconnected'), 'bg-red-500');
            }
        }
    }

    contextBridge.exposeInMainWorld('session', {
        start: async () => {
            updateStatus(getLabel('waiting'), 'bg-yellow-500');
            start.innerHTML = getLabel('startingBtn');

            await createDisplay();
            start.classList.add('hidden');
            stop.classList.remove('hidden');

            updateStatus(getLabel('active'), 'bg-green-500');
            start.innerHTML = getLabel('startBtn');

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

            updateStatus(getLabel('inactive'), 'bg-gray-400');

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
            copy.textContent = getLabel('copiedBtn');

            setTimeout(() => {
                copy.textContent = getLabel('copyBtn');
            }, 1000);
        }
    });
});