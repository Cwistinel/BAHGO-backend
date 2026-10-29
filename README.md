<p align="center">
  <img src="public/Image/NewBahgoIcon.png" alt="Bahgo Logo" width="120" />
</p>

# Bahgo — Flood Detection Monitoring System

Bahgo is an admin-only flood monitoring dashboard for Taguig City. ESP32 sensors
post water-level and rain readings to Firebase Realtime Database every 5 seconds;
the dashboard shows them live, and a scheduled Cloud Function emails admins when a
station floods, rises, or stops reporting.

Live demo: [bahgo.web.app](https://bahgo.web.app)

## Features

- Live water level, precipitation, and rise rate
- Safe / Warning / Critical / Offline status
- Email alerts and a 1-hour trend chart per station
- Map with station markers and the Project NOAH hazard layer
- Super-admin user management with a forced first-login password change

## How it works

```text
ESP32 (5 s) -> RTDB Sensordata1..4 -> React dashboard
                                  -> checkStations (1 min) -> email + alert_state
```

The station chart reads Firestore `sensor_readings1..4`; that history is written
outside this repo.

## Stack

React 19 (Create React App 5), Firebase Auth / Firestore / Realtime Database /
Hosting / Cloud Functions (Node 24), MapLibre GL + PMTiles, Chart.js, Nodemailer.

## Setup

Prerequisites: Node 24, the Firebase CLI, a Firebase project on the Blaze plan,
and a Gmail account with an App Password.

1. Install dependencies:

   ```sh
   npm install
   npm --prefix functions install
   ```

2. Create `.env` in the project root (it is gitignored):

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

3. Select the project and enable services:

   ```sh
   firebase login
   firebase use <your-project-id>
   ```

   In the Firebase console, enable Email/Password auth and disable sign-ups
   (Authentication → Settings → User actions), then create Firestore and a
   Realtime Database.

4. Deploy the Firestore rules:

   ```sh
   firebase deploy --only firestore:rules
   ```

5. Set the function secrets:

   ```sh
   firebase functions:secrets:set SMTP_USER
   firebase functions:secrets:set SMTP_PASS
   ```

   `SMTP_PASS` is a Gmail App Password. Functions run in `us-central1`.

6. Seed the first super admin:

   - Create the account in Authentication.
   - In the Firebase console or with the Admin SDK, create `users/{uid}` with
     `email`, `name`, `role: "Super User"`, and `isFirstLogin: false`.
     Client creates are blocked by `firestore.rules`.
   - Add the email to `SUPER` in `functions/scripts/setRoles.js`, then run:

     ```sh
     GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
       node functions/scripts/setRoles.js
     ```

     The script sets `super` for the listed emails and `admin` for every other
     Auth user.

7. Build and deploy:

   ```sh
   npm run build
   firebase deploy
   ```

8. Create admins from **User Management** in the super dashboard. The app does
   not email the temporary password; share it with them. They must change it on
   first login.

The hosting site is fixed to `bahgo` in `firebase.json`; change it for your own
project.

## Realtime Database rules

This repo does not deploy RTDB rules. The dashboard reads the database root as a
signed-in user, so authenticated users need read at the root; devices need write
to `Sensordata1..4`. Root read exposes every root key, so keep unrelated data out
of this database.

## Roles

| Custom claim | `users.role` | Access |
|---|---|---|
| `super` | `Super User` | Full dashboard, manage admins, edit station locations |
| `admin` | `Admin` | Read-only dashboard |

Firestore rules check the custom claim. The `users.role` field is also used to
choose alert-email recipients, so keep it in sync. An account with no
`users/{uid}` document is signed out.

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

Emails go to every user whose `users.role` is `Admin` or `Super User`. A recovery
email is sent when a station comes back online.

## Data model

| Firestore path | Purpose |
|---|---|
| `users/{uid}` | Profile, role, first-login flag |
| `station_locations/{stationId}` | Latitude, longitude, and display name |
| `sensor_readings1..4` | Historical readings for the chart |
| `alert_state/{stationId}` | Last alert state (written by the function only) |

| Realtime Database path | Purpose |
|---|---|
| `Sensordata1..4` | Current reading from each device |
| `RecordedData/SensordataN` | Historical readings (not used by the dashboard) |

## Local development and checks

```sh
npm start                      # dashboard at http://localhost:3000
npm --prefix functions run serve
```

The frontend always uses the project in `.env`; emulators are not wired. There is
no automated test suite. Before shipping:

```sh
npx eslint src
CI=true npm run build
node --check functions/index.js
```

## Known limits

- The dashboard reads the RTDB root, so each admin browser downloads
  `RecordedData` history on load. Fine for four stations; if it grows, read only
  `Sensordata1..4` in `src/functions/stationsData.js`.
- The chart fetches each `sensor_readingsN` collection and keeps the last six.
  Add a query limit if history grows.

## Troubleshooting

- **Station shows offline:** `Last_Updated` is older than 150 seconds.
- **No alert emails:** check the `SMTP_USER`/`SMTP_PASS` secrets and
  `firebase functions:log`.
- **Login returns to the login screen:** the account has no `users/{uid}`
  document.
- **Map is blank:** MapLibre, PMTiles, and the NOAH tiles load from public CDNs;
  check network access.

## License

This project is for academic and educational purposes.
