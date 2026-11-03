import { state } from '../state';
import { esc } from './escape';
import { stationLocations, STATUS_COLORS } from './palarMap';
import { OFFLINE_AFTER_SEC } from './stationsData';
import { buildZones, crossed, decodePolyline6, effectiveStatus, zonePolygon } from './routeLogic';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const VALHALLA = process.env.REACT_APP_VALHALLA_URL || 'https://valhalla1.openstreetmap.de';
const SEARCH_BOX = '120.99,14.60,121.12,14.44'; // left,top,right,bottom around Taguig
const LABEL = { safe: 'Safe', warning: 'Warning', critical: 'Critical', unknown: 'Unknown' };
const names = (zones) => zones.map(z => esc(z.name)).join(', ');

async function geocode(q) {
    const res = await fetch(`${NOMINATIM}?format=jsonv2&limit=5&countrycodes=ph&bounded=1&viewbox=${SEARCH_BOX}&q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`Location search failed (${res.status})`);
    return (await res.json()).map(p => ({ name: p.display_name, lat: +p.lat, lng: +p.lon }));
}

async function fetchRoute(from, to, exclude) {
    const req = {
        locations: [{ lat: from.lat, lon: from.lng }, { lat: to.lat, lon: to.lng }],
        costing: 'auto',
        directions_options: { units: 'kilometers', language: 'en-US' },
        ...(exclude.length && { exclude_polygons: exclude.map(zonePolygon) })
    };
    const res = await fetch(`${VALHALLA}/route?json=${encodeURIComponent(JSON.stringify(req))}`);
    const body = await res.json().catch(() => ({}));
    if (body.error_code === 442) return null;
    if (!res.ok || !body.trip) throw new Error(body.error || `Routing service error (${res.status})`);
    const leg = body.trip.legs[0];
    return { path: decodePolyline6(leg.shape), km: body.trip.summary.length, sec: body.trip.summary.time, steps: leg.maneuvers };
}

export function initRoutePlanner(map) {
    const mapEl = map.getContainer();
    const panel = document.createElement('div');
    panel.className = 'route-planner';
    const box = (key, label) => `<div class="rp-field"><input data-rp="${key}" placeholder="${label} - type a place, press Enter" /><button type="button" data-search="${key}">Search</button><div class="rp-list" data-list="${key}"></div></div>`;
    panel.innerHTML = box('from', 'Starting point') + box('to', 'Destination') +
        '<div class="rp-actions"><button type="button" data-go>Get route</button><button type="button" data-clear>Clear</button></div>' +
        '<div class="rp-legend">' + Object.keys(LABEL).map(k => `<span><i style="background:${STATUS_COLORS[k]}"></i>${LABEL[k]}</span>`).join('') + '</div>' +
        '<div class="rp-out" aria-live="polite"></div>';
    mapEl.parentElement.insertBefore(panel, mapEl);
    const q = (sel) => panel.querySelector(sel);
    const out = q('.rp-out');

    const pts = { from: null, to: null };
    const pins = {};
    let seq = 0, routed = false, lastSig = '';

    const whenReady = (fn) => (map.isStyleLoaded() ? fn() : map.once('load', fn));
    const setGeo = (id, features, layers) => whenReady(() => {
        const data = { type: 'FeatureCollection', features };
        if (map.getSource(id)) return map.getSource(id).setData(data);
        map.addSource(id, { type: 'geojson', data });
        layers.forEach(l => map.addLayer({ ...l, id: `${id}-${l.type}`, source: id }));
    });

    const snapshot = () => {
        const zones = buildZones(stationLocations, state.stations, OFFLINE_AFTER_SEC * 1000);
        const unlocated = state.stations.filter(s => !zones.some(z => z.id === s.id)).map(s => ({ ...s, status: effectiveStatus(s, OFFLINE_AFTER_SEC * 1000) }));
        return { zones, unlocated };
    };
    const drawZones = (zones) => setGeo('flood-zones', zones.map(z => {
        const ring = zonePolygon(z);
        return { type: 'Feature', properties: { color: STATUS_COLORS[z.status] }, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } };
    }), [
        { type: 'fill', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.3 } },
        { type: 'line', paint: { 'line-color': ['get', 'color'], 'line-width': 2 } }
    ]);

    const clearRoute = () => { routed = false; map.getSource('route')?.setData({ type: 'FeatureCollection', features: [] }); };
    const fail = (html) => { clearRoute(); out.innerHTML = `<div class="rp-error">${html}</div>`; };

    async function plan({ fit, note = '' }) {
        const id = ++seq;
        const { zones, unlocated } = snapshot();
        if (!state.stations.length) return fail('Flood data has not loaded yet, so a route cannot be checked.');
        if (unlocated.some(s => s.status === 'critical')) return fail('A Critical station has no saved location, so its street cannot be avoided. No route is shown.');
        clearRoute();
        out.textContent = 'Calculating route…';
        const critical = zones.filter(z => z.status === 'critical');
        try {
            const [plain, route] = await Promise.all([critical.length ? fetchRoute(pts.from, pts.to, []) : null, fetchRoute(pts.from, pts.to, critical)]);
            if (id !== seq) return;
            if (!route) return fail('No accessible route is available between these points.');
            const violated = crossed(route.path, critical);
            if (violated.length) return fail(`No accessible route is available. The routing service returned a path through Critical street(s) (${names(violated)}); it was rejected.`);

            const blocked = plain ? crossed(plain.path, critical) : [];
            const through = (status) => crossed(route.path, zones.filter(z => z.status === status));
            const warn = through('warning'), unknown = through('unknown');
            const notices = [
                note && `<div class="rp-info">${note}</div>`,
                blocked.length && `<div class="rp-info">The fastest route crosses Critical street(s) (${names(blocked)}). Showing an alternative that avoids them.</div>`,
                warn.length && `<div class="rp-warn">Passes Warning street(s): ${names(warn)}.</div>`,
                unknown.length && `<div class="rp-warn">NOT FULLY VERIFIED: passes street(s) with unknown condition (sensor offline): ${names(unknown)}.</div>`,
                unlocated.length && `<div class="rp-warn">${unlocated.length} station(s) have no saved location, so their streets are not checked.</div>`,
                `<div class="rp-info">Avoids all streets currently Critical. Flood status is only known near the monitored stations shown on the map; the rest of the route is unmonitored, not confirmed safe.</div>`
            ].filter(Boolean).join('');
            const steps = route.steps.map(m => `<li>${esc(m.instruction)}${m.length ? ` <small>(${m.length.toFixed(2)} km)</small>` : ''}</li>`).join('');
            out.innerHTML = `<div class="rp-sum">${Math.round(route.sec / 60)} min · ${route.km.toFixed(1)} km</div>${notices}<ol class="rp-steps">${steps}</ol>`;

            setGeo('route', [{ type: 'Feature', geometry: { type: 'LineString', coordinates: route.path } }],
                [{ type: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563EB', 'line-width': 5 } }]);
            routed = true;
            if (fit) map.fitBounds(route.path.reduce((b, c) => b.extend(c), new window.maplibregl.LngLatBounds(route.path[0], route.path[0])), { padding: 60 });
        } catch (err) {
            if (id === seq) fail(`Could not verify a route: ${esc(err.message)}. No route is shown because it cannot be checked against flood conditions.`);
        }
    }

    const setPoint = (key, p) => {
        pts[key] = p;
        pins[key]?.remove();
        pins[key] = p && new window.maplibregl.Marker({ color: key === 'from' ? '#2563EB' : '#111827' }).setLngLat([p.lng, p.lat]).addTo(map);
    };
    ['from', 'to'].forEach(key => {
        const input = q(`[data-rp="${key}"]`), list = q(`[data-list="${key}"]`);
        let found = [];
        const search = async () => {
            if (!input.value.trim()) return;
            list.textContent = 'Searching…';
            try {
                found = await geocode(input.value.trim());
                list.innerHTML = found.length ? found.map((p, i) => `<button type="button" data-i="${i}">${esc(p.name)}</button>`).join('') : 'No places found in Taguig.';
            } catch (err) { list.textContent = err.message; }
        };
        input.addEventListener('input', () => setPoint(key, null));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
        q(`[data-search="${key}"]`).addEventListener('click', search);
        list.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-i]');
            if (!b) return;
            const p = found[+b.dataset.i];
            input.value = p.name;
            list.innerHTML = '';
            setPoint(key, p);
        });
    });
    q('[data-go]').addEventListener('click', () => {
        if (!pts.from || !pts.to) return fail('Search for both places and pick a result for each.');
        plan({ fit: true });
    });
    q('[data-clear]').addEventListener('click', () => {
        seq++;
        ['from', 'to'].forEach(k => { setPoint(k, null); q(`[data-rp="${k}"]`).value = ''; q(`[data-list="${k}"]`).innerHTML = ''; });
        clearRoute(); out.innerHTML = '';
    });

    const tick = () => {
        const { zones, unlocated } = snapshot();
        const sig = [...zones, ...unlocated].map(z => `${z.id}:${z.status}:${z.lat},${z.lng}`).join('|') + state.stations.length;
        if (sig === lastSig) return;
        lastSig = sig;
        drawZones(zones);
        if (routed && pts.from && pts.to) plan({ fit: false, note: 'Flood conditions changed; route rechecked.' });
    };
    tick();
    setInterval(tick, 5000);
}