import { parseTimestamp } from './parseTimestamp';

export const ZONE_RADIUS_M = 50;
const ZONE_SIDES = 16;
const M_PER_DEG = 111320;

export function decodePolyline6(str) {
    const out = [];
    let i = 0, lat = 0, lng = 0;
    const next = () => {
        let result = 0, shift = 0, b;
        do { b = str.charCodeAt(i++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);
        return result & 1 ? ~(result >> 1) : result >> 1;
    };
    while (i < str.length) { lat += next(); lng += next(); out.push([lng / 1e6, lat / 1e6]); }
    return out;
}


export function zonePolygon({ lat, lng }) {
    const R = ZONE_RADIUS_M / Math.cos(Math.PI / ZONE_SIDES);
    const kx = M_PER_DEG * Math.cos((lat * Math.PI) / 180);
    return Array.from({ length: ZONE_SIDES }, (_, i) => {
        const a = (2 * Math.PI * i) / ZONE_SIDES;
        return [lng + (R * Math.sin(a)) / kx, lat + (R * Math.cos(a)) / M_PER_DEG];
    });
}

export function distToPathM(p, path) {
    const kx = M_PER_DEG * Math.cos((p[1] * Math.PI) / 180);
    const xy = path.map(([lng, lat]) => [(lng - p[0]) * kx, (lat - p[1]) * M_PER_DEG]);
    let best = Infinity;
    xy.forEach(([ax, ay], i) => {
        const [bx, by] = xy[Math.min(i + 1, xy.length - 1)];
        const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = len2 ? Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / len2)) : 0;
        best = Math.min(best, Math.hypot(ax + t * (bx - ax), ay + t * (by - ay)));
    });
    return best;
}

export const crossed = (path, zones) => zones.filter(z => distToPathM([z.lng, z.lat], path) < ZONE_RADIUS_M);

export function effectiveStatus(station, staleMs, now = Date.now()) {
    if (!station) return 'unknown';
    const offline = station.status === 'offline' || !(now - parseTimestamp(station.timestamp) <= staleMs);
    if (!offline) return station.status;
    return station.lastKnownStatus === 'critical' ? 'critical' : 'unknown';
}

export const buildZones = (locations, stations, staleMs, now) => Object.entries(locations)
    .filter(([, l]) => Number.isFinite(l.lat) && Number.isFinite(l.lng))
    .map(([id, l]) => ({ id, name: l.name || id, lat: l.lat, lng: l.lng, status: effectiveStatus(stations.find(s => s.id === id), staleMs, now) }));