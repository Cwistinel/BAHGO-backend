const SENSOR_HEIGHT_CM = 88.9;
const WARN_LEVEL_CM = 44.45;
const CRIT_LEVEL_CM = 83.82;
const OFFLINE_AFTER_SEC = 150;
const COOLDOWN_MS = 30 * 60 * 1000;
const OFFLINE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DEVICE_UTC_OFFSET_HOURS = 8;

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
  const ageSec = (now - ts) / 1000;
  const offline = ageSec > OFFLINE_AFTER_SEC;

  if (offline) {
    if (!st.offline || now - (st.lastOfflineEmail || 0) > OFFLINE_COOLDOWN_MS) {
      events.push({
        subject: 'URGENT: ' + name + ' is Offline!',
        line: name + ' has stopped reporting (last update about ' + (ageSec < 7200 ? Math.round(ageSec / 60) + ' minute(s)' : ageSec < 172800 ? Math.round(ageSec / 3600) + ' hour(s)' : Math.round(ageSec / 86400) + ' day(s)') + ' ago).'
      });
      next.offline = true;
      next.lastOfflineEmail = now;
    }
  } else if (st.offline) {
    next.offline = false;
    events.push({ subject: 'Back Online: ' + name, line: name + ' is reporting data again.' });
  }

  if (!offline && s.Distance_cm !== undefined && s.Distance_cm !== null) {
    const f = floodInfo(s);
    const prev = st.floodStatus || 'safe';
    if (f.status === 'safe') {
      if (prev !== 'safe') next.floodStatus = 'safe';
    } else if (f.status !== prev) {
      if (f.status === 'critical' || now - (st.lastFloodEmail || 0) > COOLDOWN_MS) {
        const crit = f.status === 'critical';
        events.push({
          subject: crit ? 'CRITICAL ALERT: ' + name + ' Water Levels High!' : 'WARNING: ' + name + ' Water Levels Rising',
          line: name + ' (' + f.status.toUpperCase() + '): water level ' + f.level + ' cm, precipitation ' + f.precip + ' mm/hr.'
        });
        next.floodStatus = f.status;
        next.lastFloodEmail = now;
      }
    }
  }
  return { events, next };
}

module.exports = { parseTimestamp, decide, OFFLINE_COOLDOWN_MS };
