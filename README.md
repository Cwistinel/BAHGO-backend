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
- Super-admin user management with a first-login password prompt (client-side only, not enforced by the rules)

## How it works

```text
ESP32 (5 s) -> RTDB Sensordata1..4 -> React dashboard
                                  -> checkStations (1 min) -> email + alert_state
```

The station chart is a model-based 1-hour estimate from the live reading; it does
not read Firestore history.

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
   - Run `setRoles.js` with the super admin email(s) as arguments. Accounts
     without a `users/{uid}` document are skipped:

     ```sh
     GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
       node functions/scripts/setRoles.js you@example.com
     ```

     The script sets `super` for the listed emails and `admin` for every other
     Auth user that has a `users/{uid}` document.

7. Build and deploy:

   ```sh
   npm run build
   firebase deploy
   ```

8. Create admins from **User Management** in the super dashboard. The app does
   not email the temporary password; share it with them. They are prompted to
   change it on first login.

The hosting site is fixed to `bahgo` in `firebase.json`; change it for your own
project.

## Realtime Database rules

`firebase.json` deploys `database.rules.json` with `firebase deploy` (or
`firebase deploy --only database`). Only `Sensordata1..4` are readable or
writable; every other path is denied.

- Read: accounts with the `admin` or `super` claim. The alert function uses the
  Admin SDK, which bypasses rules.
- Write: the sensor account with the `device` claim. During the rollout below the
  rule also allows anonymous accounts so unflashed sensors keep working; the final
  rule is:

  ```json
  ".write": "$node.matches(/^Sensordata[1-4]$/) && auth.token.role === 'device'"
  ```

### Sensor account

All four ESP32s share one email/password account with the custom claim
`role: device`. It has no `users/{uid}` document, so `setRoles.js` skips it and
the dashboard signs it out.

1. In Authentication → Users, add a user with an email and a strong password.
   Do not use **User Management** in the dashboard; that creates an admin.
2. Set the claim:

   ```sh
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
     node functions/scripts/setDeviceRole.js sensors@example.com
   ```

3. Put the email and password in the firmware as `DEVICE_EMAIL` and
   `DEVICE_PASSWORD`. Keep them out of this repo.
4. Deploy the rules (`firebase deploy --only database`), reflash each sensor,
   and confirm its `Last_Updated` keeps changing.
5. Once all four are reflashed, deploy the final write rule above and disable
   the Anonymous provider in Authentication → Sign-in method.

To rotate the password, change it in the console and reflash all four sensors.

## Roles

| Custom claim | `users.role` | Access |
|---|---|---|
| `super` | `Super User` | Full dashboard, manage admins, edit station locations |
| `admin` | `Admin` | Read-only dashboard |
| `device` | none | Write `Sensordata1..4` only (shared sensor account) |

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
| Warning cooldown | 30 minutes |
| Offline reminder | every 6 hours |
| Offline email | sent 2 minutes after the first station is detected offline, so stations that drop out together share one email |
| Critical alerts | sent immediately, no cooldown |

Emails go to every user whose `users.role` is `Admin` or `Super User`. A recovery
email is sent when a station comes back online.

## Data model

| Firestore path | Purpose |
|---|---|
| `users/{uid}` | Profile, role, first-login flag |
| `station_locations/{stationId}` | Latitude, longitude, and display name |
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

The frontend always uses the project in `.env`; emulators are not wired. The only
tests cover the alert logic (`npm --prefix functions test`). Before shipping:

```sh
npx eslint src
CI=true npm run build
npm --prefix functions test
```

## Known limits

- The CSP in `firebase.json` only restricts `script-src` (CDNs are pinned with
  integrity hashes); it does not restrict connections, images, or styles.
- Thresholds and fallback station names exist in both `src/functions/stationsData.js`
  and `functions/decide.js`; change them together. The `parseTimestamp` copies
  in `src/functions/parseTimestamp.js` and `functions/decide.js` must also match.

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