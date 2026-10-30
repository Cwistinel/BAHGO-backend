const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { decide } = require('./decide');
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

const NAMES = {
  sensordata1: 'Sealion Street',
  sensordata2: 'Samaritan Street',
  sensordata3: 'Swingfire Street',
  sensordata4: 'Striker Street'
};

exports.checkStations = onSchedule(
  { schedule: 'every 1 minutes', region: 'us-central1', secrets: [SMTP_USER, SMTP_PASS], timeoutSeconds: 120 },
  async () => {
    const db = admin.firestore();
    const data = (await admin.database().ref('/').orderByKey().startAt('Sensordata').endAt('Sensordata\uf8ff').get()).val() || {};
    const now = Date.now();
    const events = [];
    const saves = [];

    const locs = Object.fromEntries((await db.collection('station_locations').get()).docs.map((d) => [d.id, d.data()]));

    for (const [key, s] of Object.entries(data)) {
      if (!/^sensordata\d+$/i.test(key) || !s || typeof s !== 'object') continue;
      const name = (locs[key] && locs[key].name) || NAMES[key.toLowerCase()] || key;
      const ref = db.doc('alert_state/' + key);
      const { events: ev, next } = decide((await ref.get()).data() || {}, s, now, name);
      events.push(...ev);
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