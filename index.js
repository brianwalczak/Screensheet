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
let activeCode = null;
let settings;
let window;
let server;

let ws = new Set();

electron.commandLine.appendSwitch('enable-logging');

async function newServer(port = (settings?.port ?? 3000)) {
    let restart = false;

    if (server) {
        restart = true;
        await server.close();
    }

    server = http.listen(port, () => {
        console.log(`Server has been ${restart ? 'restarted' : 'started'} on http://localhost:${port}.`);
    });
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
ipcMain.handle('display', async (event) => {
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

ipcMain.handle('stream:frame', async (event, frame) => {
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
ipcMain.handle('session:start', async (event) => {
    activeCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    return activeCode;
});

// Stop the current session (invalidate the session code)
ipcMain.handle('session:stop', async (event) => {
    activeCode = null;
    ws.clear();
    ice.revokeAll();

    return true;
});

// Sends session responses from the host to the viewer (accept or decline)
ipcMain.handle('session:response', async (event, { sessionId, offer, type, iceServers, declined }) => {
    try {
        if (sessionId) {
            if (offer && !declined) { // accept
                io.to(sessionId).emit('session:offer', { offer, type, iceServers });
            } else { // decline
                io.to(sessionId).emit('session:offer', { declined: true });
            }
        }
    } catch (error) {
        console.error("Error sending session response to socket ", sessionId, ": ", error);
    }
});

// Sends a disconnect signal to the viewer to end the session
ipcMain.handle('session:disconnect', async (event, sessionId) => {
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
ipcMain.handle('ice:resolve', async (event, sessionId) => {
    const iceServers = await ice.resolve(settings, sessionId);
    if (!io.sockets.sockets.has(sessionId)) ice.revoke(sessionId); // viewer left while resolving

    return iceServers;
});

// Tests Cloudflare TURN keys before saving them
ipcMain.handle('ice:test', async (event, keys) => {
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
ipcMain.handle('settings:update', async (event, modified) => {
    try {
        if (modified?.password && modified.password.length > 0) {
            modified.password = (await bcrypt.hash(modified.password, 10));
        }

        const updated = { ...settings, ...modified };
        updated.stunServer = updated.stunServer ? updated.stunServer : ice.DEFAULT_STUN_SERVER; // reset to default if cleared
        fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 4));

        if (modified.port && modified.port !== (settings?.port ?? 3000) && server) {
            await newServer(modified.port);
        }

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
        window.webContents.send('session:disconnect', sessionId);
    };

    // Repeat session requests from viewers trying to connect to the host
    socket.on('session:request', async (payload) => {
        if (!payload || !activeCode || (!payload.code && (!payload.username || !payload.password)) || (payload.username && payload.password && !settings?.login)) return socket.emit('error', 404);
        if (payload.code && payload.code !== activeCode) return socket.emit('error', 404);

        if (payload.username && payload.password) {
            const match = await bcrypt.compare(payload.password, settings?.password || '');
            if (!settings?.username || !settings?.password || !match) return socket.emit('error', 403);
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

        window.webContents.send('session:request', { sessionId, ip, auth: (payload.username && payload.password) });
    });

    // Repeat session answers from viewer to host when establishing a connection (AFTER approval)
    socket.on('session:answer', (answer) => {
        if (!answer) return;
        window.webContents.send('session:answer', { sessionId, answer });

        if (answer?.type === 'websocket') {
            ws.add(sessionId);
        }
    });

    for (const name of ['pointer', 'keyboard', 'scroll']) {
        socket.on(`input:${name}`, (data) => {
            if (!ws.has(sessionId) || !settings.control || !data) return;

            window.webContents.send('remote:input', { ...data, name });
        });
    }

    // Remove peer connection when viewer disconnects
    socket.on('session:disconnect', handleDisconnect);
    socket.on('disconnect', handleDisconnect);
});

(async () => {
    try {
        const defaults = { port: 3000, audio: true, control: true, method: 'webrtc', stunServer: ice.DEFAULT_STUN_SERVER };
        let data;

        if (fs.existsSync(settingsPath)) {
            const file = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            data = { ...defaults, ...file }; // apply defaults if missing
        } else {
            data = defaults;
        }

        fs.writeFileSync(settingsPath, JSON.stringify(data, null, 4));
        settings = data;

        await newServer();
    } catch (error) {
        console.error('Error loading settings:', error);
    }
})();