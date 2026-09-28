const { ipcRenderer } = require("electron");
const { init: initRemoteInput, dispose: disposeRemoteInput, pointerEvent, keyboardEvent, scrollEvent } = require("@screensheet/remote");
const WebRTCConnection = require("./libs/webrtc.js");
const WebSocketConnection = require("./libs/websocket.js");

const STEP_LABELS = {
    resolving: "Preparing connection...",
    offering: "Setting up stream...",
    gathering: "Finding the best route...",
    answering: "Waiting for viewer...",
    establishing: "Finalizing connection...",
};

let settings; // the host's saved settings
let connection; // the current connection instance (WebRTC or WebSocket)
let display; // the current display media stream
let refresh; // timer that re-renders the connections list

// Shows an error message under a field (or hides it if empty)
function showError(element, error) {
    element.textContent = error ?? "";
    element.classList.toggle("hidden", !error);
}

// Changes the status of a toggle switch
function toggleChange(toggle, val) {
    const span = toggle.querySelector("span");

    if (val) {
        toggle.classList.remove("bg-gray-300");
        toggle.classList.add("bg-gray-900");
        span.classList.remove("translate-x-1");
        span.classList.add("translate-x-6");
    } else {
        toggle.classList.remove("bg-gray-900");
        toggle.classList.add("bg-gray-300");
        span.classList.remove("translate-x-6");
        span.classList.add("translate-x-1");
    }
}

// Validates and parses a JSON string of ICE servers
function parseIceServers(text) {
    const isValidServer = (s) => s && typeof s === "object" && (typeof s.urls === "string" || (Array.isArray(s.urls) && s.urls.length > 0));
    if (!text.trim()) return { servers: null };

    let servers;
    try {
        servers = JSON.parse(text);
    } catch (error) {
        return { error: `Your JSON array is invalid: ${error.message}` };
    }

    if (!Array.isArray(servers)) return { error: "Your data must be formatted as a JSON array of servers." };
    if (servers.length === 0) return { error: "You must have at least one server." };

    const badIndex = servers.findIndex((s) => !isValidServer(s));
    if (badIndex !== -1) return { error: `Server #${badIndex + 1} must contain a "urls" field.` };

    try {
        new RTCPeerConnection({ iceServers: servers }).close();
    } catch (error) {
        return { error: error.message };
    }

    return { servers };
}

// Gets the display media (screen + audio) and prepares for sharing
async function createDisplay() {
    try {
        const screen = await ipcRenderer.invoke("display");

        display = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: "desktop",
                },
            },
            video: {
                mandatory: {
                    chromeMediaSource: "desktop",
                    chromeMediaSourceId: screen.display[0].id,
                    frameRate: { min: 15, ideal: 30, max: 60 },
                    minWidth: screen.width,
                    minHeight: screen.height,
                    maxWidth: screen.width,
                    maxHeight: screen.height,
                },
            },
        });

        return display;
    } catch (error) {
        console.error("An error occurred while capturing the display: ", error);
        return null;
    }
}

window.addEventListener("DOMContentLoaded", () => {
    const code = document.querySelector("#code");
    const status = document.querySelector("#status");
    const statusDot = document.querySelector("#status_dot");

    const start = document.querySelector("#start");
    const stop = document.querySelector("#stop");
    const copy = document.querySelector("#copy");

    const container = document.querySelector("#container");
    const warning = document.querySelector("#warning");

    const audioToggle = document.querySelector("#audio_toggle");
    const audio = document.querySelector("#audio");
    const controlToggle = document.querySelector("#control_toggle");
    const control = document.querySelector("#control");
    const port = document.querySelector("#port");
    const portError = document.querySelector("#port_error");
    const method = document.querySelector("#method");
    const loginToggle = document.querySelector("#login_toggle");
    const login = document.querySelector("#login");

    const loginSettings = document.querySelector("#login_settings");
    const username = loginSettings.querySelector("#username");
    const password = loginSettings.querySelector("#password");

    const advancedContainer = document.querySelector("#advanced_container");
    const advancedToggle = document.querySelector("#advanced_toggle");
    const advancedSettings = document.querySelector("#advanced_settings");
    const turnToggle = document.querySelector("#turn_toggle");
    const turnCustom = document.querySelector("#turn_custom");
    const turnCloudflare = document.querySelector("#turn_cloudflare");
    const stun = document.querySelector("#stun_server");
    const stunError = document.querySelector("#stun_server_error");
    const turn = document.querySelector("#turn_servers");
    const turnError = document.querySelector("#turn_servers_error");
    const cloudflareId = document.querySelector("#cloudflare_id");
    const cloudflareToken = document.querySelector("#cloudflare_token");
    const cloudflareError = document.querySelector("#cloudflare_error");

    const render = {
        home: () => {
            // only during an active session's state changes
            if (!connection) return;
            const count = connection.getPeers("connected").size;

            if (count > 0) {
                updateStatus(`Connected${count > 1 ? ` (${count})` : ""}`, "bg-green-500");
            } else if (status.textContent.startsWith("Connected")) {
                updateStatus("Disconnected", "bg-red-500"); // only once the last connected viewer leaves
            }
        },
        connections: () => {
            const list = document.querySelector(".connections .connections_list");
            const none = document.querySelector(".connections .no_connections");
            list.innerHTML = "";

            if (connection) {
                for (const [sessionId, peer] of connection.getPeers()) {
                    switch (peer.state) {
                        case "pending":
                        case "connecting": {
                            const item = document.querySelector(".connection_items .pending_item").cloneNode(true);
                            item.querySelector(".item_name").textContent = peer.meta?.ip ?? sessionId;

                            if (peer.state === "connecting") {
                                item.querySelector(".item_accept").disabled = true;
                                item.querySelector(".item_decline").disabled = true;

                                item.querySelector(".item_status").textContent = "Connecting";
                                item.querySelector(".item_desc").textContent = STEP_LABELS[peer.step] ?? "Connecting...";
                            } else {
                                item.querySelector(".item_accept").addEventListener("click", () => approve(sessionId));
                                item.querySelector(".item_decline").addEventListener("click", () => decline(sessionId));
                            }

                            list.appendChild(item);
                            break;
                        }
                        case "connected": {
                            const item = document.querySelector(".connection_items .active_item").cloneNode(true);
                            item.querySelector(".item_name").textContent = peer.meta?.ip ?? sessionId;

                            const minutesAgo = Math.floor((Date.now() - peer.meta?.connectedAt) / 60000);
                            item.querySelector(".item_text").textContent = minutesAgo === 0 ? "Connected just now" : `Connected ${minutesAgo}m ago`;

                            item.querySelector(".item_disconnect").addEventListener("click", () => disconnect(sessionId));
                            list.appendChild(item);
                            break;
                        }
                        default:
                            continue;
                    }
                }
            }

            if (list.children.length === 0) {
                none.classList.remove("hidden");
                list.classList.add("hidden");
            } else {
                none.classList.add("hidden");
                list.classList.remove("hidden");
            }
        },
        settings: () => {
            if (settings) {
                audio.checked = settings?.audio ?? true;
                control.checked = settings?.control ?? true;
                port.value = settings?.port ?? 3000;
                method.value = settings?.method ?? "webrtc";

                login.checked = settings?.login?.enabled ?? false;
                username.value = settings?.login?.username ?? "";
                // we're using hashed password w/ bcrypt so no updating password!

                // only overwrite if the field has no error (redrawing would overwrite it)
                if (stunError.classList.contains("hidden")) stun.value = settings?.ice?.stun ?? "";
                if (turnError.classList.contains("hidden")) turn.value = settings?.ice?.turn ? JSON.stringify(settings.ice.turn, null, 2) : "";
                cloudflareId.value = settings?.ice?.cloudflare?.id ?? "";
                cloudflareToken.value = settings?.ice?.cloudflare?.token ?? "";

                const iceMethod = settings?.ice?.method ?? "custom";
                turnCustom.classList.toggle("hidden", iceMethod !== "custom");
                turnCloudflare.classList.toggle("hidden", iceMethod !== "cloudflare");
                turnToggle.textContent = iceMethod === "custom" ? "Use Cloudflare" : "Use Custom";

                toggleChange(audioToggle, audio.checked);
                toggleChange(controlToggle, control.checked && !controlToggle.disabled); // shown off while remote input is unavailable
                toggleChange(loginToggle, login.checked);
                loginSettings.classList.toggle("hidden", !login.checked);
                advancedContainer.classList.toggle("hidden", method.value !== "webrtc");
            }
        },
    };

    // Updates the status text and color based on the current state
    function updateStatus(text, color) {
        status.textContent = text;
        statusDot.classList.remove("bg-gray-400", "bg-green-500", "bg-yellow-500", "bg-red-500");

        statusDot.classList.add(color);
    }

    // Passes viewer input to the remote input backend based on event
    function handleInput(message) {
        if (!message?.name || !message.method || !control.checked) return; // only allow control if enabled

        switch (message.name) {
            case "pointer":
                pointerEvent(message);
                break;
            case "keyboard":
                keyboardEvent(message);
                break;
            case "scroll":
                scrollEvent(message);
                break;
        }
    }

    // Handles viewer input forwarded by the main process (aka WebSockets)
    function onInput(_, message) {
        handleInput(message);
    }

    // Approves a viewer's connection request
    async function approve(sessionId) {
        if (!connection || !settings) return;
        if (connection.getPeer(sessionId)?.state !== "pending") return;

        connection.updatePeer(sessionId, { state: "connecting", step: "resolving" }); // claim the peer

        try {
            const iceServers = connection instanceof WebRTCConnection ? await ipcRenderer.invoke("ice:resolve", sessionId) : null;
            const result = await connection.acceptOffer({ peerId: sessionId, iceServers, enableAudio: settings.audio });
            if (!result.success) throw result.error;

            await ipcRenderer.invoke("session:response", result.response);
        } catch (error) {
            if (!connection?.getPeer(sessionId)) return; // viewer left mid-approve (or the session stopped), already cleaned up

            console.error(error);
            alert(`An unknown error occurred while approving this connection request!\n\n${error.message}`);
            await decline(sessionId, true); // send back a declined response and remove the peer
        }
    }

    // Declines a viewer's connection request
    async function decline(sessionId, failed = false) {
        if (!connection) return;

        const result = connection.declineOffer(sessionId);
        if (!result.success) return;

        await ipcRenderer.invoke("session:response", { ...result.response, failed });
    }

    // Disconnects an active viewer connection
    async function disconnect(sessionId) {
        connection?.removePeer(sessionId, "host");
    }

    // Handles incoming connection requests from viewers
    async function onRequest(_, { sessionId, auth = false, ip = null }) {
        if (!connection) return;
        if (!connection.addPeer(sessionId, { ip })) return;

        if (auth) {
            await approve(sessionId);
        }

        document.querySelector(".tab-btn.connections").click(); // open connections tab to alert the host
    }

    // Handles incoming session answers from viewers for connection
    async function onAnswer(_, { sessionId, answer }) {
        if (!connection) return;
        if (!sessionId || !answer) return;
        if (!connection.getPeer(sessionId)) return; // viewer already gone, ignore their answer

        const result = await connection.acceptAnswer(sessionId, answer);

        if (!result.success) {
            if (!connection?.getPeer(sessionId)) return; // viewer left while connecting, already cleaned up

            console.error(result.error);
            alert(`An unknown error occurred while connecting to this viewer!\n\n${result.error.message}`);

            connection?.removePeer(sessionId, "failed");
        }
    }

    // Handles unexpected disconnections from viewers
    async function onDisconnect(_, sessionId) {
        connection?.removePeer(sessionId, "left");
    }

    ipcRenderer.invoke("settings:load").then((loaded) => {
        settings = loaded;
        if (settings) render.settings();
    });

    async function startSession(forceAudio = false) {
        if (connection || start.disabled) return; // already running or starting
        start.disabled = true;

        if (!forceAudio && method.value === "websocket" && audio.checked) audioToggle.click(); // disable audio if enabled, unless forced

        updateStatus("Waiting", "bg-yellow-500");
        start.innerHTML = "Starting session...";

        try {
            if (!(await createDisplay())) throw new Error("Unable to capture your display.");

            controlToggle.disabled = !(await initRemoteInput()); // grayed out for this session if input couldn't start
            render.settings();
            code.value = await ipcRenderer.invoke("session:start");

            connection = settings?.method === "websocket" ? new WebSocketConnection(display) : new WebRTCConnection(display);
        } catch (error) {
            console.error(error);
            alert(`The session could not be started. Please try again.\n\n${error.message}`);

            // clean up what was just set up before
            display?.getTracks().forEach((track) => track.stop());
            display = null;
            connection = null;

            await disposeRemoteInput();
            await ipcRenderer.invoke("session:stop");
            controlToggle.disabled = false;
            render.settings();

            updateStatus("Inactive", "bg-gray-400");
            start.innerHTML = "Start Session";
            start.disabled = false;
            return;
        }

        start.classList.add("hidden");
        stop.classList.remove("hidden");
        start.innerHTML = "Start Session";
        start.disabled = false;

        updateStatus("Ready", "bg-green-500");
        container.classList.remove("hidden");
        warning.classList.remove("hidden");

        ipcRenderer.on("session:disconnect", onDisconnect);
        ipcRenderer.on("session:request", onRequest);
        ipcRenderer.on("session:answer", onAnswer);
        ipcRenderer.on("remote:input", onInput);

        for (const type of ["add", "change", "remove"]) {
            connection.addEventListener(type, () => {
                // re-render list of connections and home page status
                render.connections();
                render.home();
            });
        }

        // Cleans up after any removed viewer (host disconnected them, they left, connection dropped)
        connection.addEventListener("remove", async (e) => {
            const { peerId, reason } = e.detail;
            if (reason === "declined") return; // they were never connected to begin with, so skip lifting keys

            await keyboardEvent({ method: "releaseall" }); // lift all keys removed viewer could have been holding down
            if (reason !== "left") await ipcRenderer.invoke("session:disconnect", peerId); // tell the viewer!
        });

        connection.addEventListener("input", (e) => handleInput(e.detail.message));

        refresh = setInterval(() => render.connections(), 30000); // keeps the connected times up to date

        // End the session if the capture stops suddenly
        const video = display.getVideoTracks()[0];
        video?.addEventListener("ended", stopSession);
        if (video?.readyState === "ended") stopSession();
    }

    async function stopSession() {
        const current = connection;
        if (!current) return;
        connection = null; // to prevent multiple calls

        clearInterval(refresh);

        // Notify every viewer the session ended before closing
        for (const peerId of current.getPeers().keys()) {
            await ipcRenderer.invoke("session:disconnect", peerId);
        }

        current.dispose();
        await disposeRemoteInput();
        await ipcRenderer.invoke("session:stop");
        controlToggle.disabled = false;
        render.settings();

        display?.getTracks().forEach((track) => track.stop()); // end the screen capture (otherwise it keeps running)
        display = null;

        stop.classList.add("hidden");
        start.classList.remove("hidden");

        updateStatus("Inactive", "bg-gray-400");

        code.value = "";
        container.classList.add("hidden");
        warning.classList.add("hidden");

        ipcRenderer.removeListener("session:disconnect", onDisconnect);
        ipcRenderer.removeListener("session:request", onRequest);
        ipcRenderer.removeListener("session:answer", onAnswer);
        ipcRenderer.removeListener("remote:input", onInput);
    }

    async function copyCode() {
        if (!connection) return;

        try {
            await navigator.clipboard.writeText(code.value);
            copy.textContent = "Copied!";
        } catch {
            copy.textContent = "Failed";
        }

        setTimeout(() => {
            copy.textContent = "Copy";
        }, 1000);
    }

    // Audio toggle
    audioToggle.addEventListener("click", async () => {
        let restart = false;

        if (connection) {
            const attempt = connection.updateAudio(!audio.checked);

            if (method.value === "websocket") {
                if (attempt) {
                    restart = true;
                } else {
                    return;
                }
            }
        }

        settings = await ipcRenderer.invoke("settings:update", { audio: !audio.checked });
        render.settings();

        if (restart && connection) {
            await stopSession();
            return await startSession(true); // force audio this time
        }
    });

    // Remote control toggle
    controlToggle.addEventListener("click", async () => {
        settings = await ipcRenderer.invoke("settings:update", { control: !control.checked });
        render.settings();
    });

    // Port input field
    port.addEventListener("change", async () => {
        const requested = Number(port.value);
        settings = await ipcRenderer.invoke("settings:update", { port: requested });

        showError(portError, settings.port === requested ? null : `Port ${port.value || "(empty)"} is invalid or already in use.`);
        render.settings(); // put the saved port back in the field
    });

    // Method protocol dropdown
    method.addEventListener("change", async () => {
        // if method was changed to a different method, stop current connections
        if (connection) {
            const current = connection instanceof WebSocketConnection ? "websocket" : "webrtc";

            if (method.value !== current) {
                await stopSession();
            }
        }

        settings = await ipcRenderer.invoke("settings:update", { method: method.value });
        render.settings();
    });

    // Unattended access toggle
    loginToggle.addEventListener("click", async () => {
        settings = await ipcRenderer.invoke("settings:update", {
            login: {
                enabled: !login.checked,
            },
        });

        render.settings();
    });

    // Unattended access username input field
    username.addEventListener("change", async () => {
        settings = await ipcRenderer.invoke("settings:update", {
            login: {
                username: username.value,
            },
        });

        render.settings();
    });

    // Unattended access password input field
    password.addEventListener("change", async () => {
        if (!password.value) return; // an empty field would wipe the saved password

        settings = await ipcRenderer.invoke("settings:update", {
            login: {
                password: password.value,
            },
        });

        password.value = ""; // stored hashed, so don't leave it in the field
        render.settings();
    });

    // Advanced options button
    advancedToggle.addEventListener("click", () => {
        const hidden = advancedSettings.classList.toggle("hidden");
        advancedToggle.querySelector("svg").classList.toggle("rotate-180", !hidden);
    });

    // STUN input field (advanced options)
    stun.addEventListener("change", async () => {
        const value = stun.value.trim();
        const { error } = value ? parseIceServers(JSON.stringify([{ urls: value }])) : {};

        showError(stunError, error);
        if (error) return;

        settings = await ipcRenderer.invoke("settings:update", {
            ice: {
                stun: value,
            },
        });

        render.settings();
    });

    // TURN method switch (custom or Cloudflare)
    turnToggle.addEventListener("click", async () => {
        settings = await ipcRenderer.invoke("settings:update", {
            ice: {
                method: (settings?.ice?.method ?? "custom") === "custom" ? "cloudflare" : "custom",
            },
        });

        render.settings();
    });

    // TURN custom input field (advanced options)
    turn.addEventListener("change", async () => {
        const { servers, error } = parseIceServers(turn.value);

        showError(turnError, error);
        if (error) return;

        settings = await ipcRenderer.invoke("settings:update", {
            ice: {
                turn: servers,
            },
        });

        render.settings();
    });

    // TURN Cloudflare input fields (advanced options)
    async function saveCloudflare() {
        const keys = { id: cloudflareId.value.trim(), token: cloudflareToken.value.trim() };

        if (keys.id && keys.token) {
            const { valid, status } = await ipcRenderer.invoke("ice:test", keys);

            if (!valid) return showError(cloudflareError, [401, 403, 404].includes(status) ? `Your Cloudflare credentials are invalid.` : "An unknown error occurred while validating your credentials.");
        }

        showError(cloudflareError, null);
        settings = await ipcRenderer.invoke("settings:update", {
            ice: {
                cloudflare: keys,
            },
        });

        render.settings();
    }

    cloudflareId.addEventListener("change", saveCloudflare);
    cloudflareToken.addEventListener("change", saveCloudflare);

    // Start, stop, and copy buttons
    start.addEventListener("click", () => startSession());
    stop.addEventListener("click", stopSession);
    copy.addEventListener("click", copyCode);
});
