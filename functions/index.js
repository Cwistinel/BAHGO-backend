const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
admin.initializeApp();

exports.checkOfflineDevices = onSchedule("every 1 minutes", async (event) => {
    const db = admin.database();
    const firestore = admin.firestore();

    const usersSnapshot = await firestore.collection("users").get();
    const offlineEmails = [];
    const criticalEmails = [];

    usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.email && userData.notifications) {
            if (userData.notifications.email === true) {
                offlineEmails.push(userData.email);
                
                if (userData.notifications.crit === true) {
                    criticalEmails.push(userData.email);
                }
            }
        }
    });

    if (offlineEmails.length === 0 && criticalEmails.length === 0) return null;

    const snapshot = await db.ref("/").once("value");
    const stations = snapshot.val();
    
    if (!stations) return null;
    
    const now = Date.now();

    for (const [key, data] of Object.entries(stations)) {
        const level = data.Distance_cm ?? 0;
        const rawRain = data.Rain_Value ?? 4095;
        const precip = Math.round(((4095 - rawRain) / 4095) * 50);
        
        let status = 'safe';
        
        if (data.Last_Updated) {
            const lastUpdateMs = new Date(data.Last_Updated).getTime();
            const minutesSinceUpdate = (now - lastUpdateMs) / (1000 * 60);
            if (minutesSinceUpdate > 5) {
                status = 'offline';
            }
        }

        if (status !== 'offline') {
            if (level > 200 || precip > 30) {
                status = 'critical';
            } else if (level > 100 || precip > 15) {
                status = 'warning';
            }
        }

        const lastAlert = data.Last_Alert_Status || 'safe';

        if (status !== lastAlert) {
            let targetEmails = [];
            let subject = "";
            let htmlMessage = "";

            if (status === 'offline' && offlineEmails.length > 0) {
                targetEmails = offlineEmails;
                subject = `URGENT: ${key} is Offline!`;
                htmlMessage = `<h2 style="color: #9CA3AF;">Device Offline Warning</h2>
                               <p><strong>${key}</strong> has stopped reporting data.</p>`;
            } 
            else if (status === 'critical' && criticalEmails.length > 0) {
                targetEmails = criticalEmails;
                subject = `CRITICAL ALERT: ${key} Water Levels High!`;
                htmlMessage = `<h2 style="color: #DC2626;">Critical Flood Warning</h2>
                               <p><strong>${key}</strong> has reached critical levels.</p>
                               <p>Water Level: ${level} cm</p>
                               <p>Precipitation: ${precip} mm/hr</p>`;
            }
            else if (status === 'warning' && criticalEmails.length > 0) {
                targetEmails = criticalEmails;
                subject = `WARNING: ${key} Water Levels Rising`;
                htmlMessage = `<h2 style="color: #F59E0B;">Flood Warning</h2>
                               <p><strong>${key}</strong> is showing elevated water levels.</p>
                               <p>Water Level: ${level} cm</p>
                               <p>Precipitation: ${precip} mm/hr</p>`;
            }

            if (targetEmails.length > 0 && htmlMessage !== "") {
                await firestore.collection("mail").add({
                    to: targetEmails,
                    message: {
                        subject: subject,
                        html: htmlMessage
                    }
                });
            }

            await db.ref(`/${key}/Last_Alert_Status`).set(status);
        }
    }
    
    return null;
});