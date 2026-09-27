const { app: electron, BrowserWindow, ipcMain, desktopCapturer, systemPreferences, shell, screen } = require('electron');
const ice = require('./ice');
const bcrypt = require('bcryptjs');
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const http = require('http').createServer(app);
const io = require('socket.io')(http);

const settingsPath = path.join((electron.isPackaged ? electron.getPath('userData') : __dirname), 'settings.json');
let session;
let settings;
let window;

let ws = new Set();

electron.commandLine.appendSwitch('enable-logging');

function mergeDeep(target, changes) {
    const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
    const merged = { ...target };

    for (const [key, value] of Object.entries(changes ?? {})) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
        merged[key] = (isObject(value) && isObject(merged[key])) ? mergeDeep(merged[key], value) : value;
    }

    return merged;
}

function newServer(port = (settings?.port ?? 3000)) {
    const restart = http.listening;
    if (restart) http.close();

    return new Promise((resolve, reject) => {
        const onError = (error) => {
            http.off('listening', onListening);
            reject(error);
        };

        const onListening = () => {
            http.off('error', onError);
            console.log(`Server has been ${restart ? 'restarted' : 'started'} on http://localhost:${port}.`);
            resolve();
        };

        http.once('error', onError);
        http.once('listening', onListening);
        http.listen(port);
    });
}

// Sends a message to the host window (if it's still open)
function sendToHost(channel, data) {
    if (window && !window.isDestroyed()) window.webContents.send(channel, data);
}

function createWindow() {
    window = new BrowserWindow({
        width: 400,
        height: 590,
        resizable: false,
        icon: path.join(__dirname, 'public', 'logo.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'app', 'preload.js'),
        },
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) shell.openExternal(url);
        return { action: 'deny' };
    });

    window.setMenuBarVisibility(false);
    window.loadFile(path.join(__dirname, 'app', 'index.html'));

    window.once('ready-to-show', () => {
        window.show();
    });

    window.on('closed', () => {
        window = null;
    });
}

electron.whenReady().then(async () => {
    // Check screen recording permission on macOS
    if (process.platform === 'darwin') {
        const permission = systemPreferences.getMediaAccessStatus('screen');
        
        if (permission !== 'granted') {
            const granted = await systemPreferences.askForMediaAccess('screen');
            
            if (!granted) {
                console.warn('Screen recording permission has been denied.');
            }
        }
    }

    createWindow();

    electron.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow(); // create window if none are open (macos/darwin)
        }
    });
});

electron.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron.quit();
    }
});

// Revoke any TURN credentials left before quitting (5 seconds max)
electron.on('before-quit', async (event) => {
    if (!ice.hasCredentials()) return;
    event.preventDefault();

    await Promise.race([ice.revokeAll(), new Promise(resolve => setTimeout(resolve, 5000))]);

    electron.exit();
});

// Returns the available display sources and their dimensions
ipcMain.handle('display', async () => {
    try {
        const display = await desktopCapturer.getSources({ types: ['screen'] });

        // Used to capture at the display's full resolution
        const { size, scaleFactor } = (screen.getAllDisplays().find(d => String(d.id) === display[0]?.display_id) ?? screen.getPrimaryDisplay());
        const width = Math.round(size.width * scaleFactor);
        const height = Math.round(size.height * scaleFactor);

        return { display, width, height };
    } catch (error) {
        return new Error(error);
    }
});

ipcMain.handle('stream:frame', async (_, frame) => {
    for (let socketId of ws) {
        try {
            io.to(socketId).volatile.emit('stream:frame', frame);
        } catch (error) {
            console.error("Error sending frame to socket ", socketId, ": ", error);
        }
    }
});

// -- Session Management -- //

// Start a new session and generate a new session code
ipcMain.handle('session:start', async () => {
    session = { code: Math.random().toString(36).substring(2, 10).toUpperCase() };
    return session.code;
});

// Stop the current session (invalidate the session code)
ipcMain.handle('session:stop', async () => {
    session = null;
    ws.clear();
    ice.revokeAll();

    return true;
});

// Sends session responses from the host to the viewer (accept or decline)
ipcMain.handle('session:response', async (_, { sessionId, offer, type, iceServers, declined, failed }) => {
    try {
        if (sessionId) {
            if (offer && !declined) { // accept
                if (type === 'websocket') ws.add(sessionId); // only viewers the host accepted get the stream and input
                io.to(sessionId).emit('session:offer', { offer, type, iceServers });
            } else { // decline
                ice.revoke(sessionId); // a failed approve may have already generated TURN credentials
                io.to(sessionId).emit('session:offer', { declined: true, failed });
            }
        }
    } catch (error) {
        console.error("Error sending session response to socket ", sessionId, ": ", error);
    }
});

// Sends a disconnect signal to the viewer to end the session
ipcMain.handle('session:disconnect', async (_, sessionId) => {
    if (sessionId) {
        if (ws.has(sessionId)) {
            ws.delete(sessionId);
        }

        ice.revoke(sessionId);

        try {
            io.to(sessionId).emit('session:disconnect');
        } catch (error) {
            console.error("Error sending disconnect to socket ", sessionId, ": ", error);
        }
    }
});

// -- ICE Servers -- //

// Resolves the ICE servers for a viewer (from settings)
ipcMain.handle('ice:resolve', async (_, sessionId) => {
    const iceServers = await ice.resolve(settings, sessionId);
    if (!io.sockets.sockets.has(sessionId)) ice.revoke(sessionId); // viewer left while resolving

    return iceServers;
});

// Tests Cloudflare TURN keys before saving them
ipcMain.handle('ice:test', async (_, keys) => {
    try {
        await ice.test(keys);
        return { valid: true };
    } catch (error) {
        return { valid: false, status: error.status };
    }
});

// -- Settings Management -- //

// Load settings from file and return to host
ipcMain.handle('settings:load', async () => {
    return settings;
});

// Update settings file with modified settings from host
ipcMain.handle('settings:update', async (_, modified) => {
    try {
        if (modified?.login?.password) {
            modified.login.password = (await bcrypt.hash(modified.login.password, 10));
        }

        // Only keep a new port if it's valid and the server can actually listen on it (the host sees the old port back otherwise)
        if (modified?.port !== undefined) {
            const port = Number(modified.port);
            const current = (settings?.port ?? 3000);

            if (!Number.isInteger(port) || port < 1024 || port > 65535) {
                delete modified.port;
            } else if (port !== current) {
                try {
                    await newServer(port);
                } catch (error) {
                    console.error(`Unable to start the server on port ${port}, keeping ${current}: `, error);
                    delete modified.port;

                    await newServer(current).catch(error => console.error('Unable to restart the server: ', error));
                }
            }
        }

        const updated = mergeDeep(settings, modified);
        updated.ice = { ...updated.ice, stun: (updated.ice?.stun || ice.DEFAULT_STUN_SERVER) }; // reset STUN to default if cleared
        fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 4));

        settings = updated;
        return settings;
    } catch (error) {
        console.error(error);
        return settings;
    }
});

// -- Express Server -- //

app.set('trust proxy', true);
app.use(express.static(path.join(__dirname, 'public')));

// Handle new viewer connections to the page
io.on('connection', (socket) => {
    const sessionId = socket.id;

    const handleDisconnect = () => {
        if (ws.has(sessionId)) {
            ws.delete(sessionId);
        }

        ice.revoke(sessionId);
        sendToHost('session:disconnect', sessionId);
    };

    // Repeat session requests from viewers trying to connect to the host
    socket.on('session:request', async (payload) => {
        const { code, username, password } = (payload && typeof payload === 'object') ? payload : {};
        const hasCode = typeof code === 'string' && code.length > 0;
        const hasLogin = (typeof username === 'string' && username.length > 0) && (typeof password === 'string' && password.length > 0);

        if (!hasCode && !hasLogin) return socket.emit('error', 400); // bad request
        if (!session || (hasCode && code !== session.code) || (hasLogin && !settings?.login?.enabled)) return socket.emit('error', 404); // invalid session

        if (hasLogin) {
            if (!settings?.login?.password || username !== settings?.login?.username) return socket.emit('error', 403);

            // validate the password now
            const match = await bcrypt.compare(password, settings.login.password);
            if (!match) return socket.emit('error', 403);
        }

        // Try Cloudflare header first, then x-forwarded-for, then fallback
        let ip = socket.handshake.headers['cf-connecting-ip']
            || (socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim())
            || socket.handshake.address
            || "Unknown Connection";

        // Handle ip formatting incl. IPv4-mapped IPv6 addresses
        if (ip) {
            ip = ip.trim();

            if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");
            if (ip === "::1" || ip === "127.0.0.1") ip = "Local Connection";
        }

        sendToHost('session:request', { sessionId, ip, auth: hasLogin });
    });

    // Repeat session answers from viewer to host when establishing a connection (AFTER approval)
    socket.on('session:answer', (answer) => {
        if (!answer || typeof answer !== 'object') return;
        sendToHost('session:answer', { sessionId, answer });
    });

    for (const name of ['pointer', 'keyboard', 'scroll']) {
        socket.on(`input:${name}`, (data) => {
            if (!ws.has(sessionId) || !settings?.control || !data || typeof data !== 'object') return;

            sendToHost('remote:input', { ...data, name });
        });
    }

    // Remove peer connection when viewer disconnects
    socket.on('session:disconnect', handleDisconnect);
    socket.on('disconnect', handleDisconnect);
});

(async () => {
    try {
        const defaults = { port: 3000, audio: true, control: true, method: 'webrtc', ice: { stun: ice.DEFAULT_STUN_SERVER } };
        let data;

        if (fs.existsSync(settingsPath)) {
            const file = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            data = mergeDeep(defaults, file); // apply defaults if missing (including nested ones)
        } else {
            data = defaults;
        }

        fs.writeFileSync(settingsPath, JSON.stringify(data, null, 4));
        settings = data;

        await newServer().catch(error => console.error(`Unable to start the server on port ${settings.port}: `, error)); // like port is already in use
    } catch (error) {
        console.error('Error loading settings:', error);
    }
})();