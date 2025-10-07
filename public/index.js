const input = document.querySelector('#session-code');
const connect = document.querySelector('#connect-btn');
const error_container = document.querySelector('#error-message');
const video_container = document.querySelector('#video-container');
const error = document.querySelector('#error-text');
const video = document.querySelector('#video-container video');
let pc = new RTCPeerConnection();
const socket = io();
let activeCode = null;
let screenSize;
let channel;

input.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    error_container.classList.add('hidden');
});

input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        connection();
    }
});

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
    activeCode = null;
}

socket.on('error', (code) => { errorCode(code); });
socket.on('session:offer', async (data) => {
    if (data.declined) return errorCode(403);

    pc.ontrack = (event) => {
        video_container.classList.remove('hidden');
        video.srcObject = event.streams[0];
    };

    await pc.setRemoteDescription(data.offer);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('session:answer', {
        code: activeCode,
        answer: {
            type: pc.localDescription.type,
            sdp: pc.localDescription.sdp
        }
    });

    pc.ondatachannel = (event) => {
        event.channel.onmessage = (e) => {
            try {
                const message = JSON.parse(e.data);

                if (message.width && message.height) {
                    screenSize = { width: message.width, height: message.height };
                    channel = event.channel;
                }
            } catch { };
        };
    };

    connect.textContent = 'Connect';
    connect.disabled = false;
});

socket.on('session:disconnect', () => {
    video_container.classList.add('hidden');
    input.value = '';
    screenSize = null;
    channel = null;
    activeCode = null;

    pc.close();
    pc = new RTCPeerConnection();
    return errorCode(410);
});

async function connection() {
    const code = input.value.trim();

    if (code.length !== 8) {
        showError('Please enter a valid 8-digit connection code.');
        return;
    }

    activeCode = code;
    connect.textContent = 'Requesting approval...';
    connect.disabled = true;

    socket.emit('session:request', { code: activeCode });
}

// -- Handle Keyboard + Mouse -- //
function calculatePos(event) {
    try {
        const videoOffset = video.getBoundingClientRect();
        const xRelativeToVideo = event.clientX - videoOffset.left;
        const yRelativeToVideo = event.clientY - videoOffset.top;
        const xInScreen = (xRelativeToVideo / video.clientWidth) * screenSize.width;
        const yInScreen = (yRelativeToVideo / video.clientHeight) * screenSize.height;

        return { x: xInScreen, y: yInScreen };
    } catch {
        return { x: 0, y: 0 };
    }
}

const mouseEvent = (event) => {
    if (!channel || channel?.readyState !== 'open') return;
    event.preventDefault();

    try {
        const { x, y } = calculatePos(event);
        let data = { name: 'mouse', x: Math.floor(x), y: Math.floor(y), method: event.type };

        if (event.type === 'mouseup' || event.type === 'mousedown') {
            const button = event.which === 1 || event.button === 0 ? 'LEFT' : event.which === 3 || event.button === 2 ? 'RIGHT' : null;
            if (button) { data.button = button } else { return; };
        }

        channel.send(JSON.stringify(data));
    } catch { };
};

const keyEvent = (event) => {
    if (!channel || channel?.readyState !== 'open') return;
    event.preventDefault();

    try {
        const keyInfo = {
            code: event.code,
            key: event.key,
            keyCode: event.keyCode,
            which: event.which,
            relyingKey: event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
        };

        channel.send(JSON.stringify({ name: 'keyboard', method: event.type, event: keyInfo }));
    } catch { };
};

video.addEventListener('contextmenu', (e) => e.preventDefault());
video.addEventListener('mousemove', mouseEvent);
video.addEventListener('mousedown', mouseEvent);
video.addEventListener('mouseup', mouseEvent);
window.addEventListener('keydown', keyEvent);
window.addEventListener('keyup', keyEvent);

input.focus();