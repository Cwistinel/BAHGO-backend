import { decodePolyline6, zonePolygon, distToPathM, crossed, effectiveStatus, buildZones, ZONE_RADIUS_M } from './routeLogic';

const encode = (pts) => {
    let pLat = 0, pLng = 0, out = '';
    const put = (v) => { v = v < 0 ? ~(v << 1) : v << 1; while (v >= 32) { out += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; } out += String.fromCharCode(v + 63); };
    pts.forEach(([lng, lat]) => { const la = Math.round(lat * 1e6), ln = Math.round(lng * 1e6); put(la - pLat); put(ln - pLng); pLat = la; pLng = ln; });
    return out;
};

const STALE = 150000;
const now = Date.parse('2026-11-02T00:00:00Z');
const fresh = new Date(now - 10000).toISOString();
const old = new Date(now - 600000).toISOString();
const zone = { id: 'Sensordata1', name: 'Sealion Street', lat: 14.5325, lng: 121.0655, status: 'critical' };
const mPerDegLat = 111320;

test('polyline6 round-trips', () => {
    const pts = [[121.0655, 14.5325], [121.0665, 14.5335], [121.0601, 14.5301]];
    decodePolyline6(encode(pts)).forEach((p, i) => { expect(p[0]).toBeCloseTo(pts[i][0], 6); expect(p[1]).toBeCloseTo(pts[i][1], 6); });
});

test('zone polygon never comes closer than the zone radius', () => {
    const ring = zonePolygon(zone);
    expect(distToPathM([zone.lng, zone.lat], [...ring, ring[0]])).toBeGreaterThanOrEqual(ZONE_RADIUS_M - 0.01);
});

test('route through a zone is detected, a route beside it is not', () => {
    const through = [[zone.lng - 0.001, zone.lat + 10 / mPerDegLat], [zone.lng + 0.001, zone.lat + 10 / mPerDegLat]];
    const beside = [[zone.lng - 0.001, zone.lat + 120 / mPerDegLat], [zone.lng + 0.001, zone.lat + 120 / mPerDegLat]];
    expect(crossed(through, [zone])).toEqual([zone]);
    expect(crossed(beside, [zone])).toEqual([]);
});

test('segment that passes between vertices is still caught', () => {
    const longSegment = [[zone.lng - 0.01, zone.lat], [zone.lng + 0.01, zone.lat]];
    expect(crossed(longSegment, [zone])).toEqual([zone]);
});

test('effective status never treats offline, stale or missing data as safe', () => {
    const st = (o) => ({ status: 'safe', lastKnownStatus: 'safe', timestamp: fresh, ...o });
    expect(effectiveStatus(st({}), STALE, now)).toBe('safe');
    expect(effectiveStatus(st({ status: 'warning' }), STALE, now)).toBe('warning');
    expect(effectiveStatus(st({ status: 'offline' }), STALE, now)).toBe('unknown');
    expect(effectiveStatus(st({ status: 'offline', lastKnownStatus: 'critical' }), STALE, now)).toBe('critical');
    expect(effectiveStatus(st({ timestamp: old }), STALE, now)).toBe('unknown');
    expect(effectiveStatus(st({ status: 'critical', lastKnownStatus: 'critical', timestamp: old }), STALE, now)).toBe('critical');
    expect(effectiveStatus(st({ timestamp: 'garbage' }), STALE, now)).toBe('unknown');
    expect(effectiveStatus(undefined, STALE, now)).toBe('unknown');
});

test('buildZones skips bad coordinates and marks locations without station data unknown', () => {
    const locations = { A: { lat: 14.53, lng: 121.06, name: 'A St' }, B: { lat: NaN, lng: 121 }, C: { lat: 14.54, lng: 121.07 } };
    const stations = [{ id: 'A', status: 'critical', lastKnownStatus: 'critical', timestamp: fresh }];
    const zones = buildZones(locations, stations, STALE, now);
    expect(zones.map(z => [z.id, z.status])).toEqual([['A', 'critical'], ['C', 'unknown']]);
});