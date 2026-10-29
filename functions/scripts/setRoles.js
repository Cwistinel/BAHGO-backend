const admin = require('firebase-admin');
admin.initializeApp();

const SUPER = [
  'kaye.01012@gmail.com',
  'lollypopcurrent@gmail.com',
  'sopiasargado@gmail.com',
  'itsnana.hanna@gmail.com'
];

async function main() {
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      const role = SUPER.includes((u.email || '').toLowerCase()) ? 'super' : 'admin';
      await admin.auth().setCustomUserClaims(u.uid, { role });
      const ref = admin.firestore().doc('users/' + u.uid);
      if ((await ref.get()).exists) {
        await ref.update({ role: role === 'super' ? 'Super User' : 'Admin' });
      }
      console.log(u.email + ' -> ' + role);
    }
    pageToken = page.pageToken;
  } while (pageToken);
  console.log('Done.');
}
main().catch((e) => { console.error(e); process.exit(1); });