<p align="center">
  <img src="public/Image/BahgoIcon.png" alt="Bahgo Logo" width="120" />
</p>

# Bahgo - Flood Detection Monitoring System

Bahgo is a real-time flood detection and monitoring system designed to provide instant alerts and water level data to administrators. It combines IoT sensors (ESP32) with a web-based admin dashboard to monitor flood-prone areas and respond quickly to rising water levels.

The system collects water level and precipitation data from physical sensors and displays it live on a secure, admin-only dashboard. Stations are classified as Normal, Warning, or Critical based on sensor readings, allowing administrators to make fast, informed decisions during flood events.

---

## Features

- 🔐 **Admin-only authentication** via Firebase Auth
- 📊 **Real-time monitoring dashboard** with water level, precipitation, and rise rate
- 🚨 **Status alerts** — Critical, Warning, and Normal classifications
- 📋 **Detailed station list** with search functionality
- 📈 **24-hour water level trend charts** per station
- ⚙️ **Settings panel** for profile and notification preferences
- 🌐 **Deployed on Firebase Hosting**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React.js |
| Authentication | Firebase Auth |
| Database | Firebase Firestore |
| Hosting | Firebase Hosting |
| IoT Sensor | ESP32 + Firebase Realtime Database |
| Charts | Chart.js |

---

## IoT Sensor Setup

The system uses an **ESP32 microcontroller** with:
- **Ultrasonic sensor** — measures water level distance
- **Rain sensor** — detects precipitation

The ESP32 sends data every 5 seconds to Firebase Realtime Database, which the dashboard reads in real time.

### Hardware Pins
| Component | Pin |
|---|---|
| Ultrasonic TRIG | 5 |
| Ultrasonic ECHO | 18 |
| Rain Sensor | 34 |
| Green LED | 14 |
| Blue LED | 27 |
| Red LED | 26 |

---

## Authentication

This system uses **admin-only authentication**. Only the pre-registered admin account in Firebase Auth can log in. User sign-ups are disabled.

---

## Live Demo

🌐 [bahgo.web.app](https://bahgo.web.app)

---

## License

This project is for academic and educational purposes.