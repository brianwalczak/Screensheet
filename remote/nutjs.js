const { mouse, keyboard, screen, Key, Point } = require("@nut-tree-fork/nut-js");
const keymaps = require('@screensheet/keymaps').nutjs;

mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

const heldKeys = new Map(); // keys currently pressed down, so keyup/blur releases them and browser repeats are skipped

// Handles pointer events, repeated by the host from viewer input
async function pointerEvent(data) {
    try {
        const { x, y, method } = data;
        await mouse.move(new Point(x, y));

        if (data.button !== undefined && (method === 'pointerdown' || method === 'pointerup')) {
            const type = (method === 'pointerdown' ? 'pressButton' : 'releaseButton');

            await mouse[type](data.button);
        }
    } catch { };
};

// Handles keyboard events, repeated by the host from viewer input
async function keyboardEvent(data) {
    try {
        const { method, event } = data;

        if (method === 'keydown' && !heldKeys.has(event.code)) { // skips repeat keydowns from the browser while a key is held (host repeats it)
            const key = Key[keymaps[event.code]];

            if (key === undefined) { // no nut-js key for it, type the character instead
                if (event.key.length === 1) await keyboard.type(event.key);
                return;
            }

            heldKeys.set(event.code, key);
            await keyboard.pressKey(key);
        } else if (method === 'keyup' && heldKeys.has(event.code)) {
            const key = heldKeys.get(event.code);

            heldKeys.delete(event.code);
            await keyboard.releaseKey(key);
        } else if (method === 'releaseall') {
            await releaseAll();
        }
    } catch { };
};

// Handles scroll events, repeated by the host from viewer input
async function scrollEvent(data) {
    try {
        let { deltaX, deltaY, deltaMode } = data;

        if (deltaMode === 1) { // lines (average)
            deltaX = deltaX * 5;
            deltaY = deltaY * 5;
        }

        if (deltaY > 0) {
            await mouse.scrollDown(Math.abs(deltaY));
        } else if (deltaY < 0) {
            await mouse.scrollUp(Math.abs(deltaY));
        }

        if (deltaX > 0) {
            await mouse.scrollRight(Math.abs(deltaX));
        } else if (deltaX < 0) {
            await mouse.scrollLeft(Math.abs(deltaX));
        }
    } catch { };
}

// Releases any keys still held down (viewer lost focus, or the session ended mid-press)
async function releaseAll() {
    for (const key of heldKeys.values()) {
        try {
            await keyboard.releaseKey(key);
        } catch { };
    }

    heldKeys.clear();
}

// Returns the screen dimensions
async function getScreenSize() {
    return { width: await screen.width(), height: await screen.height() };
}

module.exports = { pointerEvent, keyboardEvent, scrollEvent, getScreenSize, dispose: releaseAll };
