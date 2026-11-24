import { recordReading, resample, forecastLevel, riskScore, scoreStatus } from './floodModel';

const MIN = 60 * 1000;
const T0 = Date.parse('2026-11-24T08:00:00+08:00');
// One reading every 5 s for `minutes`, level from levelAt(minute), rain intensity 0..1
const readings = (minutes, levelAt, rain = 0) => {
    const pts = [];
    for (let t = 0; t <= minutes * MIN; t += 5000) pts.push([T0 + t, levelAt(t / MIN), rain]);
    return pts;
};

test('needs 5 minutes of readings before the first forecast', () => {
    expect(forecastLevel('a', [])).toBeNull();
    expect(forecastLevel('a', readings(3, () => 10))).toBeNull();
    expect(riskScore('a', readings(3, () => 10))).toBeNull();
    expect(forecastLevel('a', readings(6, () => 10))).not.toBeNull();   // quick model
});

test('steady dry street: forecast stays about the same, risk Low', () => {
    const pts = readings(60, () => 10);
    expect(Math.abs(forecastLevel('a', pts) - 10)).toBeLessThan(1);
    expect(scoreStatus(riskScore('a', pts))).toBe('safe');
});

test('fast rise in heavy rain: forecast above the current level, risk not Low', () => {
    const pts = readings(60, (m) => m * 0.8, 1);      // 0 -> 48 cm in an hour
    expect(forecastLevel('a', pts)).toBeGreaterThan(48);
    expect(scoreStatus(riskScore('a', pts))).not.toBe('safe');
});

test('output stays within 0..94 cm and 0..100', () => {
    const pts = readings(60, (m) => Math.min(94, m * 3), 1);
    expect(forecastLevel('a', pts)).toBeLessThanOrEqual(94);
    expect(riskScore('a', pts)).toBeLessThanOrEqual(100);
});

test('resample: averages the minute before each 5-minute point, gives up on long gaps', () => {
    const pts = [[T0, 10, 0], [T0 + 5 * MIN - 30000, 20, 0], [T0 + 5 * MIN, 22, 0]];
    expect(resample(pts, T0 + 5 * MIN, 1).levels).toEqual([10, 21]);
    expect(resample([[T0, 10, 0], [T0 + 9 * MIN, 19, 0]], T0 + 9 * MIN, 1).levels).toEqual([14, 19]);   // 9-min gap: joined
    expect(resample([[T0, 10, 0], [T0 + 20 * MIN, 10, 0]], T0 + 20 * MIN, 1)).toBeNull();               // 20-min gap: no
});

test('scoreStatus bands match the app: <50 Low, 50-89 Warning, 90+ Critical', () => {
    expect(scoreStatus(49.9)).toBe('safe');
    expect(scoreStatus(50)).toBe('warning');
    expect(scoreStatus(89.9)).toBe('warning');
    expect(scoreStatus(90)).toBe('critical');
});

test('recordReading keeps the history used by the forecast', () => {
    for (const [t, level] of readings(10, () => 15)) recordReading('Sensordata9', t, level, NaN);
    recordReading('Sensordata9', T0 + 10 * MIN, 15, NaN);   // same update delivered twice
    expect(Math.abs(forecastLevel('Sensordata9') - 15)).toBeLessThan(2);
    recordReading('Sensordata9', T0, 15, NaN);               // clock went backwards: starts over
    expect(forecastLevel('Sensordata9')).toBeNull();
});