const { screen, mouse, keyboard, Key, Button, Point } = require("@nut-tree-fork/nut-js");
const { app: electron, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const keymaps = require('./keymaps.js');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const path = require('path');
const fs = require('fs');

const settingsPath = path.join((electron.isPackaged ? electron.getPath('userData') : __dirname), 'settings.json');
const app = express();
let activeCode = null;
const sessions = new Map();
let settings;
let window;
let server;

async function newServer(port = (settings?.port ?? 3000)) {
    let restart = false;

    if (server) {
        restart = true;
        await server.close();
    }

    server = app.listen(port, () => {
        console.log(`Server has been ${restart ? 'restarted' : 'started'} on http://localhost:${port}.`);
    });
}

function createWindow() {
    window = new BrowserWindow({
        width: 400,
        height: 550,
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

ipcMain.handle('session:start', async (event) => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    activeCode = code;

    return code;
});

ipcMain.handle('session:stop', async (event, code) => {
    activeCode = null;
    return true;
});

ipcMain.handle('session:response', async (event, { sessionId, offer }) => {
    if (sessionId && offer) {
        sessions.set(sessionId, { offer, answer: null });
    }
});

ipcMain.handle('nutjs:mouse', async (event, data) => {
    try {
        const { x, y, method } = data;
        await mouse.move(new Point(x, y));

        if (data?.button && (method === 'mousedown' || method === 'mouseup')) {
            const type = (method === 'mousedown' ? 'pressButton' : 'releaseButton');
            await mouse[type](Button[data.button]);
        }
    } catch { };
});

ipcMain.handle('nutjs:keyboard', async (event, data) => {
    try {
        const { method, event } = data;

        if (method === 'keydown') {
            if (event.key.length === 1 && !event.relyingKey) { // type
                await keyboard.type(event.key);
            } else { // key press or release
                await keyboard.pressKey(Key[keymaps[event.code]]);
            }
        } else if (method === 'keyup') {
            if (event.key.length !== 1 || (event.key.length === 1 && event.relyingKey)) { // key release only
                await keyboard.releaseKey(Key[keymaps[event.code]]);
            }
        }
    } catch { };
});

ipcMain.handle('settings:load', async () => {
    return settings;
});


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

// -- Express Server -- //
app.use(express.static(path.join(__dirname, 'public')));

app.get('/session/:code', async (req, res) => {
    const code = req.params.code.toUpperCase();
    if (!activeCode || code !== activeCode) return res.status(404).json({ error: true, code: 404 });

    const sessionId = uuidv4();
    window.webContents.send('session:request', { sessionId });

    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
        const session = sessions.get(sessionId);

        if (session && session.offer) {
            return res.json({ success: true, id: sessionId, offer: session.offer });
        }

        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    return res.status(408).json({ error: true, code: 408 });
});

app.post('/session/:code/answer', express.json(), (req, res) => {
    const code = req.params.code.toUpperCase();
    const sessionId = req.body?.id;
    if (!activeCode || code !== activeCode || !sessionId) return res.status(404).json({ error: true, code: 404 });

    const session = sessions.get(sessionId);
    if (!session || !session.offer || session.answer) return res.status(404).json({ error: true, code: 404 });

    sessions.set(sessionId, { ...session, answer: req.body?.answer });
    window.webContents.send('session:answer', { sessionId, answer: req.body?.answer });

    res.json({ success: true });
});

(async () => {
    try {
        const defaults = { port: 3000, audio: true, control: true };
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