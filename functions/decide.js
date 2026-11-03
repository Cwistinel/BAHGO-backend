const SENSOR_HEIGHT_CM = 88.9;
const WARN_LEVEL_CM = 44.45;
const CRIT_LEVEL_CM = 83.82;
const OFFLINE_AFTER_SEC = 150;
const COOLDOWN_MS = 30 * 60 * 1000;
const OFFLINE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DEVICE_UTC_OFFSET_HOURS = 8;
const OFFLINE_WAIT_MS = 2 * 60 * 1000;

function parseTimestamp(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) {
    const n = Number(v);
    return n < 1e11 ? n * 1000 : n;
  }
  const s = String(v).trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = Date.parse(s.replace(' ', 'T'));
    return isNaN(t) ? null : t;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - DEVICE_UTC_OFFSET_HOURS * 3600 * 1000;
}

function floodInfo(s) {
  const rawRain = (s.Rain_Value === undefined || s.Rain_Value === null) ? 4095 : Number(s.Rain_Value);
  const rainRatio = (4095 - rawRain) / 4095;
  const precip = Math.round(Math.pow(rainRatio, 2) * 15 * 10) / 10;
  let level = SENSOR_HEIGHT_CM - Number(s.Distance_cm);
  if (level < 0) level = 0;
  level = Math.round(level * 100) / 100;
  let status = 'safe';
  if (level >= CRIT_LEVEL_CM || rawRain <= 1200) status = 'critical';
  else if (level >= WARN_LEVEL_CM || rawRain <= 2200) status = 'warning';
  return { status, level, precip };
}

function decide(st, s, now, name) {
  const events = [];
  const next = {};
  const ts = parseTimestamp(s.Last_Updated);
  if (ts === null) return { events, next };
  const offline = (now - ts) / 1000 > OFFLINE_AFTER_SEC;
  let offlineDue = false;

  if (offline) {
    if (!st.offline && !st.offlineDetectedAt) {
      next.offlineDetectedAt = now;
      next.offlineSince = ts;
    } else {
      offlineDue = st.offline ? now - (st.lastOfflineEmail || 0) > OFFLINE_COOLDOWN_MS : now - st.offlineDetectedAt >= OFFLINE_WAIT_MS;
    }
  } else if (st.offline) {
    events.push({ type: 'back', name, since: ts, offlineMs: st.offlineSince ? ts - st.offlineSince : null });
    next.offline = false;
    next.offlineDetectedAt = 0;
  } else if (st.offlineDetectedAt) {
    next.offlineDetectedAt = 0;
  }

  if (!offline && s.Distance_cm !== undefined && s.Distance_cm !== null) {
    const f = floodInfo(s);
    const prev = st.floodStatus || 'safe';
    if (f.status === 'safe') {
      if (prev !== 'safe') next.floodStatus = 'safe';
    } else if (f.status !== prev) {
      if (f.status === 'critical' || now - (st.lastFloodEmail || 0) > COOLDOWN_MS) {
        events.push({ type: f.status, name, level: f.level, precip: f.precip });
        next.floodStatus = f.status;
        next.lastFloodEmail = now;
      }
    }
  }
  return { events, next, offline: offline ? { name, lastReading: ts } : null, offlineDue };
}

module.exports = { parseTimestamp, decide, OFFLINE_COOLDOWN_MS, OFFLINE_WAIT_MS };