const admin = require('firebase-admin');
admin.initializeApp();

const SUPER = process.argv.slice(2).map((e) => e.toLowerCase());
  if (SUPER.length === 0) { console.error('Give at least one super email.'); process.exit(1); }

async function main() {
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      const ref = admin.firestore().doc('users/' + u.uid);
      if (!(await ref.get()).exists) { console.log(u.email + ' -> skipped (no users doc)'); continue; }
      const role = SUPER.includes((u.email || '').toLowerCase()) ? 'super' : 'admin';
      await admin.auth().setCustomUserClaims(u.uid, { role });
      await ref.update({ role: role === 'super' ? 'Super User' : 'Admin' });
      console.log(u.email + ' -> ' + role);
    }
    pageToken = page.pageToken;
  } while (pageToken);
  console.log('Done.');
}
main().catch((e) => { console.error(e); process.exit(1); });