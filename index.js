const { screen } = require("@nut-tree-fork/nut-js");
const { app: electron, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const keymaps = require('./keymaps.js');
const settings = require('./settings.js');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const path = require('path');
let window;

const app = express();
let activeCode = null;
const sessions = new Map();
const PORT = settings.port ?? 3000;

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
    if (!activeCode || code !== activeCode) return res.status(404).json({ error: 'It looks like this connection code is invalid.' });

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

    return res.status(408).json({ error: 'Connection was closed unexpectedly.' });
});

app.post('/session/:code/answer', express.json(), (req, res) => {
    const code = req.params.code.toUpperCase();
    const sessionId = req.body?.id;
    if (!activeCode || code !== activeCode || !sessionId) return res.status(400).json({ error: 'It looks like this connection code is invalid.' });

    const session = sessions.get(sessionId);
    if (!session || !session.offer || session.answer) return res.status(404).json({ error: 'It looks like this connection code is invalid.' });

    sessions.set(sessionId, { ...session, answer: req.body?.answer });
    window.webContents.send('session:answer', { sessionId, answer: req.body?.answer });

    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});