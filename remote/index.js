const os = require('os');

const disabled = { pointerEvent() {}, keyboardEvent() {}, scrollEvent() {}, dispose: async () => {} }; // ignores all input
let backend = disabled; // no input until a hosting session starts
let ready = false;

// Sets up input when a hosting session starts
async function init() {
    if (ready) return;
    ready = true;

    const isWayland = (os.platform() === 'linux' && (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY));

    // Wayland needs native evdev layer, everything else uses nut.js
    try {
        const selected = require(isWayland ? './evdev.js' : './nutjs.js');
        await selected.init();
        backend = selected;
    } catch (error) {
        console.error(error);
        alert(`${error.message}\n\nRemote control is disabled for this session. Restart the session to try again.`);
    }
}

// Cleans up input when a hosting session stops
async function dispose() {
    await backend.dispose();
    backend = disabled;
    ready = false;
}

module.exports = {
    init,
    dispose,
    pointerEvent: (data) => backend.pointerEvent(data),
    keyboardEvent: (data) => backend.keyboardEvent(data),
    scrollEvent: (data) => backend.scrollEvent(data)
};
