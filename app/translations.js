const labels = {
    normal: {
        appTitle: "Screensheet Client",
        title: "Screensheet",
        description: "Share your desktop remotely in seconds",
        codeLabel: "Connection Code",
        warningTitle: "Security Warning",
        warningDescription: `<span class="font-semibold">Never</span> share this code with anyone you don't trust. It grants full device access.`,
        connectionsLabel: "Connected", // [... ago] OR [just now]

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
        serverPort: "Server Port"
    },
    magic: {
        appTitle: "Screenmagic Client",
        title: "Magic Mode",
        description: "Summon a portal to your dimension in seconds",
        codeLabel: "Portal Key",
        warningTitle: "Portal Warning",
        warningDescription: `<span class="font-semibold">Never</span> share this key with untrusted beings. It grants complete access to your dimension.`,
        connectionsLabel: "Entered", // [... ago] OR [just now]

        startBtn: "Summon Portal",
        startingBtn: "Summoning portal...",
        endBtn: "Close Portal",
        copyBtn: "Grab Key",
        copiedBtn: "Grabbed!",

        menu_home: "Sanctuary",
        menu_connections: "Visitors",
        menu_settings: "Enchantments",

        connected: "Portal Opened",
        disconnected: "Portal Closed",
        waiting: "Summoning",
        active: "Open",
        inactive: "Sealed",

        audioSharing: "Sound Relay",
        remoteControl: "Portal Control",
        serverPort: "Portal Node"
    }
};

if (typeof module !== 'undefined' && module.exports) {
    try { module.exports = labels; } catch (e) { }
}