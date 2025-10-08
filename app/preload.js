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

let peers = {
    connected: new Map(), // stores active peer connections
    pending: new Map() // stores pending connection requests
};

let active = false; // whether a session is currently active
let display = null; // the current display media stream
let screenSize = null; // the dimensions of `display` param

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

    // Creates an empty audio track for when audio sharing is disabled
    const emptyAudio = (() => {
        const ctx = new AudioContext();
        const dst = ctx.createMediaStreamDestination();

        return dst.stream.getAudioTracks()[0];
    })();

    // Changes the status of a toggle switch (UI change)
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

    // Returns the correct label based on whether magic mode is enabled
    function getLabel(key) {
        return magic.checked ? labels.magic[key] : labels.normal[key];
    }

    // Finds a matching label in the opposite mode (for status updates)
    const findMatching = (text, location) => {
        const keyName = Object.keys(labels[location]).find(k => labels[location][k] === text);
        if (!keyName) return null;

        return labels[location === 'normal' ? 'magic' : 'normal'][keyName] ?? null;
    }

    // Updates all labels on the page based on the current mode
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

        document.querySelector('.settings-div span[for="audio"]').textContent = getLabel('audioSharing');
        document.querySelector('.settings-div span[for="control"]').textContent = getLabel('remoteControl');
        document.querySelector('.settings-div span[for="port"]').textContent = getLabel('serverPort');

        if (magic.checked) {
            document.body.classList.remove('bg-white');
            document.body.classList.add('bg-purple-100');

            document.querySelector('.settings-div').classList.remove('bg-gray-50');
            document.querySelector('.settings-div').classList.remove('border-gray-200');
            document.querySelector('.settings-div').classList.add('bg-purple-50');
            document.querySelector('.settings-div').classList.add('border-purple-200');

            magicToggle.classList.remove('bg-white');
            magicToggle.classList.remove('hover:bg-gray-100');
            magicToggle.classList.add('bg-purple-200');
            magicToggle.classList.add('hover:bg-purple-300');
        } else {
            document.body.classList.remove('bg-purple-100');
            document.body.classList.add('bg-white');

            document.querySelector('.settings-div').classList.remove('bg-purple-50');
            document.querySelector('.settings-div').classList.remove('border-purple-200');
            document.querySelector('.settings-div').classList.add('bg-gray-50');
            document.querySelector('.settings-div').classList.add('border-gray-200');

            magicToggle.classList.remove('bg-purple-200');
            magicToggle.classList.remove('hover:bg-purple-300');
            magicToggle.classList.add('bg-white');
            magicToggle.classList.add('hover:bg-gray-100');
        }
    }

    // Updates the audio track being sent to peers based on whether audio sharing is enabled
    async function updateAudio() {
        if (!active || !display) return;

        for (let peer of peers.connected.values()) {
            let pc = peer?.pc;

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

    // Load the settings configuration from the main process
    ipcRenderer.invoke('settings:load').then(settings => {
        if (settings) {
            magic.checked = (settings.magic ?? false);
            audio.checked = (settings.audio ?? true);
            control.checked = (settings.control ?? true);
            port.value = (settings.port ?? 3000);

            toggleChange(audioToggle, audio.checked);
            toggleChange(controlToggle, control.checked);
            if (magic.checked) updateLabels(); // only need to update if magic mode enabled (since not default)
        }
    });

    // Gets the display media (screen + audio) and prepares for sharing
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

    // Updates the status text and color based on the current state
    function updateStatus(text, colorClass) {
        status.textContent = text;
        statusDot.classList.remove('bg-gray-400', 'bg-green-500', 'bg-yellow-500', 'bg-red-500');

        statusDot.classList.add(colorClass);
    }

    // Approves a viewer's connection request and establishes a peer connection
    async function approve(sessionId, ip = null) {
        if (!active) return;
        peers.pending.delete(sessionId); // remove from wait list

        peers.connected.set(sessionId, { pc: new RTCPeerConnection(), meta: { connectedAt: Date.now(), ip } });
        const pc = peers.connected.get(sessionId)?.pc;

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

                if (message.name && message.method && control.checked) { // only allow control if enabled
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

        // Send the session response with the offer for the viewer to connect
        await ipcRenderer.invoke('session:response', {
            sessionId,
            offer: {
                type: pc.localDescription.type,
                sdp: pc.localDescription.sdp
            }
        });

        pc.onconnectionstatechange = async () => {
            await statusChange(sessionId, pc.iceConnectionState, true); // update status, disconnect if needed
        };
    };

    // Declines a viewer's connection request
    async function decline(sessionId) {
        if (!active) return;
        peers.pending.delete(sessionId); // remove from wait list

        await ipcRenderer.invoke('session:response', {
            sessionId,
            declined: true
        });

        return updateConnections(); // no need to call statusChange since it was never an active connection
    };

    // Disconnects an active viewer connection and cleans up
    async function disconnect(sessionId) {
        const pc = peers.connected.get(sessionId)?.pc;
        if (!pc) return;

        pc.close();
        peers.connected.delete(sessionId);
        await ipcRenderer.invoke('session:disconnect', sessionId);
        
        await statusChange(sessionId, "closed", false); // must call statusChange to update status since it's an active connection, don't try to disconnect again
    };

    // Updates the connections list in the UI based on current connections and requests
    function updateConnections() {
        const list = document.querySelector('.connections .connections_list');
        const none = document.querySelector('.connections .no_connections');
        list.innerHTML = '';

        if (peers.connected.size === 0 && peers.pending.size === 0) {
            none.classList.remove('hidden');
            list.classList.add('hidden');
            return;
        } else {
            none.classList.add('hidden');
            list.classList.remove('hidden');
        }

        for (let [sessionId, peer] of peers.pending.entries()) {
            const item = document.querySelector('.connection_items .pending_item').cloneNode(true);
            item.querySelector('.item_name').textContent = (peer.ip ?? sessionId);

            item.querySelector('.item_accept').addEventListener('click', async () => {
                return approve(sessionId, peer.ip);
            });

            item.querySelector('.item_decline').addEventListener('click', async () => {
                return decline(sessionId);
            });

            list.appendChild(item);
        }

        for (let [sessionId, peer] of peers.connected.entries()) {
            let pc = peer?.pc;

            if (["connected", "completed"].includes(pc.iceConnectionState)) {
                const item = document.querySelector('.connection_items .active_item').cloneNode(true);
                const metadata = peers.connected.get(sessionId)?.meta;

                item.querySelector('.item_name').textContent = (metadata?.ip ?? sessionId);
                
                const minutesAgo = Math.floor((Date.now() - metadata?.connectedAt) / 60000);
                item.querySelector('.item_text').textContent = (minutesAgo === 0 ? 'Connected just now' : `Connected ${minutesAgo}m ago`);

                item.querySelector('.item_disconnect').addEventListener('click', async () => {
                    return disconnect(sessionId);
                });

                list.appendChild(item);
            }
        }
    }

    // Handles changes in the peer connection status
    async function statusChange(sessionId, state, shouldDisconnect = false) {
        if (!active) return;
        if (["connected", "completed"].includes(state)) {
            updateStatus(getLabel('connected'), 'bg-green-500');
        } else if (["disconnected", "failed", "closed"].includes(state)) {
            if (shouldDisconnect) await disconnect(sessionId);

            let anyConnected = false;
            for (let peer of peers.connected.values()) {
                let pc = peer?.pc;

                if (["connected", "completed"].includes(pc.iceConnectionState)) {
                    anyConnected = true;
                    break;
                }
            }

            if (!anyConnected) {
                updateStatus(getLabel('disconnected'), 'bg-red-500');
            }
        }

        return updateConnections();
    }

    // Handles incoming connection requests from viewers
    async function onRequest(event, { sessionId, ip = null }) {
        if (!active) return;

        peers.pending.set(sessionId, { ip });
        document.querySelector('.tab-btn.connections').click();
    };

    // Handles incoming session answers from viewers for connection
    async function onAnswer(event, { sessionId, answer }) {
        if (!active) return;
        if (!sessionId || !answer) return;
        const pc = peers.connected.get(sessionId)?.pc;
        if (!pc) return;

        await pc.setRemoteDescription(answer);
        return true;
    };

    // Handles unexpected disconnections from viewers
    async function onDisconnect(event, sessionId) {
        if (peers.connected.has(sessionId)) {
            await statusChange(sessionId, "closed", true); // update status, disconnect if needed (exactly as we would handle an onconnectionstatechange)
        } else if (peers.pending.has(sessionId)) {
            peers.pending.delete(sessionId); // just remove from pending if not connected yet
            return updateConnections(); // no need to call statusChange since it was never an active connection
        }
    };

    // Magic button switch event
    magicToggle.addEventListener('click', () => {
        magic.checked = (!magic.checked);

        ipcRenderer.invoke('settings:update', {
            magic: magic.checked
        });

        return updateLabels();
    });

    // Audio toggle switch event
    audioToggle.addEventListener('click', () => {
        audio.checked = (!audio.checked);

        ipcRenderer.invoke('settings:update', {
            audio: audio.checked
        });

        toggleChange(audioToggle, audio.checked);
        return updateAudio();
    });

    // Control toggle switch event
    controlToggle.addEventListener('click', () => {
        control.checked = (!control.checked);

        ipcRenderer.invoke('settings:update', {
            control: control.checked
        });

        return toggleChange(controlToggle, control.checked);
    });

    // Retain old port value in case of invalid input
    let oldPort = null;
    port.addEventListener('focus', () => {
        oldPort = port.value;
    });

    // Port input change event
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

    document.querySelector('.tab-btn.connections').addEventListener('click', () => updateConnections());
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

            ipcRenderer.on('session:disconnect', onDisconnect);
            ipcRenderer.on('session:request', onRequest);
            ipcRenderer.on('session:answer', onAnswer);
            active = true;
        },
        stop: async () => {
            if (!active) return;
            for (let peer of peers.connected.values()) {
                let pc = peer?.pc;

                pc.getSenders().forEach(sender => {
                    if (sender.track) {
                        sender.track.stop();
                    }
                });

                pc.close();
            }

            peers.connected.clear();
            peers.pending.clear();

            await ipcRenderer.invoke('session:stop');

            stop.classList.add('hidden');
            start.classList.remove('hidden');

            updateStatus(getLabel('inactive'), 'bg-gray-400');

            input.value = '';
            container.classList.add('hidden');
            warning.classList.add('hidden');

            ipcRenderer.removeListener('session:disconnect', onDisconnect);
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