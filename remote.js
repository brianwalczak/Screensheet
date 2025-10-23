const { mouse, keyboard, Key, Point } = require("@nut-tree-fork/nut-js");
const keymaps = require('./keymaps');

mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

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

        if (method === 'keydown') {
            if (event.key.length === 1 && !event.relyingKey) { // type
                await keyboard.type(event.key);
            } else { // key press or release
                const key = keymaps[event.code];
                if (key) await keyboard.pressKey(Key[key]);
            }
        } else if (method === 'keyup') {
            if (event.key.length !== 1 || (event.key.length === 1 && event.relyingKey)) { // key release only
                const key = keymaps[event.code];
                if (key) await keyboard.releaseKey(Key[key]);
            }
        }
    } catch { };
};

async function scrollEvent(data) {
    try {
        let { deltaX, deltaY, deltaMode } = data;

        if (deltaMode === 1) { // lines (average)
            deltaX = deltaX * 15;
            deltaY = deltaY * 15;
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

module.exports = { pointerEvent, keyboardEvent, scrollEvent };