const os = require('os');
const nutjs = require('./nutjs.js');

let backend = nutjs;
let ready = false;

// Sets up input when a hosting session starts
async function init(screenSize) {
    if (ready) return;
    ready = true;

    const isWayland = (os.platform() === 'linux' && (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY));
    if (!isWayland) return; // nut.js works everywhere else

    // For Wayland interfaces, use native evdev layer (nut.js is not supported), and disable input if it's unavailable
    try {
        const evdev = require('./evdev.js');
        await evdev.init(screenSize);
        backend = evdev;
    } catch (error) {
        console.error(error);
        backend = { pointerEvent() {}, keyboardEvent() {}, scrollEvent() {}, dispose: async () => {} }; // ignores all input

        alert(`${error.message}\n\nRemote control is disabled for this session. Restart the session to try again.`);
    }
}

// Cleans up input when a hosting session stops
async function dispose() {
    await backend.dispose();
    backend = nutjs;
    ready = false;
}

module.exports = {
    init,
    dispose,
    pointerEvent: (data) => backend.pointerEvent(data),
    keyboardEvent: (data) => backend.keyboardEvent(data),
    scrollEvent: (data) => backend.scrollEvent(data),
    getScreenSize: nutjs.getScreenSize // always nut.js, since reading the screen size works everywhere
};
