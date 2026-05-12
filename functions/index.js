const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
admin.initializeApp();

exports.checkOfflineDevices = onSchedule("every 1 minutes", async (event) => {
    const db = admin.database();
    const firestore = admin.firestore();
    
    const listUsersResult = await admin.auth().listUsers(1000);
    const adminEmails = [];
    
    listUsersResult.users.forEach((userRecord) => {
        if (userRecord.email && userRecord.providerData.length > 0) {
            adminEmails.push(userRecord.email);
        }
    });

    if (adminEmails.length === 0) return null;

    const snapshot = await db.ref("/").once("value");
    const stations = snapshot.val();
    
    if (!stations) return null;
    
    const now = Date.now();

    for (const [key, data] of Object.entries(stations)) {
        if (!data.Last_Updated) continue;

        const lastUpdateMs = new Date(data.Last_Updated).getTime();
        const minutesSinceUpdate = (now - lastUpdateMs) / (1000 * 60);

        if (minutesSinceUpdate > 5 && data.Email_Sent !== true) {
            await firestore.collection("mail").add({
                to: adminEmails,
                message: {
                  subject: `URGENT: ${key} is Offline!`,
                  html: `
                    <h2 style="color: #DC2626;">Device Offline Warning</h2>
                    <p><strong>${key}</strong> has stopped reporting data to the Bahgo Dashboard.</p>
                    <p>It has been offline for over 5 minutes. Please check the power supply and WiFi connection.</p>
                    <p style="color: #64748B; font-size: 12px;">Last seen: ${new Date(data.Last_Updated).toLocaleString()}</p>
                  `,
                }
            });
            await db.ref(`/${key}/Email_Sent`).set(true);
        } else if (minutesSinceUpdate <= 5 && data.Email_Sent === true) {
            await db.ref(`/${key}/Email_Sent`).set(false);
        }
    }
    return null;
});