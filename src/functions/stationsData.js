import { ref, onValue } from 'firebase/database';
import { rtdb } from '../firebase';
import { state } from '../state';
import { showToast } from './notifications';
import { parseTimestamp } from './parseTimestamp';
import { renderStations, renderTable, updateCounts } from './stationsRender';
import { renderTaguigMaps, stationLocations, listenToStationLocations } from './palarMap';
import { recordReading, forecastLevel, riskScore, scoreStatus, levelTrend } from './floodModel';
import { serverNow, setServerOffset } from './serverClock';

// Same as the BahGo app (SensorTracker.kt): 37" mount, Warning above 30 cm, Critical above 60 cm.
export const SENSOR_MOUNT_HEIGHT_CM = 94;
export const WARN_LEVEL_CM = 30;
export const CRIT_LEVEL_CM = 60;
export const OFFLINE_AFTER_SEC = 120;
const REFRESH_MS = 30 * 1000;   // re-check ages and offline status even when no new data arrives

const BASE_NAMES = {
    'sensordata1': 'Sealion Street',
    'sensordata2': 'Samaritan Street',
    'sensordata3': 'Swingfire Street',
    'sensordata4': 'Striker Street'
};
// Stations always appear in the same order (cards, Detailed List, map): Sealion, Samaritan, Swingfire, Striker.
const STATION_ORDER = ['sensordata1', 'sensordata2', 'sensordata3', 'sensordata4'];
const orderOf = (s) => {
    const i = STATION_ORDER.indexOf(s.id.toLowerCase());
    return i === -1 ? STATION_ORDER.length : i;
};

/** Raw rain value (0..4095, 4095 = dry) -> the same words the ESP32 uses. */
export function rainWord(s) {
    const v = Number(s.Rain_Value);
    if (s.Rain_Value == null || !Number.isFinite(v)) return s.Rain_Status || null;
    return v <= 1200 ? 'Heavy Rain' : v <= 2200 ? 'Moderate Rain' : v <= 3200 ? 'Light Rain' : 'Dry';
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
            const newStations = Object.entries(data).map(([key, s]) => {
                const existingStation = state.stations.find(old => old.id === key);
                const distanceCm = Number(s.Distance_cm);
                // Distance 0, negative or missing is not a real reading (invalid echo): keep the last level shown.
                // With no valid reading at all since the page opened, the level is unknown (null), never "0 cm, Normal".
                const previousLevel = existingStation && existingStation.level !== null ? existingStation.level : null;
                const actualWaterLevelCm = distanceCm > 0
                    ? Math.max(0, SENSOR_MOUNT_HEIGHT_CM - distanceCm)
                    : previousLevel;
                const noReading = actualWaterLevelCm === null;
                // A station that never sent a time can't be shown as up to date: treat it as offline.
                const finalTimestamp = s.Last_Updated || (existingStation ? existingStation.timestamp : null);
                const now = serverNow();
                const lastUpdateMs = finalTimestamp ? parseTimestamp(finalTimestamp) : NaN;
                const secondsSinceUpdate = Number.isFinite(lastUpdateMs) ? (now - lastUpdateMs) / 1000 : Infinity;
                let levelStatus = noReading ? null : 'safe';
                if (actualWaterLevelCm > CRIT_LEVEL_CM) {
                    levelStatus = 'critical';
                } else if (actualWaterLevelCm > WARN_LEVEL_CM) {
                    levelStatus = 'warning';
                }
                const sensorError = s.Reading_Status === 'error' || noReading;
                // reporting = the device itself is online (sending updates), even if its water sensor has a fault
                const reporting = secondsSinceUpdate <= OFFLINE_AFTER_SEC;
                const status = !reporting || sensorError ? 'offline' : levelStatus;
                // The app's models: keep the reading, then forecast 30 minutes ahead while online.
                if (distanceCm > 0) {
                    const rain = s.Rain_Value == null ? NaN : Math.min(1, Math.max(0, (4095 - Number(s.Rain_Value)) / 4095));
                    recordReading(key, Number.isFinite(lastUpdateMs) ? lastUpdateMs : now, actualWaterLevelCm, rain);
                }
                const online = status !== 'offline';
                const forecastCm = online ? forecastLevel(key) : null;
                const score = online ? riskScore(key) : null;
                const displayName = (stationLocations[key] && stationLocations[key].name) || BASE_NAMES[key.toLowerCase()] || key;
                return {
                    id: key,
                    name: displayName,
                    level: noReading ? null : Math.round(actualWaterLevelCm * 100) / 100,
                    rain: rainWord(s),
                    trend: online ? levelTrend(key) : null,
                    status: status,
                    reporting: reporting,
                    lastKnownStatus: levelStatus,
                    sensorError: sensorError,
                    forecastCm: forecastCm === null ? null : Math.round(forecastCm * 10) / 10,
                    forecastStatus: forecastCm === null ? null : forecastCm > CRIT_LEVEL_CM ? 'critical' : forecastCm > WARN_LEVEL_CM ? 'warning' : 'safe',
                    riskStatus: score === null ? null : scoreStatus(score),
                    updatedMs: lastUpdateMs,
                    timestamp: finalTimestamp
                };
            });
            // Fixed order, so stations never swap places when their status changes.
            newStations.sort((a, b) => orderOf(a) - orderOf(b) || a.id.localeCompare(b.id));
            state.stations = newStations;
            renderStations();
            renderTable();
            updateCounts();
            renderTaguigMaps();
        }
    };
    const unsubOffset = onValue(ref(rtdb, '.info/serverTimeOffset'), (snap) => { setServerOffset(snap.val()); onData(); });
    const unsubs = [1, 2, 3, 4].map(n => onValue(ref(rtdb, 'Sensordata' + n), (snap) => {
        if (snap.val()) raw['Sensordata' + n] = snap.val(); else delete raw['Sensordata' + n];
        onData();
    }, (err) => showToast(/permission/i.test(err.message) ? 'No access to station data. Log out and log in again.' : 'Cannot read station data. Check your connection.', 'error')));
    const refresh = setInterval(onData, REFRESH_MS);
    state.stationsUnsubscribe = () => {
        unsubs.forEach(u => u());
        unsubOffset();
        clearInterval(refresh);
        unsubscribeLocations();
    };
    return state.stationsUnsubscribe;
}