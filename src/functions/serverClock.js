let offsetMs = 0;

export function setServerOffset(ms) {
    offsetMs = Number.isFinite(Number(ms)) ? Number(ms) : 0;
}

export function serverNow() {
    return Date.now() + offsetMs;
}