// Trains the BahGo app's forecast models on the recorded flood days and writes
// src/functions/modelWeights.js for the dashboard.
//
// Same data, inputs, targets and training as the app (Bahgo2.0: RecordedDataset.kt,
// ml/FloodForecaster.kt, ml/Regression.kt, RecordedTraining.kt), so both give the same forecasts.
//
// Usage: node scripts/trainModels.js <path to taguig_rain_4sensors_data.csv>
//   (the CSV is app/src/main/assets/recorded/ in the app repo)

const fs = require('fs');
const path = require('path');

const SENSOR_HEIGHT_CM = 94;
const RECORDED_RAIN_MAX = 1023;          // the recorded rain sensor reads 0..1023, 1023 = dry
const CRITICAL_CM = 60;
const HORIZON_STEPS = 6;                 // 6 x 5 min = 30 min ahead
const FULL_HISTORY_STEPS = 11;           // rows start where the longest input set has history
const VALIDATE_FROM = Date.parse('2026-10-20T00:00:00+08:00');
const TEST_FROM = Date.parse('2026-10-22T00:00:00+08:00');
const ALPHAS = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3];

// ---------- inputs (identical to the app's FeatureSets, and to src/functions/floodModel.js) ----------
const sum = (a, from, to) => { let s = 0; for (let k = from; k <= to; k++) s += a[k]; return s; };
const FEATURES = {
  level: { steps: 6, names: ['Water level now', 'Change, last 5 min', 'Change, last 15 min', 'Change, last 30 min'],
    at: (l, r, i) => [l[i], l[i] - l[i - 1], l[i] - l[i - 3], l[i] - l[i - 6]] },
  levelEarly: { steps: 1, names: ['Water level now', 'Change, last 5 min'],
    at: (l, r, i) => [l[i], l[i] - l[i - 1]] },
  flood: { steps: 11, names: ['Water level now', 'Change, last 5 min', 'Change, last 15 min', 'Change, last 30 min',
    'Rain now', 'Average rain, last 30 min', 'Cumulative rain, last hour', 'Rain change, last 15 min', 'Rain × 30-min change'],
    at: (l, r, i) => { const d30 = l[i] - l[i - 6]; return [l[i], l[i] - l[i - 1], l[i] - l[i - 3], d30, r[i], sum(r, i - 5, i) / 6, sum(r, i - 11, i), r[i] - r[i - 3], r[i] * d30]; } },
  early: { steps: 1, names: ['Water level now', 'Change, last 5 min', 'Rain now'],
    at: (l, r, i) => [l[i], l[i] - l[i - 1], r[i]] }
};

const score = (level) => Math.min(100, Math.max(0, level / CRITICAL_CM * 100));
const targetAt = (s, i, target) => {
  if (target === 'level') return s.levels[i + HORIZON_STEPS] - s.levels[i];
  let peak = s.levels[i + 1];
  for (let k = i + 2; k <= i + HORIZON_STEPS; k++) peak = Math.max(peak, s.levels[k]);
  return score(peak);
};
const baselineAt = (s, i, target) => (target === 'level' ? 0 : score(s.levels[i]));

// ---------- data ----------
function readSeries(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim());
  const [iS, iT, iD, iR] = ['sensor', 'Last_Updated', 'Distance_cm', 'Rain_Value'].map((h) => header.indexOf(h));
  const bySensor = {};
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const f = line.split(',');
    const id = parseInt(String(f[iS]).trim().replace('Sensordata', ''), 10);
    const t = Date.parse(String(f[iT]).trim());
    const d = parseFloat(f[iD]);
    if (!Number.isInteger(id) || Number.isNaN(t) || Number.isNaN(d)) continue;
    const r = iR >= 0 && !Number.isNaN(parseFloat(f[iR])) ? parseFloat(f[iR]) : RECORDED_RAIN_MAX;
    (bySensor[id] = bySensor[id] || []).push({ t, d, r });
  }
  return Object.keys(bySensor).map(Number).sort((a, b) => a - b).map((id) => {
    const rows = bySensor[id].sort((a, b) => a.t - b.t);
    return {
      times: rows.map((x) => x.t),
      levels: rows.map((x) => Math.max(0, SENSOR_HEIGHT_CM - x.d)),
      rain: rows.map((x) => Math.min(1, Math.max(0, (RECORDED_RAIN_MAX - x.r) / RECORDED_RAIN_MAX)))
    };
  });
}

function rows(series, from, until, fs_, target) {
  const x = [], y = [], base = [];
  for (const s of series) {
    for (let i = FULL_HISTORY_STEPS; i < s.levels.length - HORIZON_STEPS; i++) {
      const t = s.times[i];
      if (t < from || t >= until) continue;
      x.push(fs_.at(s.levels, s.rain, i));
      y.push(targetAt(s, i, target));
      base.push(baselineAt(s, i, target));
    }
  }
  return { x, y, base };
}

// ---------- regression (same maths as the app's Regression.kt) ----------
function prepare(xs, ys) {
  const n = xs.length, p = xs[0].length;
  const means = new Array(p).fill(0), stds = new Array(p).fill(0);
  for (const r of xs) for (let j = 0; j < p; j++) means[j] += r[j];
  for (let j = 0; j < p; j++) means[j] /= n;
  for (const r of xs) for (let j = 0; j < p; j++) stds[j] += (r[j] - means[j]) ** 2;
  for (let j = 0; j < p; j++) { stds[j] = Math.sqrt(stds[j] / n); if (stds[j] < 1e-12) stds[j] = 1; }
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  const g = Array.from({ length: p }, () => new Array(p).fill(0)), c = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    const z = xs[i].map((v, j) => (v - means[j]) / stds[j]);
    const yc = ys[i] - yMean;
    for (let j = 0; j < p; j++) { c[j] += z[j] * yc; for (let k = j; k < p; k++) g[j][k] += z[j] * z[k]; }
  }
  for (let j = 0; j < p; j++) { c[j] /= n; for (let k = j; k < p; k++) { g[j][k] /= n; g[k][j] = g[j][k]; } }
  return { means, stds, yMean, g, c };
}

function solve(a, b) {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (pivot !== col) { [a[col], a[pivot]] = [a[pivot], a[col]]; [b[col], b[pivot]] = [b[pivot], b[col]]; }
    const d = a[col][col];
    if (Math.abs(d) < 1e-15) continue;
    for (let r = col + 1; r < n; r++) {
      const f = a[r][col] / d;
      if (f === 0) continue;
      for (let k = col; k < n; k++) a[r][k] -= f * a[col][k];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k];
    x[r] = Math.abs(a[r][r]) < 1e-15 ? 0 : s / a[r][r];
  }
  return x;
}

const model = (prep, coef) => ({ means: prep.means, stds: prep.stds, intercept: prep.yMean, coef });

function fitLinear(xs, ys) {
  const prep = prepare(xs, ys);
  const a = prep.g.map((row, j) => row.map((v, k) => v + (j === k ? 1e-9 : 0)));
  return model(prep, solve(a, prep.c.slice()));
}

function fitLasso(xs, ys, alpha) {
  const prep = prepare(xs, ys);
  const { g, c } = prep, p = c.length, b = new Array(p).fill(0);
  const soft = (x, t) => (x > t ? x - t : x < -t ? x + t : 0);
  for (let sweep = 0; sweep < 10000; sweep++) {
    let biggest = 0;
    for (let j = 0; j < p; j++) {
      if (g[j][j] <= 0) continue;
      let rho = c[j];
      for (let k = 0; k < p; k++) if (k !== j) rho -= g[j][k] * b[k];
      const nb = soft(rho, alpha) / g[j][j];
      biggest = Math.max(biggest, Math.abs(nb - b[j]));
      b[j] = nb;
    }
    if (biggest < 1e-10) break;
  }
  return model(prep, b);
}

const predict = (m, x) => m.coef.reduce((y, w, j) => y + w * (x[j] - m.means[j]) / m.stds[j], m.intercept);
const mae = (p, a) => (p.length ? p.reduce((s, v, i) => s + Math.abs(v - a[i]), 0) / p.length : 0);

// ---------- training (same split and alpha rule as FloodForecaster.train) ----------
function train(series, fs_, target) {
  const fit = rows(series, -Infinity, VALIDATE_FROM, fs_, target);
  const valid = rows(series, VALIDATE_FROM, TEST_FROM, fs_, target);
  const maes = ALPHAS.map((a) => { const m = fitLasso(fit.x, fit.y, a); return mae(valid.x.map((x) => predict(m, x)), valid.y); });
  const best = Math.min(...maes);
  const alpha = Math.max(...ALPHAS.filter((a, i) => maes[i] <= best * 1.02));

  const tr = rows(series, -Infinity, TEST_FROM, fs_, target);
  const lasso = fitLasso(tr.x, tr.y, alpha);
  const linear = fitLinear(tr.x, tr.y);

  const test = rows(series, TEST_FROM, Infinity, fs_, target);
  const clip = (v) => (target === 'score' ? Math.min(100, Math.max(0, v)) : v);
  const moving = target === 'score' ? 2 / CRITICAL_CM * 100 : 2;
  const flood = test.y.map((v, i) => i).filter((i) => Math.abs(test.y[i] - test.base[i]) > moving);
  const report = (pred) => ({
    maeAll: +mae(pred, test.y).toFixed(3),
    maeFlood: +mae(flood.map((i) => pred[i]), flood.map((i) => test.y[i])).toFixed(3)
  });
  return {
    lasso, linear,
    report: {
      alpha,
      lassoKept: fs_.names.filter((n, j) => lasso.coef[j] !== 0),
      lassoDropped: fs_.names.filter((n, j) => lasso.coef[j] === 0),
      trainRows: tr.x.length, testRows: test.x.length, floodRows: flood.length,
      lasso: report(test.x.map((x) => clip(predict(lasso, x)))),
      linear: report(test.x.map((x) => clip(predict(linear, x)))),
      noChange: report(test.base)
    }
  };
}

function main() {
  const csv = process.argv[2];
  if (!csv) { console.error('Usage: node scripts/trainModels.js <taguig_rain_4sensors_data.csv>'); process.exit(1); }
  const series = readSeries(csv);
  const level = train(series, FEATURES.level, 'level');
  const levelEarly = train(series, FEATURES.levelEarly, 'level');
  const risk = train(series, FEATURES.flood, 'score');
  const riskEarly = train(series, FEATURES.early, 'score');

  // The app uses Linear for the water level and Lasso for the risk score.
  const weights = {
    level: level.linear, levelEarly: levelEarly.linear,
    risk: risk.lasso, riskEarly: riskEarly.lasso
  };
  const reports = { level: level.report, levelEarly: levelEarly.report, risk: risk.report, riskEarly: riskEarly.report };
  const out = '// GENERATED by scripts/trainModels.js from the recorded flood days (Oct 13-28). Do not edit by hand.\n' +
    '// prediction = intercept + sum(coef[j] * (x[j] - means[j]) / stds[j])\n' +
    'export const MODEL_WEIGHTS = ' + JSON.stringify(weights, null, 2) + ';\n\n' +
    '// Test results on the held-out days (Oct 22-28): cm for level, score points for risk.\n' +
    'export const MODEL_REPORTS = ' + JSON.stringify(reports, null, 2) + ';\n';
  const dest = path.join(__dirname, '..', 'src', 'functions', 'modelWeights.js');
  fs.writeFileSync(dest, out);
  for (const [k, r] of Object.entries(reports)) {
    console.log(`${k}: alpha=${r.alpha} kept=[${r.lassoKept.join(', ')}] dropped=[${r.lassoDropped.join(', ')}]`);
    console.log(`  train=${r.trainRows} test=${r.testRows} (moving ${r.floodRows})  MAE all lasso=${r.lasso.maeAll} linear=${r.linear.maeAll} no-change=${r.noChange.maeAll}  MAE moving lasso=${r.lasso.maeFlood} linear=${r.linear.maeFlood} no-change=${r.noChange.maeFlood}`);
  }
  console.log('Wrote ' + dest);
}

if (require.main === module) main();
module.exports = { FEATURES, readSeries, rows, fitLinear, fitLasso, predict, train };