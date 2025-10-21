const { contextBridge, ipcRenderer } = require('electron');
const { mouseEvent, keyboardEvent } = require('../remote.js');
const { getLabel, findMatching } = require('./translations.js');
const WebRTCConnection = require('./libs/webrtc.js');
const WebSocketConnection = require('./libs/websocket.js');

let connection; // the current connection instance (WebRTC or WebSocket)
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
    const method = document.querySelector('#method');
    const loginToggle = document.querySelector('#login_toggle');
    const login = document.querySelector('#login');

    const loginSettings = document.querySelector('#login_settings');
    const username = loginSettings.querySelector('#username');
    const password = loginSettings.querySelector('#password');

    function startConnection() {
        connection = method.value === 'websocket' ? new WebSocketConnection() : new WebRTCConnection();
    };

    function endConnection() {
        connection = null;
    };

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

    // Updates all labels on the page based on the current mode
    function updateLabels() {
        document.title = getLabel('appTitle');

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
        document.querySelector('.settings-div span[for="method"]').textContent = getLabel('connectionMethod');

        document.querySelector('.tab-btn.home').textContent = getLabel('menu_home');
        document.querySelector('.tab-btn.connections').textContent = getLabel('menu_connections');
        document.querySelector('.tab-btn.settings').textContent = getLabel('menu_settings');

        if (magic.checked) {
            document.body.classList.remove('bg-white');
            document.body.classList.add('bg-purple-100');

            document.querySelectorAll('.settings-div').forEach(div => {
                div.classList.remove('bg-gray-50');
                div.classList.remove('border-gray-200');
                div.classList.add('bg-purple-50');
                div.classList.add('border-purple-200');
            });

            document.querySelectorAll('.connection_items div').forEach(div => {
                div.classList.remove('bg-white');
                div.classList.remove('border-gray-200');
                div.classList.add('bg-purple-50');
                div.classList.add('border-purple-200');
            });

            magicToggle.classList.remove('bg-white');
            magicToggle.classList.remove('hover:bg-gray-100');
            magicToggle.classList.add('bg-purple-200');
            magicToggle.classList.add('hover:bg-purple-300');
        } else {
            document.body.classList.remove('bg-purple-100');
            document.body.classList.add('bg-white');

            document.querySelectorAll('.settings-div').forEach(div => {
                div.classList.remove('bg-purple-50');
                div.classList.remove('border-purple-200');
                div.classList.add('bg-gray-50');
                div.classList.add('border-gray-200');
            });

            document.querySelectorAll('.connection_items div').forEach(div => {
                div.classList.remove('bg-purple-50');
                div.classList.remove('border-purple-200');
                div.classList.add('bg-white');
                div.classList.add('border-gray-200');
            });

            magicToggle.classList.remove('bg-purple-200');
            magicToggle.classList.remove('hover:bg-purple-300');
            magicToggle.classList.add('bg-white');
            magicToggle.classList.add('hover:bg-gray-100');
        }

        updateConnections(); // update connections list to reflect new labels + bg
    }

    // Load the settings configuration from the main process
    ipcRenderer.invoke('settings:load').then(settings => {
        if (settings) {
            magic.checked = (settings.magic ?? false);
            audio.checked = (settings.audio ?? true);
            control.checked = (settings.control ?? true);
            port.value = (settings.port ?? 3000);
            method.value = (settings.method ?? 'webrtc');

            login.checked = (settings.login ?? false);
            username.value = (settings.username ?? '');
            // will be adding bcryptjs later so no password storage!

            toggleChange(audioToggle, audio.checked);
            toggleChange(controlToggle, control.checked);
            toggleChange(loginToggle, login.checked);
            if (login.checked) loginSettings.classList.remove('hidden');
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
    async function approve(sessionId) {
        if (!connection) return;
        if (!display) {
            await createDisplay();
        }

        const handshake = await connection.acceptOffer(sessionId, { display, screenSize }, audio.checked, (e) => {
            // on message
            try {
                const message = JSON.parse(e.data);

                if (message.name && message.method && control.checked) { // only allow control if enabled
                    switch (message.name) {
                        case 'mouse':
                            mouseEvent(message);
                            break;
                        case 'keyboard':
                            keyboardEvent(message);
                            break;
                    }
                }
            } catch { };
        }, async (state) => {
            // on state change
            await statusChange(state, sessionId); // update status, disconnect if needed
        });

        // Send the session response with the offer for the viewer to connect
        await ipcRenderer.invoke('session:response', handshake);
    };

    // Declines a viewer's connection request
    async function decline(sessionId) {
        if (!connection) return;
        connection.removeOffer(sessionId); // remove from wait list

        await ipcRenderer.invoke('session:response', {
            sessionId,
            declined: true
        });

        return updateConnections(); // no need to call statusChange since it was never an active connection
    };

    // Disconnects an active viewer connection and cleans up
    async function disconnect(sessionId) {
        if (!connection) return;
        await connection.disconnect(sessionId);

        await ipcRenderer.invoke('session:disconnect', sessionId);
        await statusChange("disconnected"); // must call statusChange to update status since it's an active connection, don't try to disconnect again
    };

    // Updates the connections list in the UI based on current connections and requests
    function updateConnections() {
        const list = document.querySelector('.connections .connections_list');
        const none = document.querySelector('.connections .no_connections');
        list.innerHTML = '';

        if (connection) {
            for (let [sessionId, meta] of connection.getPending().entries()) {
                const item = document.querySelector('.connection_items .pending_item').cloneNode(true);
                item.querySelector('.item_name').textContent = (meta.ip ?? sessionId);

                item.querySelector('.item_accept').addEventListener('click', async () => {
                    return approve(sessionId);
                });

                item.querySelector('.item_decline').addEventListener('click', async () => {
                    return decline(sessionId);
                });

                list.appendChild(item);
            }

            for (let [sessionId, meta] of Object.entries(connection.filterConnections('connected'))) {
                const item = document.querySelector('.connection_items .active_item').cloneNode(true);

                item.querySelector('.item_name').textContent = (meta?.ip ?? sessionId);

                const minutesAgo = Math.floor((Date.now() - meta?.connectedAt) / 60000);
                item.querySelector('.item_text').textContent = (minutesAgo === 0 ? getLabel('connectionsLabel').replace('{status}', 'just now') : getLabel('connectionsLabel').replace('{status}', `${minutesAgo}m ago`));

                item.querySelector('.item_disconnect').addEventListener('click', async () => {
                    return disconnect(sessionId);
                });

                list.appendChild(item);
            }
        }

        if (list.children.length === 0) {
            none.classList.remove('hidden');
            list.classList.add('hidden');
        } else {
            none.classList.add('hidden');
            list.classList.remove('hidden');
        }
    }

    // Handles changes in the peer connection status
    async function statusChange(state, shouldDisconnect = null) {
        if (!connection) return;

        switch (state) {
            case "connected":
                updateStatus(getLabel('connected'), 'bg-green-500');
                break;
            case "disconnected":
                if (shouldDisconnect) await disconnect(shouldDisconnect);

                if (Object.keys(connection.filterConnections('connected')).length === 0) {
                    updateStatus(getLabel('disconnected'), 'bg-red-500');
                }
                break;
        }

        return updateConnections();
    }

    // Handles incoming connection requests from viewers
    async function onRequest(event, { sessionId, auth = false, ip = null }) {
        if (!connection) return;
        connection.addOffer(sessionId, { ip });

        if (auth) {
            await approve(sessionId);
        }
        
        document.querySelector('.tab-btn.connections').click();
    };

    // Handles incoming session answers from viewers for connection
    async function onAnswer(event, { sessionId, answer }) {
        if (!connection) return;
        if (!sessionId || !answer) return;

        return await connection.acceptAnswer(sessionId, answer);
    };

    // Handles unexpected disconnections from viewers
    async function onDisconnect(event, sessionId) {
        if (!connection) return;

        if (connection.isConnected(sessionId)) {
            await statusChange("disconnected", sessionId); // update status, disconnect if needed (exactly as we would handle an onconnectionstatechange)
        } else if (connection.isPending(sessionId)) {
            connection.removeOffer(sessionId); // just remove from pending if not connected yet
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
    audioToggle.addEventListener('click', async () => {
        let restart = false;

        if (connection && display) {
            const attempt = await connection.updateAudio((!audio.checked), { display });

            if (method.value === 'websocket') {
                if (attempt) {
                    restart = true;
                } else {
                    return;
                }
            }
        }

        audio.checked = (!audio.checked);

        ipcRenderer.invoke('settings:update', {
            audio: audio.checked
        });

        toggleChange(audioToggle, audio.checked);

        if (restart && connection) {
            await sessionBridge.stop();
            return await sessionBridge.start(true); // force audio
        }
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
    const sessionBridge = {
        start: async (forceAudio = false) => {
            if (!forceAudio && method.value === 'websocket' && audio.checked) audioToggle.click(); // disable audio if enabled, unless forced

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
            return startConnection();
        },
        stop: async () => {
            if (!connection) return;
            await connection.disconnectAll();
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
            return endConnection();
        },
        copy: async () => {
            if (!connection) return;

            input.select();
            document.execCommand('copy');
            input.selectionEnd = input.selectionStart;
            copy.textContent = getLabel('copiedBtn');

            setTimeout(() => {
                copy.textContent = getLabel('copyBtn');
            }, 1000);
        }
    };

    contextBridge.exposeInMainWorld('session', sessionBridge);

    // Method dropdown change event
    method.addEventListener('change', async () => {
        // if method was changed to a different method, stop current connections
        if (connection) {
            const current = (connection instanceof WebSocketConnection ? 'websocket' : 'webrtc');

            if (method.value !== current) {
                await sessionBridge.stop();
            }
        }

        ipcRenderer.invoke('settings:update', {
            method: method.value
        });
    });

    // Unattended access toggle switch event
    loginToggle.addEventListener('click', () => {
        login.checked = (!login.checked);

        if (login.checked) {
            loginSettings.classList.remove('hidden');
        } else {
            loginSettings.classList.add('hidden');
        }

        ipcRenderer.invoke('settings:update', {
            login: login.checked
        });

        return toggleChange(loginToggle, login.checked);
    });


    // Save unattended access credentials when changed
    username.addEventListener('change', () => {
        ipcRenderer.invoke('settings:update', {
            username: username.value
        });
    });

    password.addEventListener('change', () => {
        ipcRenderer.invoke('settings:update', {
            password: password.value
        });
    });
});