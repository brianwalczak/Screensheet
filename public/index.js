const input = document.querySelector('#session-code');
const username = document.querySelector('#username');
const password = document.querySelector('#password');
const connect = document.querySelector('#connect-btn');
const error_container = document.querySelector('#error-message');
const video_container = document.querySelector('#video-container');
const error = document.querySelector('#error-text');
const video = document.querySelector('#video-container video');

import WebRTCConnection from './libs/webrtc.js';
import WebSocketConnection from './libs/websocket.js';

let connection; // the current connection instance (WebRTC or WebSocket)
const socket = io();

const inputChange = (e) => {
    error_container.classList.add('hidden');
};

const inputPress = (e) => {
    if (e.key === 'Enter') {
        startConnection();
    }
};

input.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return inputChange(e);
});

input.addEventListener('keypress', inputPress);

username.addEventListener('input', inputChange);
username.addEventListener('keypress', inputPress);

password.addEventListener('input', inputChange);
password.addEventListener('keypress', inputPress);

function showError(message) {
    error.textContent = message;
    error_container.classList.remove('hidden');
}

function errorCode(code) {
    switch (code) {
        case 404:
            showError('It looks like this connection code is invalid.');
            break;
        case 403:
            showError('The host declined your connection request.');
            break;
        case 410:
            showError('You have been disconnected by the host.');
            break;
        default:
            showError('An unknown error occurred. Please try again.');
            break;
    }

    connect.textContent = 'Connect';
    connect.disabled = false;
}

socket.on('error', (code) => { errorCode(code); });
socket.on('session:offer', async (data) => {
    if (data.declined) return errorCode(403);
    connection = data.type === 'websocket' ? new WebSocketConnection(socket) : new WebRTCConnection();

    const handshake = await connection.acceptOffer(data.offer, onDisconnect);
    
    if (handshake) {
        socket.emit('session:answer', handshake);
    } else {
        socket.emit('session:disconnect');
        onDisconnect();
    }

    connect.textContent = 'Connect';
    connect.disabled = false;
});

async function startConnection() {
    let payload = {};

    switch (document.querySelector('.tab.code').classList.contains('hidden')) {
        case false:
            const code = input.value.trim();

            if (code.length !== 8) {
                showError('Please enter a valid 8-digit connection code.');
                return;
            }

            payload = { code };
            break;
        case true:
            const user = username.value.trim();
            const pass = password.value.trim();

            if (!user || !pass) {
                showError('Please enter both a username and password.');
                return;
            }

            payload = { username: user, password: pass };
            break;
    }

    connect.textContent = 'Requesting approval...';
    connect.disabled = true;
    socket.emit('session:request', payload);
}

async function onDisconnect() {
    video_container.classList.add('hidden');
    input.value = '';
    username.value = '';
    password.value = '';

    connection.disconnect();
    return errorCode(410);
}

socket.on('session:disconnect', onDisconnect);

// -- Handle Keyboard + Mouse -- //
function calculatePos(event) {
    try {
        if (!connection || !connection.screenSize) return { x: 0, y: 0 };
        
        const videoOffset = video.getBoundingClientRect();
        const xRelativeToVideo = event.clientX - videoOffset.left;
        const yRelativeToVideo = event.clientY - videoOffset.top;
        const xInScreen = (xRelativeToVideo / video.clientWidth) * connection.screenSize.width;
        const yInScreen = (yRelativeToVideo / video.clientHeight) * connection.screenSize.height;

        return { x: xInScreen, y: yInScreen };
    } catch {
        return { x: 0, y: 0 };
    }
}

const mouseEvent = (event) => {
    if (!connection || !connection.eventsReady || !connection.screenSize) return;
    event.preventDefault();

    try {
        const { x, y } = calculatePos(event);
        let data = { name: 'mouse', x: Math.floor(x), y: Math.floor(y), method: event.type };

        if (event.type === 'mouseup' || event.type === 'mousedown') {
            const button = event.which === 1 || event.button === 0 ? 'LEFT' : event.which === 3 || event.button === 2 ? 'RIGHT' : null;
            if (button) { data.button = button } else { return; };
        }
        
        connection.sendEvent(data);
    } catch { };
};

const keyEvent = (event) => {
    if (!connection || !connection.eventsReady || !connection.screenSize) return;
    event.preventDefault();

    try {
        const keyInfo = {
            code: event.code,
            key: event.key,
            keyCode: event.keyCode,
            which: event.which,
            relyingKey: event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
        };

        connection.sendEvent({ name: 'keyboard', method: event.type, event: keyInfo });
    } catch { };
};

video.addEventListener('contextmenu', (e) => e.preventDefault());

// -- Mouse Input -- //
video.addEventListener('mousemove', mouseEvent); // mouse was moved
video.addEventListener('mousedown', mouseEvent); // mouse button was pressed down
video.addEventListener('mouseup', mouseEvent); // mouse button was lifted up

// -- Keyboard Input -- //
window.addEventListener('keydown', keyEvent); // key was pressed down
window.addEventListener('keyup', keyEvent); // key was lifted up

input.focus();
window.startConnection = startConnection;