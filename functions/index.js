const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueWritten } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");
admin.initializeApp();

exports.instantFloodAlert = onValueWritten({
    ref: "/{sensorId}",
    instance: "bahgo-ee71b-default-rtdb", 
    region: "asia-southeast1"
}, async (event) => {
    const key = event.params.sensorId;
    
    if (!key.toLowerCase().includes('sensor')) return null;

    const data = event.data.after.val();
    if (!data) return null;
    const db = admin.database();
    const firestore = admin.firestore();

    const distanceCm = data.Distance_cm ?? 0;
    const rawRain = data.Rain_Value ?? 4095;

    const rainRatio = (4095 - rawRain) / 4095;
    let precip = Math.pow(rainRatio, 2) * 15;
    precip = Math.round(precip * 10) / 10;

    let level = 7.62 - distanceCm;
    if (level < 0) level = 0;
    level = Math.round(level * 100) / 100;

    let status = 'safe';
    if (level >= 4.8 || precip >= 10) {
        status = 'critical';
    } else if (level >= 3.5 || precip >= 5) {
        status = 'warning';
    }

    const lastAlert = data.Last_Alert_Status || 'safe';

    if (status !== lastAlert && status !== 'safe') {
        
        const usersSnapshot = await firestore.collection("users").get();
        const criticalEmails = [];
        
        usersSnapshot.forEach((doc) => {
            const userData = doc.data();
            if (userData.email && userData.notifications) {
                if (userData.notifications.email === true && userData.notifications.crit === true) {
                    criticalEmails.push(userData.email);
                }
            }
        });

        if (criticalEmails.length === 0) return null;

        const customNames = {
            'sensordata1': 'Sealion Street',
            'sensordata2': 'Centurion Street',
            'sensordata3': 'Swingfire Street'
        };
        const displayName = customNames[key.toLowerCase()] || key;

        let subject = status === 'critical' ? `CRITICAL ALERT: ${displayName} Water Levels High!` : `WARNING: ${displayName} Water Levels Rising`;
        let color = status === 'critical' ? '#DC2626' : '#F59E0B';
        let title = status === 'critical' ? 'Critical Flood Warning' : 'Flood Warning';

        await firestore.collection("mail").add({
            to: criticalEmails,
            message: {
                subject: subject,
                html: `<h2 style="color: ${color};">${title}</h2>
                       <p><strong>${displayName}</strong> is showing elevated water levels.</p>
                       <p>Water Level: ${level} cm</p>
                       <p>Precipitation: ${precip} mm/hr</p>`
            }
        });

        await db.ref(`/${key}/Last_Alert_Status`).set(status);
        console.log(`Instant ${status.toUpperCase()} email sent to ${criticalEmails.length} users!`);
    }

    return null;
});


exports.checkOfflineDevices = onSchedule("every 1 minutes", async (event) => {
    const db = admin.database();
    const firestore = admin.firestore();

    const snapshot = await db.ref("/").once("value");
    const stations = snapshot.val();
    if (!stations) return null;
    
    const now = Date.now();

    for (const [key, data] of Object.entries(stations)) {
        if (!key.toLowerCase().includes('sensor')) continue;

        if (data.Last_Updated) {
            const lastUpdateMs = new Date(data.Last_Updated).getTime();
            const secondsSinceUpdate = (now - lastUpdateMs) / 1000;
            const lastAlert = data.Last_Alert_Status || 'safe';

            if (secondsSinceUpdate > 5 && lastAlert !== 'offline') {
                
                const usersSnapshot = await firestore.collection("users").get();
                const offlineEmails = [];
                
                usersSnapshot.forEach((doc) => {
                    const userData = doc.data();
                    if (userData.email && userData.notifications?.email) {
                        offlineEmails.push(userData.email);
                    }
                });

                if (offlineEmails.length > 0) {
                    const customNames = {
                        'sensordata1': 'Sealion Street',
                        'sensordata2': 'Centurion Street',
                        'sensordata3': 'Swingfire Street'
                    };
                    const displayName = customNames[key.toLowerCase()] || key;

                    await firestore.collection("mail").add({
                        to: offlineEmails,
                        message: {
                            subject: `URGENT: ${displayName} is Offline!`,
                            html: `<h2 style="color: #9CA3AF;">Device Offline Warning</h2>
                                   <p><strong>${displayName}</strong> has stopped reporting data.</p>`
                        }
                    });
                    
                    await db.ref(`/${key}/Last_Alert_Status`).set('offline');
                    console.log(`Offline alert sent for ${key}`);
                }
            }
        }
    }
    return null;
});