// Text shown for a station, shared by the cards, the list, the station details and the map popups,
// so every page says the same thing.

/** One place name for the whole dashboard. Change it here only. */
export const LOCATION_LABEL = 'Palar Village, Taguig';

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const RISK_WORD = { safe: 'Low', warning: 'Warning', critical: 'Critical' };

/** "12 s ago", "5 min ago", "3 h ago", "6 days ago", "5 months ago". */
export function ageText(updatedMs, now = Date.now()) {
    if (!Number.isFinite(updatedMs)) return 'never';
    const d = Math.max(0, now - updatedMs);
    if (d < MIN) return Math.round(d / 1000) + ' s ago';
    if (d < HOUR) return Math.floor(d / MIN) + ' min ago';
    if (d < DAY) return Math.floor(d / HOUR) + ' h ago';
    if (d < 60 * DAY) { const n = Math.floor(d / DAY); return n + (n === 1 ? ' day ago' : ' days ago'); }
    return Math.floor(d / (30 * DAY)) + ' months ago';
}

/** '' while the station is reporting, 'stale' (amber) when offline for under an hour, 'dead' (red) after that. */
export function ageClass(s, now = Date.now()) {
    if (s.status !== 'offline') return '';
    return now - s.updatedMs < HOUR ? 'stale' : 'dead';
}

/** "Updated 12 s ago" while reporting, "Last seen 5 months ago" when not. */
export function ageLabel(s, now = Date.now()) {
    return (s.status === 'offline' ? 'Last seen ' : 'Updated ') + ageText(s.updatedMs, now);
}

/** Severity used for colours and sorting: the live status, or the last known one when offline. */
export const severityOf = (s) => (s.status === 'offline' ? s.lastKnownStatus || 'safe' : s.status);

export function statusText(s) {
    const base = s.sensorError ? 'SENSOR ERROR' : s.status.toUpperCase();
    if (s.status !== 'offline') return base;
    return base + ' - LAST KNOWN: ' + (s.lastKnownStatus || 'safe').toUpperCase();
}

/** Measured rise rate over the last 15 minutes. */
export function trendText(s) {
    if (s.status === 'offline') return '--';
    const t = s.trend;
    if (!t || t.state === 'collecting') return 'Collecting readings…';
    if (t.state === 'steady') return 'Steady';
    return (t.state === 'rising' ? 'Rising ' : 'Falling ') + Math.abs(t.rate).toFixed(1) + ' cm/hr';
}

export function rainText(s) {
    return s.rain || '--';
}

/** The rows every station view shows, in the same order. */
export function stationRows(s) {
    const waiting = s.status === 'offline' ? '--' : 'Collecting readings…';
    const level = s.forecastCm === null || s.forecastCm === undefined ? waiting : `${s.forecastCm} cm · ${s.forecastStatus.toUpperCase()}`;
    const risk = s.riskStatus ? RISK_WORD[s.riskStatus] : waiting;
    const row = (label, val) => `<div class="s-row"><span>${label}</span><span class="val">${val}</span></div>`;
    return row('Water Level:', `${s.level} cm`) +
        row('Rain:', rainText(s)) +
        row('Rise Rate (last 15 min):', trendText(s)) +
        row('Level in 30 min (estimate):', level) +
        row('Flood Risk (estimate):', risk);
}