// The BahGo app's forecast models, running on the dashboard's live readings.
// Same as the app (Bahgo2.0: SensorTracker.LevelHistory, ml/LiveGrid.kt, ml/FloodForecaster.kt):
//   - Linear Regression -> water level in 30 minutes (objective 2)
//   - Lasso Regression  -> flood risk score 0..100 (objective 3), shown as Low / Warning / Critical
// Weights come from scripts/trainModels.js (src/functions/modelWeights.js).
import { MODEL_WEIGHTS } from './modelWeights';

const STEP_MS = 5 * 60 * 1000;          // the models were trained on one reading every 5 minutes
const AVERAGE_WITHIN_MS = 60 * 1000;    // a grid point averages the readings in the minute before it
const MAX_GAP_MS = 10 * 60 * 1000;      // don't join readings further apart than this
const KEEP_MS = 90 * 60 * 1000;         // history kept per sensor
const MAX_SAMPLES = 1500;
const SAVE_EVERY_MS = 15 * 1000;
const MAX_LEVEL_CM = 94;
const SCORE_WARNING = 50;
const SCORE_CRITICAL = 90;
const STORAGE_KEY = 'bahgo_level_history';

const sum = (a, from, to) => { let s = 0; for (let k = from; k <= to; k++) s += a[k]; return s; };
// Inputs, in the same order as scripts/trainModels.js. i = index of "now" on the 5-minute grid.
const INPUTS = {
    level: { steps: 6, at: (l, r, i) => [l[i], l[i] - l[i - 1], l[i] - l[i - 3], l[i] - l[i - 6]] },
    levelEarly: { steps: 1, at: (l, r, i) => [l[i], l[i] - l[i - 1]] },
    risk: { steps: 11, at: (l, r, i) => { const d30 = l[i] - l[i - 6]; return [l[i], l[i] - l[i - 1], l[i] - l[i - 3], d30, r[i], sum(r, i - 5, i) / 6, sum(r, i - 11, i), r[i] - r[i - 3], r[i] * d30]; } },
    riskEarly: { steps: 1, at: (l, r, i) => [l[i], l[i] - l[i - 1], r[i]] }
};

let history = {};
let lastSave = 0;
try { history = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { history = {}; }

/** Remember one reading (rain = intensity 0..1, or NaN). Same rules as the app's LevelHistory.record. */
export function recordReading(id, timeMs, level, rain) {
    const list = (history[id] = history[id] || []);
    const last = list[list.length - 1];
    const r = Number.isFinite(rain) ? rain : null;   // JSON can't store NaN
    if (!last) list.push([timeMs, level, r]);
    else if (timeMs < last[0] - 1000) list.splice(0, list.length, [timeMs, level, r]);   // clock went backwards
    else if (timeMs - last[0] < 1000) { last[0] = Math.max(last[0], timeMs); last[1] = level; last[2] = r; }   // same update again
    else list.push([timeMs, level, r]);
    const cutoff = list[list.length - 1][0] - KEEP_MS;
    while (list.length && (list[0][0] < cutoff || list.length > MAX_SAMPLES)) list.shift();
    if (Date.now() - lastSave > SAVE_EVERY_MS) {
        lastSave = Date.now();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch (e) { /* storage full or blocked: keep in memory */ }
    }
}

/** Value at time t: average of the readings in the minute up to t, else a straight line between neighbours. */
function valueAt(points, col, t) {
    let total = 0, count = 0, before = null, after = null;
    for (const p of points) {
        if (p[col] === null) continue;
        const dt = p[0] - t;
        if (dt < -AVERAGE_WITHIN_MS) before = p;
        else if (dt > 0) { if (!after) after = p; }
        else { total += p[col]; count++; }
    }
    if (count > 0) return total / count;
    if (!before || !after || after[0] - before[0] > MAX_GAP_MS) return null;
    return before[col] + (t - before[0]) / (after[0] - before[0]) * (after[col] - before[col]);
}

/** The readings on the 5-minute grid ending at endMs, or null if history is too short or has a gap. */
export function resample(points, endMs, steps) {
    if (!points.length) return null;
    const levels = [], rain = [];
    for (let k = 0; k <= steps; k++) {
        const t = endMs - (steps - k) * STEP_MS;
        const l = valueAt(points, 1, t);
        if (l === null) return null;
        levels.push(l);
        rain.push(valueAt(points, 2, t) ?? 0);   // no rain value: counted as dry
    }
    return { levels, rain };
}

function apply(w, x) {
    return w.coef.reduce((y, c, j) => y + c * (x[j] - w.means[j]) / w.stds[j], w.intercept);
}

/** Runs the full model if there is enough history, else the quick 5-minute one. */
function run(points, full, early) {
    if (!points.length) return null;
    const endMs = points[points.length - 1][0];
    for (const name of [full, early]) {
        const steps = INPUTS[name].steps;
        const grid = resample(points, endMs, steps);
        if (grid) return { raw: apply(MODEL_WEIGHTS[name], INPUTS[name].at(grid.levels, grid.rain, steps)), levelNow: grid.levels[steps] };
    }
    return null;
}

/** Water level in 30 minutes (cm, Linear Regression), or null while collecting readings. */
export function forecastLevel(id, points = history[id] || []) {
    const r = run(points, 'level', 'levelEarly');
    return r ? Math.min(MAX_LEVEL_CM, Math.max(0, r.levelNow + r.raw)) : null;
}

/** Flood risk score 0..100 (Lasso Regression), or null while collecting readings. */
export function riskScore(id, points = history[id] || []) {
    const r = run(points, 'risk', 'riskEarly');
    return r ? Math.min(100, Math.max(0, r.raw)) : null;
}

/** 'critical' (90+), 'warning' (50-89) or 'safe' (shown as Low), like the app. */
export const scoreStatus = (score) => (score >= SCORE_CRITICAL ? 'critical' : score >= SCORE_WARNING ? 'warning' : 'safe');