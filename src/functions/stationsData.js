import { ref, onValue } from 'firebase/database';
import { rtdb } from '../firebase';
import { state } from '../state';
import { renderStations, renderTable, updateCounts } from './stationsRender';
import { renderTaguigMaps, stationLocations, listenToStationLocations } from './palarMap';

// Thresholds match the Arduino code (sensor mounted 35 in / 88.9 cm above the ground)
//   distance > 44.45 cm  -> green  (safe)
//   distance <= 44.45 cm -> blue   (warning)  = 44.45 cm of water
//   distance <= 5.08 cm  -> red    (critical) = 83.82 cm of water
const SENSOR_MOUNT_HEIGHT_CM = 88.9;
const WARN_LEVEL_CM = 44.45;
const CRIT_LEVEL_CM = 83.82;
// The rise-rate model below was trained on a small prototype scale (levels up to 7.62 cm),
// so levels are scaled down before the model and the result is scaled back up.
const ML_SCALE = 7.62 / SENSOR_MOUNT_HEIGHT_CM;

// Coefficients for the linear rise-rate model, trained offline and baked in here.
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
    const DEMO_DAMPENER = 0.05;
    prediction = prediction * DEMO_DAMPENER;
    return Math.round(prediction * 100) / 100;
}

export function loadStations() {
    if (state.stationsUnsubscribe) {
        state.stationsUnsubscribe();
    }
    const unsubscribeLocations = listenToStationLocations();
    const stationsRef = ref(rtdb, '/');
    const unsubscribeStations = onValue(stationsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const newStations = Object.entries(data).filter(([key, s]) => key.toLowerCase().includes('sensor')).map(([key, s]) => {
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
                const now = new Date().getTime();
                const lastUpdateMs = new Date(finalTimestamp).getTime();
                const secondsSinceUpdate = (now - lastUpdateMs) / 1000;
                let status = 'safe';
                if (secondsSinceUpdate > 5) {
                    status = 'offline';
                } else if (actualWaterLevelCm >= CRIT_LEVEL_CM || rawRain <= 1200) {
                    status = 'critical';
                } else if (actualWaterLevelCm >= WARN_LEVEL_CM || rawRain <= 2200) {
                    status = 'warning';
                }
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
                    timestamp: finalTimestamp
                };
            });
            state.stations = newStations;
            renderStations();
            renderTable();
            updateCounts();
            renderTaguigMaps();
        }
    });
    // one unsubscribe handle that stops both listeners (logout handlers already call it)
    state.stationsUnsubscribe = () => {
        unsubscribeStations();
        unsubscribeLocations();
    };
    return state.stationsUnsubscribe;
}

export function startStationListener() {
    return loadStations();
}