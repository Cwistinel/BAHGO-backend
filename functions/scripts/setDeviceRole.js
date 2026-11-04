const admin = require('firebase-admin');
admin.initializeApp();

const email = process.argv[2];
if (!email) { console.error('Usage: node setDeviceRole.js <device-email>'); process.exit(1); }

async function main() {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { role: 'device' });
  console.log(user.email + ' -> device');
}
main().catch((e) => { console.error(e); process.exit(1); });