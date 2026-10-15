const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueWritten } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// Configure Gmail SMTP Transporter (Replaces Firebase Mail Extension)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER || "your-email@gmail.com",
        pass: process.env.GMAIL_PASS || "xxxx xxxx xxxx xxxx" // 16-char Gmail App Password
    }
});

// Unified Sensor Thresholds (35-inch / 88.9 cm mounting height for all stations)
const SENSOR_HEIGHT_CM = 88.9;     // 35.0 inches
const WARN_LEVEL_CM = 44.45;       // 17.5 inches water depth (Blue)
const CRIT_LEVEL_CM = 83.82;       // 33.0 inches water depth (Red)

const CUSTOM_NAMES = {
    'sensordata1': 'Sealion Street',
    'sensordata2': 'Samaritan Street',
    'sensordata3': 'Swingfire Street',
    'sensordata4': 'Striker Street'
};

exports.instantFloodAlert = onValueWritten({
    ref: "/{sensorId}",
    instance: "bahgo-ee71b-default-rtdb", 
    region: "asia-southeast1"
}, async (event) => {
    const key = event.params.sensorId;
    const lowerKey = key.toLowerCase();
    
    if (!lowerKey.includes("sensor")) return null;

    const beforeData = event.data.before.val() || {};
    const data = event.data.after.val();
    if (!data) return null;

    // Prevent infinite loop when writing Last_Alert_Status back to RTDB
    if (
        beforeData.Distance_cm === data.Distance_cm &&
        beforeData.Rain_Value === data.Rain_Value &&
        beforeData.Last_Alert_Status !== data.Last_Alert_Status
    ) {
        return null;
    }

    const db = admin.database();
    const firestore = admin.firestore();

    const distanceCm = data.Distance_cm ?? SENSOR_HEIGHT_CM;
    const rawRain = data.Rain_Value ?? 4095;

    const rainRatio = (4095 - rawRain) / 4095;
    let precip = Math.pow(rainRatio, 2) * 15;
    precip = Math.round(precip * 10) / 10;

    let level = SENSOR_HEIGHT_CM - distanceCm;
    if (level < 0) level = 0;
    level = Math.round(level * 100) / 100;

    // Evaluate status: Critical (depth >= 83.82 cm or Heavy Rain <= 1200) | Warning (depth >= 44.45 cm or Moderate Rain <= 2200)
    let status = "safe";
    if (level >= CRIT_LEVEL_CM || rawRain <= 1200) {
        status = "critical";
    } else if (level >= WARN_LEVEL_CM || rawRain <= 2200) {
        status = "warning";
    }

    const lastAlert = data.Last_Alert_Status || "safe";

    // Reset Last_Alert_Status when levels return to normal
    if (status === "safe" && lastAlert !== "safe") {
        await db.ref(`/${key}/Last_Alert_Status`).set("safe");
        return null;
    }

    if (status !== lastAlert && status !== "safe") {
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

        await db.ref(`/${key}/Last_Alert_Status`).set(status);

        if (criticalEmails.length === 0) return null;

        const displayName = CUSTOM_NAMES[lowerKey] || key;
        const subject = status === "critical"
            ? `CRITICAL ALERT: ${displayName} Water Levels High!`
            : `WARNING: ${displayName} Water Levels Rising`;
        const color = status === "critical" ? "#DC2626" : "#F59E0B";
        const title = status === "critical" ? "Critical Flood Warning" : "Flood Warning";

        await transporter.sendMail({
            from: `"BAHGO Flood Monitoring" <${process.env.GMAIL_USER || "your-email@gmail.com"}>`,
            bcc: criticalEmails,
            subject: subject,
            html: `<h2 style="color: ${color};">${title}</h2>
                   <p><strong>${displayName}</strong> is showing elevated water levels.</p>
                   <p>Water Level: ${level} cm</p>
                   <p>Precipitation: ${precip} mm/hr</p>`
        });

        console.log(`Instant ${status.toUpperCase()} email sent to ${criticalEmails.length} users!`);
    }

    return null;
});


exports.checkOfflineDevices = onSchedule({
    schedule: "every 1 minutes",
    region: "asia-southeast1"
}, async (event) => {
    const db = admin.database();
    const firestore = admin.firestore();

    const snapshot = await db.ref("/").once("value");
    const stations = snapshot.val();
    if (!stations) return null;
    
    const now = Date.now();

    for (const [key, data] of Object.entries(stations)) {
        const lowerKey = key.toLowerCase();
        if (!lowerKey.includes("sensor") || !data) continue;

        if (data.Last_Updated) {
            const lastUpdateMs = new Date(data.Last_Updated).getTime();
            const secondsSinceUpdate = (now - lastUpdateMs) / 1000;
            const lastAlert = data.Last_Alert_Status || "safe";

            if (secondsSinceUpdate > 30 && lastAlert !== "offline") {
                const usersSnapshot = await firestore.collection("users").get();
                const offlineEmails = [];
                
                usersSnapshot.forEach((doc) => {
                    const userData = doc.data();
                    if (userData.email && userData.notifications?.email) {
                        offlineEmails.push(userData.email);
                    }
                });

                await db.ref(`/${key}/Last_Alert_Status`).set("offline");

                if (offlineEmails.length > 0) {
                    const displayName = CUSTOM_NAMES[lowerKey] || key;

                    await transporter.sendMail({
                        from: `"BAHGO Flood Monitoring" <${process.env.GMAIL_USER || "your-email@gmail.com"}>`,
                        bcc: offlineEmails,
                        subject: `URGENT: ${displayName} is Offline!`,
                        html: `<h2 style="color: #9CA3AF;">Device Offline Warning</h2>
                               <p><strong>${displayName}</strong> has stopped reporting data.</p>`
                    });
                    
                    console.log(`Offline alert sent for ${key}`);
                }
            }
        }
    }
    return null;
});