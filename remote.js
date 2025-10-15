const { mouse, keyboard, Key, Button, Point } = require("@nut-tree-fork/nut-js");
const keymaps = require('./keymaps');

// Handles mouse events, repeated by the host from viewer input
async function mouseEvent(data) {
    try {
        const { x, y, method } = data;
        await mouse.move(new Point(x, y));

        if (data?.button && (method === 'mousedown' || method === 'mouseup')) {
            const type = (method === 'mousedown' ? 'pressButton' : 'releaseButton');
            await mouse[type](Button[data.button]);
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

module.exports = { mouseEvent, keyboardEvent };