import { ageText, ageClass, ageLabel, severityOf, statusText, trendText, stationRows, LOCATION_LABEL } from './stationText';

const NOW = Date.parse('2026-11-24T20:00:00+08:00');
const S = 1000, MIN = 60 * S, H = 60 * MIN, D = 24 * H;

test('ageText', () => {
    expect(ageText(NOW - 12 * S, NOW)).toBe('12 s ago');
    expect(ageText(NOW - 5 * MIN, NOW)).toBe('5 min ago');
    expect(ageText(NOW - 3 * H, NOW)).toBe('3 h ago');
    expect(ageText(NOW - D, NOW)).toBe('1 day ago');
    expect(ageText(NOW - 6 * D, NOW)).toBe('6 days ago');
    expect(ageText(NOW - 195 * D, NOW)).toBe('6 months ago');
    expect(ageText(NaN, NOW)).toBe('never');
});

test('age colour: none while reporting, amber offline < 1 h, red after', () => {
    expect(ageClass({ status: 'safe', updatedMs: NOW - 10 * S }, NOW)).toBe('');
    expect(ageClass({ status: 'offline', updatedMs: NOW - 10 * MIN }, NOW)).toBe('stale');
    expect(ageClass({ status: 'offline', updatedMs: NOW - 2 * H }, NOW)).toBe('dead');
    expect(ageLabel({ status: 'offline', updatedMs: NOW - 2 * H }, NOW)).toBe('Last seen 2 h ago');
    expect(ageLabel({ status: 'warning', updatedMs: NOW - 4 * S }, NOW)).toBe('Updated 4 s ago');
});

test('severity and status text use the last known status when offline', () => {
    expect(severityOf({ status: 'offline', lastKnownStatus: 'critical' })).toBe('critical');
    expect(severityOf({ status: 'warning' })).toBe('warning');
    expect(statusText({ status: 'offline', lastKnownStatus: 'warning' })).toBe('OFFLINE - LAST KNOWN: WARNING');
    expect(statusText({ status: 'offline', lastKnownStatus: 'safe', sensorError: true })).toBe('SENSOR ERROR - LAST KNOWN: SAFE');
});

test('trend text never shows an impossible number', () => {
    expect(trendText({ status: 'safe', trend: { state: 'collecting', rate: null } })).toBe('Collecting readings…');
    expect(trendText({ status: 'safe', trend: { state: 'steady', rate: 0 } })).toBe('Steady');
    expect(trendText({ status: 'warning', trend: { state: 'rising', rate: 12.345 } })).toBe('Rising 12.3 cm/hr');
    expect(trendText({ status: 'safe', trend: { state: 'falling', rate: -4 } })).toBe('Falling 4.0 cm/hr');
    expect(trendText({ status: 'offline', trend: null })).toBe('--');
});

test('station rows: same rows everywhere, estimates labelled', () => {
    const html = stationRows({ status: 'safe', level: 0, rain: 'Heavy Rain', trend: { state: 'steady', rate: 0 }, forecastCm: 1.2, forecastStatus: 'safe', riskStatus: 'safe' });
    expect(html).toContain('Heavy Rain');
    expect(html).toContain('Steady');
    expect(html).toContain('Level in 30 min (estimate):');
    expect(html).toContain('Flood Risk (estimate):');
    expect(html).not.toContain('mm/hr');
    expect(LOCATION_LABEL).toBe('Palar Village, Taguig');
});

describe('no reading and server clock', () => {
    const { statusText, levelText, timeText, ageText } = require('./stationText');
    const { setServerOffset, serverNow } = require('./serverClock');
    test('a station with no valid reading is not shown as Normal', () => {
        const s = { status: 'offline', sensorError: true, lastKnownStatus: null, level: null, timestamp: null };
        expect(statusText(s)).toBe('SENSOR ERROR - NO READING');
        expect(levelText(s)).toBe('--');
        expect(timeText(s)).toBe('never');
    });
    test('ages use the server clock, not the computer clock', () => {
        setServerOffset(-10 * 60 * 1000);           // this computer runs 10 minutes fast
        const updated = serverNow() - 30 * 1000;   // the station reported 30 s ago (server time)
        expect(ageText(updated)).toBe('30 s ago');
        setServerOffset(0);
    });
});

test('an online device with a sensor fault says "Updated", not "Last seen"', () => {
    const { ageLabel, ageClass } = require('./stationText');
    const s = { status: 'offline', sensorError: true, reporting: true, updatedMs: NOW - 5 * S };
    expect(ageLabel(s, NOW)).toBe('Updated 5 s ago');
    expect(ageClass(s, NOW)).toBe('');
    expect(ageLabel({ ...s, reporting: false, updatedMs: NOW - 5 * MIN }, NOW)).toBe('Last seen 5 min ago');
});