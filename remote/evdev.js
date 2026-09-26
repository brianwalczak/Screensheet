const dbus = require('dbus-next');
const crypto = require('crypto');
const keymaps = require('@screensheet/keymaps').evdev;

const token = () => ('t' + crypto.randomBytes(8).toString('hex'));
const BUTTONS = { 0: 0x110, 1: 0x112, 2: 0x111 }; // BTN_LEFT / BTN_MIDDLE / BTN_RIGHT

const heldKeys = new Map(); // keys currently pressed down, so keyup/blur releases them and browser repeats are skipped
let active = null; // the active portal setup (bus, interfaces, handle, nodeId, scale) during hosting

// Handles pointer events, repeated by the host from viewer input
async function pointerEvent(data) {
    if (!active) return;

    try {
        const { x, y, method } = data;
        notify('NotifyPointerMotionAbsolute', active.nodeId, x * active.scale.x, y * active.scale.y);

        if (data.button !== undefined && (method === 'pointerdown' || method === 'pointerup')) {
            const type = (method === 'pointerdown' ? 1 : 0);
            const button = BUTTONS[data.button];

            if (button !== undefined) notify('NotifyPointerButton', button, type);
        }
    } catch { };
};

// Handles keyboard events, repeated by the host from viewer input
async function keyboardEvent(data) {
    if (!active) return;

    try {
        const { method, event } = data;

        if (method === 'keydown' && !heldKeys.has(event.code)) { // skips repeat keydowns from the browser while a key is held (host repeats it)
            const key = keymaps[event.code];
            if (!key) return; // no evdev key for it, skip.

            heldKeys.set(event.code, key);
            notify('NotifyKeyboardKeycode', key, 1);
        } else if (method === 'keyup' && heldKeys.has(event.code)) {
            const key = heldKeys.get(event.code);

            heldKeys.delete(event.code);
            notify('NotifyKeyboardKeycode', key, 0);
        } else if (method === 'releaseall') {
            await releaseAll();
        }
    } catch { };
};

// Handles scroll events, repeated by the host from viewer input
async function scrollEvent(data) {
    if (!active) return;

    try {
        let { deltaX, deltaY, deltaMode } = data;

        if (deltaMode === 1) { // lines (average)
            deltaX = deltaX * 5;
            deltaY = deltaY * 5;
        }

        notify('NotifyPointerAxis', deltaX, deltaY);
    } catch { };
}

// Releases any keys still held down (viewer lost focus, or the session ended mid-press)
async function releaseAll() {
    for (const key of heldKeys.values()) {
        notify('NotifyKeyboardKeycode', key, 0);
    }

    heldKeys.clear();
}

// Creates the portal session and shows the permission request when session starts
async function init(screenSize) {
    const bus = dbus.sessionBus();
    let sessionInterface = null;

    // Stops using the session if it ends unexpectedly
    const onClosed = () => {
        if (active?.bus !== bus) return; // not the active session

        heldKeys.clear();
        active = null;
        bus.disconnect();
    };

    bus.on('error', (error) => {
        console.error("A D-Bus error occurred with Wayland remote input: ", error);
        onClosed();
    });

    try {
        const portal = await bus.getProxyObject('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop').catch((error) => {
            console.error("Unable to reach the desktop portal: ", error);
            throw new Error('Your desktop does not support remote input (xdg-desktop-portal is not running).');
        });
        
        if (!portal.interfaces['org.freedesktop.portal.RemoteDesktop']) {
            throw new Error('Your desktop does not support remote input (org.freedesktop.portal.RemoteDesktop is not available).');
        }

        if (!portal.interfaces['org.freedesktop.portal.ScreenCast']) {
            throw new Error('Your desktop does not support remote input (org.freedesktop.portal.ScreenCast is not available).');
        }

        const remoteInterface = portal.getInterface('org.freedesktop.portal.RemoteDesktop');
        const { session_handle } = await request(bus, remoteInterface, 'CreateSession', [], { session_handle_token: new dbus.Variant('s', token()) });

        const sessionObj = await bus.getProxyObject('org.freedesktop.portal.Desktop', session_handle.value,
            `<node>
                <interface name='org.freedesktop.portal.Session'>
                    <method name='Close'/>
                    <signal name='Closed'>
                        <arg type='a{sv}' name='details'/>
                    </signal>
                </interface>
            </node>`
        );

        sessionInterface = sessionObj.getInterface('org.freedesktop.portal.Session');
        sessionInterface.on('Closed', onClosed);

        await request(bus, remoteInterface, 'SelectDevices', [session_handle.value], { types: new dbus.Variant('u', 1 | 2) }); // keyboard | pointer

        await request(bus, portal.getInterface('org.freedesktop.portal.ScreenCast'), 'SelectSources', [session_handle.value], {
            types: new dbus.Variant('u', 1), // monitor
            multiple: new dbus.Variant('b', false)
        });

        const { devices, streams } = await request(bus, remoteInterface, 'Start', [session_handle.value, ''], {}, 60000); // show request dialog and wait for response (60 seconds max)
        const [nodeId, props] = streams?.value?.[0] ?? [];
        const [width, height] = props?.size?.value ?? [];

        if (nodeId === undefined || !width || !height) throw new Error("Unable to access your display stream.");
        if ((devices?.value & (1 | 2)) !== (1 | 2)) throw new Error("Remote control wasn't allowed in the permission prompt.");

        const scale = (screenSize?.width && screenSize?.height) ? { x: width / screenSize.width, y: height / screenSize.height } : { x: 1, y: 1 };
        active = { bus, interfaces: { session: sessionInterface, remote: remoteInterface }, handle: session_handle.value, nodeId, scale };
    } catch (error) {
        await closeSession(bus, sessionInterface);
        throw error;
    }
}

// Releases any keys still held down and closes the portal session once hosting ends
async function dispose() {
    await releaseAll();

    const current = active;
    active = null; // cleared first so onClosed isn't triggered

    if (current) await closeSession(current.bus, current.interfaces.session);
}

// Closes the portal session (if one was created) and disconnects from D-Bus
async function closeSession(bus, sessionInterface) {
    try {
        await sessionInterface?.Close();
    } catch { };

    bus.disconnect();
}

// Sends an input event to the portal
async function notify(method, ...args) {
    try {
        await active?.interfaces.remote[method](active.handle, {}, ...args);
    } catch { };
}

// Calls a portal method and waits for its response
async function request(bus, target, method, args, options, timeoutMs = 10000) {
    const handleToken = token();
    const sender = bus.name.replace(/^:/, '').replace(/\./g, '_');
    const requestObj = await bus.getProxyObject('org.freedesktop.portal.Desktop', `/org/freedesktop/portal/desktop/request/${sender}/${handleToken}`,
        `<node>
            <interface name='org.freedesktop.portal.Request'>
                <method name='Close'/>
                <signal name='Response'>
                <arg type='u' name='response'/>
                <arg type='a{sv}' name='results'/>
                </signal>
            </interface>
        </node>`
    );

    const requestInterface = requestObj.getInterface('org.freedesktop.portal.Request');
    let timeout;

    const response = new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(method === 'Start' ? "The permission prompt wasn't answered in time." : 'Your desktop took too long to respond.')), timeoutMs);

        requestInterface.once('Response', (code, results) => {
            clearTimeout(timeout);

            if (code !== 0) console.error(`Portal request "${method}" ended with code ${code}`);
            if (code !== 0 && method === 'Start') return reject(new Error('The permission prompt was declined or closed.')); // only Start shows a prompt
            if (code !== 0) return reject(new Error('Your desktop was unable to start a remote session.'));
            resolve(results);
        });
    });

    try {
        await target[method](...args, { ...options, handle_token: new dbus.Variant('s', handleToken) });
    } catch (error) {
        clearTimeout(timeout);
        requestInterface.removeAllListeners('Response');

        console.error(`Portal request "${method}" failed: `, error);
        throw new Error('Your desktop was unable to start a remote session.');
    }

    return response;
}

module.exports = { pointerEvent, keyboardEvent, scrollEvent, init, dispose };
