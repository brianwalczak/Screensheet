const labels = {
    normal: {
        appTitle: "Screensheet Client",
        title: "Screensheet",
        description: "Share your desktop remotely in seconds",
        codeLabel: "Connection Code",
        warningTitle: "Security Warning",
        warningDescription: `<span class="font-semibold">Never</span> share this code with anyone you don't trust. It grants full device access.`,
        connectionsLabel: "Connected {status}",

        startBtn: "Start Session",
        startingBtn: "Starting session...",
        endBtn: "Stop Session",
        copyBtn: "Copy",
        copiedBtn: "Copied!",

        menu_home: "Home",
        menu_connections: "Connections",
        menu_settings: "Settings",

        connected: "Connected",
        disconnected: "Disconnected",
        waiting: "Waiting",
        active: "Active",
        inactive: "Inactive",

        audioSharing: "Audio Sharing",
        remoteControl: "Remote Control",
        serverPort: "Server Port",
        connectionMethod: "Protocol",
        unattendedAccess: "Unattended Access"
    },
    theme: {
        appTitle: "Screensheet Client",
        title: "Autumn Mode",
        description: "Embrace the season of change by gathering together!",
        codeLabel: "Leaf Pattern",
        warningTitle: "Harvest Warning",
        warningDescription: `<span class="font-semibold">Never</span> share this leaf with untrusted beings. It grants complete access to your harvest.`,
        connectionsLabel: "Joined {status}",

        startBtn: "Start Harvest",
        startingBtn: "Gathering leaves...",
        endBtn: "End Harvest",
        copyBtn: "Collect Leaf",
        copiedBtn: "Collected!",

        menu_home: "Cabin",
        menu_connections: "Gatherings",
        menu_settings: "Forest",

        connected: "Joined Harvest",
        disconnected: "Left Harvest",
        waiting: "Getting Ready",
        active: "Ready to Gather",
        inactive: "Resting",

        audioSharing: "Listen Along",
        remoteControl: "Share Leaves",
        serverPort: "Cabin Location",
        connectionMethod: "Gathering Type",
        unattendedAccess: "Always-Open Cabin"
    }
};

// Returns the correct label based on whether theme mode is enabled
function getLabel(key) {
    return theme.checked ? labels.theme[key] : labels.normal[key];
};

// Finds a matching label in the opposite mode (for status updates)
const findMatching = (text, location) => {
    const keyName = Object.keys(labels[location]).find(k => labels[location][k] === text);
    if (!keyName) return null;

    return labels[location === 'normal' ? 'theme' : 'normal'][keyName] ?? null;
};

if (typeof module !== 'undefined' && module.exports) {
    try { module.exports = { getLabel, findMatching }; } catch (e) { }
};