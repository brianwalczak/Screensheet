// data collected by Brian Walczak, compiled with generative AI - contains key mappings for keyboard //
const os = require('os');
const platform = os.platform();

module.exports = {
    // Alphabet keys (KeyA -> A, KeyB -> B, etc.)
    "KeyA": "A",
    "KeyB": "B",
    "KeyC": "C",
    "KeyD": "D",
    "KeyE": "E",
    "KeyF": "F",
    "KeyG": "G",
    "KeyH": "H",
    "KeyI": "I",
    "KeyJ": "J",
    "KeyK": "K",
    "KeyL": "L",
    "KeyM": "M",
    "KeyN": "N",
    "KeyO": "O",
    "KeyP": "P",
    "KeyQ": "Q",
    "KeyR": "R",
    "KeyS": "S",
    "KeyT": "T",
    "KeyU": "U",
    "KeyV": "V",
    "KeyW": "W",
    "KeyX": "X",
    "KeyY": "Y",
    "KeyZ": "Z",

    // Number keys (Digit0 -> Num0, Digit1 -> Num1, etc.)
    "Digit0": "Num0",
    "Digit1": "Num1",
    "Digit2": "Num2",
    "Digit3": "Num3",
    "Digit4": "Num4",
    "Digit5": "Num5",
    "Digit6": "Num6",
    "Digit7": "Num7",
    "Digit8": "Num8",
    "Digit9": "Num9",

    // Function keys
    "F1": "F1",
    "F2": "F2",
    "F3": "F3",
    "F4": "F4",
    "F5": "F5",
    "F6": "F6",
    "F7": "F7",
    "F8": "F8",
    "F9": "F9",
    "F10": "F10",
    "F11": "F11",
    "F12": "F12",
    "F13": "F13",
    "F14": "F14",
    "F15": "F15",
    "F16": "F16",
    "F17": "F17",
    "F18": "F18",
    "F19": "F19",
    "F20": "F20",
    "F21": "F21",
    "F22": "F22",
    "F23": "F23",
    "F24": "F24",

    // Arrow keys
    "ArrowLeft": "Left",
    "ArrowRight": "Right",
    "ArrowUp": "Up",
    "ArrowDown": "Down",

    // Modifier keys - platform specific handling
    "AltLeft": "LeftAlt",
    "AltRight": "RightAlt",
    "ControlLeft": "LeftControl",
    "ControlRight": "RightControl",
    "ShiftLeft": "LeftShift",
    "ShiftRight": "RightShift",

    // Meta keys (Command on Mac, Windows key on Windows, Super on Linux)
    "MetaLeft": platform === "darwin" ? "LeftCmd" : platform === "win32" ? "LeftWin" : "LeftSuper",
    "MetaRight": platform === "darwin" ? "RightCmd" : platform === "win32" ? "RightWin" : "RightSuper",

    // Special keys
    "Space": "Space",
    "Enter": "Enter",
    "Backspace": "Backspace",
    "Delete": "Delete",
    "Tab": "Tab",
    "Escape": "Escape",
    "CapsLock": "CapsLock",
    "NumLock": "NumLock",
    "ScrollLock": "ScrollLock",
    "Insert": "Insert",
    "Home": "Home",
    "End": "End",
    "PageUp": "PageUp",
    "PageDown": "PageDown",
    "Pause": "Pause",
    "PrintScreen": "Print",

    // Punctuation and symbols
    "Backquote": "Grave",        // ` key
    "Minus": "Minus",            // - key
    "Equal": "Equal",            // = key
    "BracketLeft": "LeftBracket", // [ key
    "BracketRight": "RightBracket", // ] key
    "Backslash": "Backslash",    // \ key
    "Semicolon": "Semicolon",    // ; key
    "Quote": "Quote",            // ' key
    "Comma": "Comma",            // , key
    "Period": "Period",          // . key
    "Slash": "Slash",            // / key

    // Numpad keys
    "Numpad0": "NumPad0",
    "Numpad1": "NumPad1",
    "Numpad2": "NumPad2",
    "Numpad3": "NumPad3",
    "Numpad4": "NumPad4",
    "Numpad5": "NumPad5",
    "Numpad6": "NumPad6",
    "Numpad7": "NumPad7",
    "Numpad8": "NumPad8",
    "Numpad9": "NumPad9",
    "NumpadAdd": "Add",
    "NumpadSubtract": "Subtract",
    "NumpadMultiply": "Multiply",
    "NumpadDivide": "Divide",
    "NumpadDecimal": "Decimal",
    "NumpadEnter": "Return",
    "NumpadEqual": "Equal",
    "NumpadComma": "Comma",

    // Audio/Media keys
    "AudioVolumeUp": "AudioVolUp",
    "AudioVolumeDown": "AudioVolDown",
    "AudioVolumeMute": "AudioMute",
    "MediaPlayPause": "AudioPlay", // nut.js doesn't have PlayPause, using AudioPlay
    "MediaStop": "AudioStop",
    "MediaTrackNext": "AudioNext",
    "MediaTrackPrevious": "AudioPrev",
    "MediaSelect": null,

    // Context menu
    "ContextMenu": "Menu",

    // International keys
    "IntlBackslash": "Backslash",
    "IntlRo": null,
    "IntlYen": null,

    // Browser-specific keys (most not supported in nut.js)
    "BrowserBack": null,
    "BrowserForward": null,
    "BrowserHome": null,
    "BrowserRefresh": null,
    "BrowserSearch": null,
    "BrowserStop": null,
    "BrowserFavorites": null,

    // Application launch keys
    "LaunchApp1": null,
    "LaunchApp2": null,  
    "LaunchMail": null,

    // System keys
    "Power": null,
    "Sleep": null,
    "WakeUp": null,
    "Eject": null,

    // Input method keys
    "Convert": null,
    "NonConvert": null,
    "KanaMode": null,
    "Lang1": null,
    "Lang2": null,
    "Lang3": null,
    "Lang4": null,

    // Edit keys (not supported in nut.js as individual key)
    "Copy": null,
    "Cut": null,
    "Paste": null,
    "Undo": null,

    // Help key
    "Help": null
};