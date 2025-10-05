const input = document.querySelector('#session-code');
const connect = document.querySelector('#connect-btn');
const error_container = document.querySelector('#error-message');
const error = document.querySelector('#error-text');
const video = document.querySelector('video');
const pc = new RTCPeerConnection();

pc.ontrack = (event) => {
    video.classList.remove('hidden');
    video.srcObject = event.streams[0];
};

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

async function connection() {
    const code = input.value.trim();

    if (code.length !== 8) {
        showError('Please enter a valid 8-digit connection code.');
        return;
    }

    connect.textContent = 'Connecting...';
    connect.disabled = true;

    const req = await fetch(`/session/${input.value}`);
    const res = await req.json();

    if (res.error) {
        showError(res.error);
    } else {
        await pc.setRemoteDescription(res.offer);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await fetch(`/session/${input.value}/answer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: res.id,
                answer: {
                    type: pc.localDescription.type,
                    sdp: pc.localDescription.sdp
                }
            })
        });
    }

    connect.textContent = 'Connect';
    connect.disabled = false;
}

input.focus();