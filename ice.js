const DEFAULT_STUN_SERVER = "stun:stun.cloudflare.com:3478";
const credentials = new Map();

// Generate short-lived Cloudflare TURN credentials
async function generateCredential({ id, token } = {}) {
    if (!id || !token) throw new Error("Cloudflare Turn Token ID and API Token are required.");

    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 86400 }),
        signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw Object.assign(new Error(`Cloudflare responded with status ${res.status}.`), { status: res.status });
    const { iceServers } = await res.json();
    const username = iceServers.find((server) => server.username)?.username;

    // Only keep TURN (STUN added separately) and drop port 53 URLs cause browsers time out on them
    const servers = iceServers
        .filter((server) => server.username)
        .map((server) => ({ ...server, urls: [].concat(server.urls).filter((url) => !/:53(\?|$)/.test(url)) }))
        .filter((server) => server.urls.length > 0);
    return { servers, credential: { id, token, username } };
}

// Revokes short-lived Cloudflare TURN credentials (so they can't be reused)
async function revokeCredential({ id, token, username } = {}) {
    if (!id || !token || !username) return;

    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/${encodeURIComponent(username)}/revoke`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`Cloudflare responded with status ${res.status}.`);
}

// Revokes a viewer's Cloudflare TURN credentials if available
async function revoke(sessionId) {
    const credential = credentials.get(sessionId);
    if (!credential) return;

    credentials.delete(sessionId);

    try {
        await revokeCredential(credential);
    } catch (error) {
        console.error("Error revoking TURN credentials for session ", sessionId, ": ", error);
    }
}

// Revokes all viewers' Cloudflare TURN credentials
function revokeAll() {
    return Promise.all([...credentials.keys()].map((sessionId) => revoke(sessionId)));
}

// Resolves the ICE servers for a viewer from settings
async function resolve(settings, sessionId) {
    const stun = [{ urls: settings?.ice?.stun || DEFAULT_STUN_SERVER }];

    // Custom TURN servers (if any)
    if (settings?.ice?.method !== "cloudflare") {
        return [...stun, ...(settings?.ice?.turn ?? [])]; // empty if no custom
    }

    // Cloudflare TURN servers (skipped if keys were never set)
    if (!settings.ice.cloudflare?.id || !settings.ice.cloudflare?.token) return stun;

    try {
        const { servers, credential } = await generateCredential(settings.ice.cloudflare);

        await revoke(sessionId); // revoke any previous credentials for the viewer
        credentials.set(sessionId, credential);

        return [...stun, ...servers];
    } catch (error) {
        console.error("Failed to generate Cloudflare TURN credentials, falling back to STUN only: ", error);
        return stun;
    }
}

// Test Cloudflare keys by generating and revoking a short-lived credential
async function test(keys) {
    const { credential } = await generateCredential(keys);
    revokeCredential(credential).catch((error) => console.error("Error revoking test TURN credentials: ", error));
}

// Checks if any viewers still have Cloudflare TURN credentials
function hasCredentials() {
    return credentials.size > 0;
}

module.exports = { DEFAULT_STUN_SERVER, resolve, revoke, revokeAll, hasCredentials, test };
