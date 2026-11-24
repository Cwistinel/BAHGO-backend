import { serverNow } from './serverClock';

export const LOCATION_LABEL = 'Palar Village, Taguig';

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const RISK_WORD = { safe: 'Low', warning: 'Warning', critical: 'Critical' };

export function ageText(updatedMs, now = serverNow()) {
    if (!Number.isFinite(updatedMs)) return 'never';
    const d = Math.max(0, now - updatedMs);
    if (d < MIN) return Math.round(d / 1000) + ' s ago';
    if (d < HOUR) return Math.floor(d / MIN) + ' min ago';
    if (d < DAY) return Math.floor(d / HOUR) + ' h ago';
    if (d < 60 * DAY) { const n = Math.floor(d / DAY); return n + (n === 1 ? ' day ago' : ' days ago'); }
    return Math.floor(d / (30 * DAY)) + ' months ago';
}

export function ageClass(s, now = serverNow()) {
    if (s.status !== 'offline') return '';
    return now - s.updatedMs < HOUR ? 'stale' : 'dead';
}

export function ageLabel(s, now = serverNow()) {
    return (s.status === 'offline' ? 'Last seen ' : 'Updated ') + ageText(s.updatedMs, now);
}

export const severityOf = (s) => (s.status === 'offline' ? s.lastKnownStatus || 'safe' : s.status);

export function statusText(s) {
    const base = s.sensorError ? 'SENSOR ERROR' : s.status.toUpperCase();
    if (s.status !== 'offline') return base;
    if (!s.lastKnownStatus) return base === 'SENSOR ERROR' ? 'SENSOR ERROR - NO READING' : 'OFFLINE - NO READING';
    return base + ' - LAST KNOWN: ' + (s.lastKnownStatus || 'safe').toUpperCase();
}

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

export function timeText(s) {
    return s.timestamp ? new Date(s.timestamp).toLocaleString() : 'never';
}

export function levelText(s) {
    return s.level === null || s.level === undefined ? '--' : s.level + ' cm';
}

export function stationRows(s) {
    const waiting = s.status === 'offline' ? '--' : 'Collecting readings…';
    const level = s.forecastCm === null || s.forecastCm === undefined ? waiting : `${s.forecastCm} cm · ${s.forecastStatus.toUpperCase()}`;
    const risk = s.riskStatus ? RISK_WORD[s.riskStatus] : waiting;
    const row = (label, val) => `<div class="s-row"><span>${label}</span><span class="val">${val}</span></div>`;
    return row('Water Level:', levelText(s)) +
        row('Rain:', rainText(s)) +
        row('Rise Rate (last 15 min):', trendText(s)) +
        row('Level in 30 min (estimate):', level) +
        row('Flood Risk (estimate):', risk);
}