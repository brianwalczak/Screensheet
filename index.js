const { screen } = require("@nut-tree-fork/nut-js");
const { app: electron, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const { mouseEvent, keyboardEvent } = require('./remote');
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
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'app', 'preload.js'),
        },
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

electron.whenReady().then(() => {
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

// Returns the available display sources and their dimensions
ipcMain.handle('display', async (event) => {
    try {
        const display = await desktopCapturer.getSources({ types: ['screen'] });
        const width = await screen.width();
        const height = await screen.height();

        return { display, width, height };
    } catch (error) {
        return new Error(error);
    }
});

ipcMain.handle('stream:frame', async (event, frame) => {
    for (let socketId of ws) {
        io.to(socketId).volatile.emit('stream:frame', frame);
    }
});

// -- Session Management -- //

// Start a new session and generate a new session code
ipcMain.handle('session:start', async (event) => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    activeCode = code;

    return code;
});

// Stop the current session (invalidate the session code)
ipcMain.handle('session:stop', async (event) => {
    activeCode = null;
    ws.clear();

    return true;
});

// Sends session responses from the host to the viewer (accept or decline)
ipcMain.handle('session:response', async (event, { sessionId, offer, type, declined }) => {
    if (sessionId) {
        if (offer && !declined) { // accept
            io.to(sessionId).emit('session:offer', { offer, type });
        } else { // decline
            io.to(sessionId).emit('session:offer', { declined: true });
        }
    }
});

// Sends a disconnect signal to the viewer to end the session
ipcMain.handle('session:disconnect', async (event, sessionId) => {
    if (sessionId) {
        if (ws.has(sessionId)) {
            ws.delete(sessionId);
        }

        io.to(sessionId).emit('session:disconnect');
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
        const updated = { ...settings, ...modified };
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

    // Repeat session requests from viewers trying to connect to the host
    socket.on('session:request', async (code) => {
        if (!activeCode || code !== activeCode) return socket.emit('error', 404);

        // Try Cloudflare header first, then x-forwarded-for, then fallback
        const ip = socket.handshake.headers['cf-connecting-ip']
            || (socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim())
            || socket.handshake.address
            || null;

        window.webContents.send('session:request', { sessionId, ip });
    });

    // Repeat session answers from viewer to host when establishing a connection (AFTER approval)
    socket.on('session:answer', (answer) => {
        window.webContents.send('session:answer', { sessionId, answer });

        if (answer.type === 'websocket') {
            ws.add(sessionId);
        }
    });

    socket.on('nutjs:mouse', (data) => {
        if (!ws.has(sessionId) || !settings.control) return;

        mouseEvent(data);
    });

    socket.on('nutjs:keyboard', (data) => {
        if (!ws.has(sessionId) || !settings.control) return;

        keyboardEvent(data);
    });

    // Remove peer connection when viewer disconnects
    socket.on('disconnect', () => {
        if (ws.has(sessionId)) {
            ws.delete(sessionId);
        }
        
        window.webContents.send('session:disconnect', sessionId);
    });
});

(async () => {
    try {
        const defaults = { port: 3000, audio: true, control: true, magic: false, method: 'webrtc' };
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