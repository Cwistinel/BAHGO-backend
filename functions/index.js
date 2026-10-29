const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
admin.initializeApp();

const OPTS = { region: 'us-central1', maxInstances: 5 };

function requireSuper(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please log in.');
  if (req.auth.token.role !== 'super') throw new HttpsError('permission-denied', 'Super admin only.');
}

exports.createAdmin = onCall(OPTS, async (req) => {
  requireSuper(req);
  const email = String(req.data?.email || '').trim().toLowerCase();
  const tempPassword = String(req.data?.tempPassword || '');
  if (!email.includes('@')) throw new HttpsError('invalid-argument', 'Enter a valid email.');
  if (tempPassword.length < 8) throw new HttpsError('invalid-argument', 'Temporary password must be at least 8 characters.');
  let user;
  try {
    user = await admin.auth().createUser({ email, password: tempPassword });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', email + ' already has an account.');
    throw new HttpsError('internal', 'Could not create the account.');
  }
  await admin.auth().setCustomUserClaims(user.uid, { role: 'admin' });
  await admin.firestore().doc('users/' + user.uid).set({
    email, role: 'Admin', name: email.split('@')[0],
    isFirstLogin: true, lastLogin: null,
    createdAt: new Date().toISOString(), createdBy: req.auth.uid
  });
  return { uid: user.uid };
});

exports.removeAdmin = onCall(OPTS, async (req) => {
  requireSuper(req);
  const uid = String(req.data?.uid || '');
  if (!uid) throw new HttpsError('invalid-argument', 'Missing user id.');
  if (uid === req.auth.uid) throw new HttpsError('failed-precondition', 'You cannot remove yourself.');
  let target;
  try {
    target = await admin.auth().getUser(uid);
  } catch (e) {
    throw new HttpsError('not-found', 'User not found.');
  }
  if (target.customClaims?.role === 'super') throw new HttpsError('failed-precondition', 'Super admins cannot be removed.');
  await admin.firestore().doc('users/' + uid).delete();
  await admin.auth().revokeRefreshTokens(uid);
  await admin.auth().deleteUser(uid);
  return { ok: true };
});

const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');

const SENSOR_HEIGHT_CM = 88.9;
const WARN_LEVEL_CM = 44.45;
const CRIT_LEVEL_CM = 83.82;
const OFFLINE_AFTER_SEC = 150;
const COOLDOWN_MS = 30 * 60 * 1000;
const SEND_BACK_ONLINE = true;
const DEVICE_UTC_OFFSET_HOURS = 8;
const NAMES = {
  sensordata1: 'Sealion Street',
  sensordata2: 'Samaritan Street',
  sensordata3: 'Swingfire Street',
  sensordata4: 'Striker Street'
};

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

exports.checkStations = onSchedule(
  { schedule: 'every 1 minutes', region: 'us-central1', secrets: [SMTP_USER, SMTP_PASS], timeoutSeconds: 120 },
  async () => {
    const db = admin.firestore();
    const data = (await admin.database().ref('/').get()).val() || {};
    const now = Date.now();
    const events = [];
    const saves = [];

    for (const [key, s] of Object.entries(data)) {
      if (!/^sensordata\d+$/i.test(key) || !s || typeof s !== 'object') continue;
      const name = NAMES[key.toLowerCase()] || key;
      const ref = db.doc('alert_state/' + key);
      const st = (await ref.get()).data() || {};
      const next = {};

      const ts = parseTimestamp(s.Last_Updated);
      if (ts === null) continue;
      const ageSec = (now - ts) / 1000;
      const offline = ageSec > OFFLINE_AFTER_SEC;

      if (offline && !st.offline) {
        if (now - (st.lastOfflineEmail || 0) > COOLDOWN_MS) {
          events.push({
            subject: 'URGENT: ' + name + ' is Offline!',
            line: name + ' has stopped reporting (last update about ' + Math.round(ageSec / 60) + ' minute(s) ago).'
          });
          next.offline = true;
          next.lastOfflineEmail = now;
        }
      } else if (!offline && st.offline) {
        next.offline = false;
        if (SEND_BACK_ONLINE) {
          events.push({ subject: 'Back Online: ' + name, line: name + ' is reporting data again.' });
        }
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

      if (Object.keys(next).length > 0) saves.push({ ref, next });
    }

    if (events.length > 0) {
      const users = await db.collection('users').where('role', 'in', ['Admin', 'Super User']).get();
      const to = (await Promise.all(users.docs.map((d) =>
        admin.auth().getUser(d.id).then((u) => u.email).catch(() => null)))).filter(Boolean);
      if (to.length === 0) {
        console.warn('No recipients found, skipping send.');
        return;
      }
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() }
      });
      await transporter.sendMail({
        from: 'BAHGO Flood Monitoring <' + SMTP_USER.value() + '>',
        bcc: to,
        subject: events.length === 1 ? events[0].subject : 'BAHGO alerts: ' + events.length + ' updates',
        text: ['BAHGO flood monitoring', '', ...events.map((e) => '- ' + e.line), '', 'Open the BAHGO dashboard for details.'].join('\n')
      });
    }

    await Promise.all(saves.map((x) => x.ref.set(x.next, { merge: true })));
  }
);
