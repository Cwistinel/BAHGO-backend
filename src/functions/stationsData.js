import { ref, onValue } from 'firebase/database';
import { rtdb } from '../firebase';
import { state } from '../state';
import { showToast } from './notifications';
import { parseTimestamp } from './parseTimestamp';
import { renderStations, renderTable, updateCounts } from './stationsRender';
import { renderTaguigMaps, stationLocations, listenToStationLocations } from './palarMap';

// Thresholds match the Arduino code (sensor mounted 35 in / 88.9 cm above the ground)
//   distance > 44.45 cm  -> green  (safe)
//   distance <= 44.45 cm -> blue   (warning)  = 44.45 cm of water
//   distance <= 5.08 cm  -> red    (critical) = 83.82 cm of water
const SENSOR_MOUNT_HEIGHT_CM = 88.9;
const WARN_LEVEL_CM = 44.45;
const CRIT_LEVEL_CM = 83.82;
const OFFLINE_AFTER_SEC = 150;
const ML_SCALE = 7.62 / SENSOR_MOUNT_HEIGHT_CM;

const ML_INTERCEPT = 0.4853274789608488;
const ML_COEFS = [0.28838929176029493, 2.308913517624719, -1.4872272003480662, -0.07209977300363027, 0.19923314282525553, 0.007294433872660001, 0.5957491461495974, 0.0034158286180801718, 0.0, 0.0, -0.8160093786547183, 1.1515807293933271, -1.0982686162850888, -0.14217436522030538, -0.2142782521256309];
const ML_SCALER_MEANS = [4.979546286132464, 0.9707281375777533, 12.08233321136725, 1.4164371469816792, 0.4941102112609621, 74.08003049152346, 3.8851274545676304, 0.15453104037077692, 0.0, 0.0, 105.02214062690574, 407.79307269179185, 0.943632381677064, 0.7479950752842007, 6.116260323429428];
const ML_SCALER_SCALES = [7.020267037356046, 1.715463301117939, 78.96412771457267, 0.8126480027439398, 0.5318684592811325, 404.67016765278345, 27.061348879016073, 0.36145704853094546, 1.0, 1.0, 2496.7843126789944, 7216.529475774812, 1.465615474765435, 0.6412733464976822, 19.245374310411187];

export function calculateRiseRate(water_level, precipitation) {
    const features = [
        water_level,
        precipitation,
        water_level * precipitation,
        Math.log1p(water_level),
        Math.log1p(precipitation),
        Math.pow(water_level, 2),
        Math.pow(precipitation, 2),
        precipitation === 0 ? 1 : 0,
        water_level === 0 ? 1 : 0,
        (precipitation === 0 && water_level === 0) ? 1 : 0,
        water_level * Math.pow(precipitation, 2),
        Math.pow(water_level, 2) * precipitation,
        Math.log1p(water_level) * Math.log1p(precipitation),
        Math.sqrt(precipitation),
        water_level * Math.sqrt(precipitation)
    ];
    let prediction = ML_INTERCEPT;
    for (let i = 0; i < features.length; i++) {
        const scaledValue = (features[i] - ML_SCALER_MEANS[i]) / ML_SCALER_SCALES[i];
        prediction += scaledValue * ML_COEFS[i];
    }
    if (prediction < 0) prediction = 0;
    return Math.round(prediction * 100) / 100;
}

export function loadStations() {
    if (state.stationsUnsubscribe) {
        state.stationsUnsubscribe();
    }
    const unsubscribeLocations = listenToStationLocations();
    const raw = {};
    const onData = () => {
        const data = raw;
        if (Object.keys(data).length) {
            const newStations = Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).map(([key, s]) => {
                const distanceCm = s.Distance_cm ?? SENSOR_MOUNT_HEIGHT_CM;
                const rawRain = s.Rain_Value ?? 4095;
                const rainRatio = (4095 - rawRain) / 4095;
                let precip = Math.pow(rainRatio, 2) * 15;
                precip = Math.round(precip * 10) / 10;
                let actualWaterLevelCm = SENSOR_MOUNT_HEIGHT_CM - distanceCm;
                if (actualWaterLevelCm < 0) actualWaterLevelCm = 0;
                const rate = Math.round((calculateRiseRate(actualWaterLevelCm * ML_SCALE, precip) / ML_SCALE) * 100) / 100;
                const existingStation = state.stations.find(old => old.id === key);
                const finalTimestamp = s.Last_Updated || (existingStation ? existingStation.timestamp : new Date().toISOString());
                const now = Date.now();
                const lastUpdateMs = parseTimestamp(finalTimestamp);
                const secondsSinceUpdate = (now - lastUpdateMs) / 1000;
                let levelStatus = 'safe';
                if (actualWaterLevelCm >= CRIT_LEVEL_CM || rawRain <= 1200) {
                levelStatus = 'critical';
                } else if (actualWaterLevelCm >= WARN_LEVEL_CM || rawRain <= 2200) {
                levelStatus = 'warning';
                }
const status = secondsSinceUpdate > OFFLINE_AFTER_SEC ? 'offline' : levelStatus;
                const baseNames = {
                    'sensordata1': 'Sealion Street',
                    'sensordata2': 'Samaritan Street',
                    'sensordata3': 'Swingfire Street',
                    'sensordata4': 'Striker Street'
                };
                const displayName = (stationLocations[key] && stationLocations[key].name) || baseNames[key.toLowerCase()] || key;
                return {
                    id: key,
                    name: displayName,
                    level: Math.round(actualWaterLevelCm * 100) / 100,
                    precip: precip,
                    rate: rate,
                    status: status,
                    lastKnownStatus: levelStatus,
                    timestamp: lastUpdateMs ?? finalTimestamp
                };
            });
            state.stations = newStations;
            renderStations();
            renderTable();
            updateCounts();
            renderTaguigMaps();
        }
    };
    const unsubs = [1, 2, 3, 4].map(n => onValue(ref(rtdb, 'Sensordata' + n), (snap) => {
        if (snap.val()) raw['Sensordata' + n] = snap.val(); else delete raw['Sensordata' + n];
        onData();
    }, (err) => showToast('Cannot read station data: ' + err.message, 'error')));
    state.stationsUnsubscribe = () => {
        unsubs.forEach(u => u());
        unsubscribeLocations();
    };
    return state.stationsUnsubscribe;
}