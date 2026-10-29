<p align="center">
  <img src="public/Image/NewBahgoIcon.png" alt="Bahgo Logo" width="120" />
</p>

# Bahgo — Flood Detection Monitoring System

Bahgo is a real-time flood monitoring dashboard for Taguig City. ESP32 sensors
post water-level and rain readings to Firebase Realtime Database every 5 seconds;
the React dashboard shows them live, and a scheduled Cloud Function emails admins
when a station floods, rises, or stops reporting.

- Live demo: [bahgo.web.app](https://bahgo.web.app)
- Admin-only: sign-ups are disabled; accounts are created by a super admin.

## Features

- Real-time water level, precipitation, and rise-rate readings
- Safe / Warning / Critical / Offline status per station
- Email alerts for critical levels, warnings, offline stations, and recovery
- 1-hour water-level trend prediction per station
- Map with station markers and the Project NOAH flood-hazard layer
- Super-admin user management with a forced password change on first login
- Profile photo and notification preference storage

## How it works

```text
ESP32 (every 5 s)
  └─> Realtime Database: Sensordata1..4
        ├─> React dashboard (onValue) ─> status, cards, tables, map
        └─> checkStations (Cloud Scheduler, every minute)
              ├─> email via Gmail SMTP
              └─> Firestore: alert_state/{stationId}
```

Historical readings for the station chart come from Firestore
`sensor_readings1..4`; that history is not written by this repo.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Create React App 5 |
| Auth | Firebase Authentication (Email/Password) |
| Database | Firestore + Realtime Database |
| Backend | Cloud Functions for Firebase (Node 24) |
| Email | Nodemailer over Gmail SMTP |
| Map | MapLibre GL + PMTiles (Project NOAH hazard tiles) |
| Charts | Chart.js |
| Hosting | Firebase Hosting |

## Project layout

```text
.
├── functions/
│   ├── index.js              createAdmin, removeAdmin, checkStations
│   └── scripts/setRoles.js   seed super-admin claims
├── public/                   static assets and index.html
├── src/
│   ├── App.js                dashboard markup/screens
│   ├── firebase.js           Firebase SDK setup
│   └── functions/            auth, data, map, and UI helpers
├── firebase.json
├── firestore.rules
└── .env                      local web config (gitignored)
```

## Prerequisites

- Node.js 24 and npm 10+
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase project with Authentication, Firestore, Realtime Database,
  Hosting, and Cloud Functions enabled
- The Blaze plan, because the scheduled function uses Cloud Scheduler and
  sends email
- A Gmail account with an App Password for SMTP

## Configuration

Create `.env` in the project root (it is gitignored):

```dotenv
REACT_APP_FIREBASE_API_KEY=
REACT_APP_FIREBASE_AUTH_DOMAIN=
REACT_APP_FIREBASE_PROJECT_ID=
REACT_APP_FIREBASE_STORAGE_BUCKET=
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=
REACT_APP_FIREBASE_APP_ID=
REACT_APP_FIREBASE_MEASUREMENT_ID=
REACT_APP_FIREBASE_DATABASE_URL=
```

These are public Firebase web-config values; access is enforced by security rules.

Set the function secrets (do not put them in `.env`):

```sh
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
```

`SMTP_PASS` should be a Gmail App Password. The functions deploy to
`us-central1`.

## Local development

```sh
npm install
npm start
```

The dashboard runs at <http://localhost:3000> and connects to the Firebase
project in `.env`. Emulators are not configured.

To run the functions locally:

```sh
cd functions
npm install
npm run serve
```

## First-time Firebase setup

1. Log in and select the project:

   ```sh
   firebase login
   firebase use <your-project-id>
   ```

   The hosting site is currently fixed to `bahgo` in `firebase.json`; change it
   for your own project.

2. Enable Email/Password auth, Firestore, Realtime Database, and Hosting in the
   Firebase console.

3. Deploy the Firestore rules:

   ```sh
   firebase deploy --only firestore:rules
   ```

4. Set the SMTP secrets shown above.

5. Seed the first super admin:
   - Create the account in Firebase Authentication.
   - Create `users/{uid}` in Firestore with `email`, `name`,
     `role: "Super User"`, and `isFirstLogin: false`.
   - Add the email to the `SUPER` list in `functions/scripts/setRoles.js`.
   - Run the script with application-default credentials:

     ```sh
     GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
       node functions/scripts/setRoles.js
     ```

   The script sets the `role: "super"` custom claim. The app signs out any
   account that has no `users/{uid}` document.

6. Build and deploy:

   ```sh
   npm run build
   firebase deploy
   ```

7. Create admin accounts from **User Management** in the super-admin dashboard.
   They receive a temporary password and must change it on first login.

## Roles

| Custom claim | Firestore `role` | Access |
|---|---|---|
| `super` | `Super User` | Full dashboard, manage admins, edit station locations |
| `admin` | `Admin` | Read-only dashboard |

The custom claim is what Firestore rules check. The `role` field in the user
document is for display.

## Alerts and thresholds

| Rule | Value |
|---|---|
| Sensor mounted above ground | 88.9 cm |
| Warning | water ≥ 44.45 cm or raw rain ≤ 2200 |
| Critical | water ≥ 83.82 cm or raw rain ≤ 1200 |
| Offline | no update for 150 s (30 missed 5 s readings) |
| Check interval | 1 minute |
| Warning/offline cooldown | 30 minutes |
| Critical alerts | sent immediately, no cooldown |

Emails go to every Firestore user whose role is `Admin` or `Super User`.
Warning and offline emails are throttled; critical alerts are not. A
back-online email is sent when a station recovers.

## Data model

| Firestore path | Purpose |
|---|---|
| `users/{uid}` | Profile, role, notification prefs, first-login flag |
| `station_locations/{stationId}` | Latitude, longitude, and display name |
| `sensor_readings1..4` | Historical readings for the chart |
| `alert_state/{stationId}` | Last alert state (written by the function only) |

| Realtime Database path | Purpose |
|---|---|
| `Sensordata1..4` | Current reading from each device |
| `RecordedData/SensordataN` | Historical readings (not used by the dashboard) |

Realtime Database rules are not managed by this repo; configure them in the
Firebase console. The dashboard reads the database root as a signed-in user.

## Checks

There is no automated test suite. Before shipping:

```sh
npx eslint src
CI=true npm run build
node --check functions/index.js
```

## Deployment

```sh
npm run build
firebase deploy
```

`firebase deploy` publishes Hosting, Firestore rules, and Cloud Functions.
Realtime Database rules and Gmail secrets are configured separately. Use
`firebase functions:log` to inspect scheduled runs and email failures.

## Troubleshooting

- **Station shows offline:** its `Last_Updated` is older than 150 seconds.
- **No alert emails:** check the `SMTP_USER`/`SMTP_PASS` secrets and
  `firebase functions:log`.
- **Login returns to the login screen:** the account has no `users/{uid}`
  Firestore document.
- **Map is blank:** MapLibre, PMTiles, and the NOAH tiles load from public CDNs;
  check network access.

## License

This project is for academic and educational purposes.
