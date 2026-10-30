import { state } from '../state';
import { esc } from './escape';
import { doc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Shared (Firestore-backed) station locations: { sensordata1: {lat, lng, name, updatedAt}, ... }
export const stationLocations = {};

export function listenToStationLocations() {
    return onSnapshot(collection(db, 'station_locations'), (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === 'removed') delete stationLocations[change.doc.id];
            else stationLocations[change.doc.id] = change.doc.data();
        });
        state.stations.forEach(st => {
            const loc = stationLocations[st.id];
            if (loc && loc.name) st.name = loc.name;
        });
        import('./stationsRender').then(({ renderStations, renderTable }) => {
            renderStations();
            renderTable();
        });
        renderTaguigMaps();
    }, (err) => console.warn('station_locations listener error:', err));
}

export const getPalarBarangay = (name) => (name.toLowerCase().includes('palar') ? 'Palar' : 'Western Bicutan');

// ================= MAPLIBRE + NOAH HAZARD HELPERS =================
const NOAH_PMTILES_URL = 'pmtiles://https://huggingface.co/datasets/bettergovph/project-noah-hazard-maps/resolve/main/PMTiles/noah_hazard_maps.pmtiles';

const STATUS_COLORS = { safe: '#22C55E', warning: '#F59E0B', critical: '#EF4444', offline: '#6B7280' };

// Hazard layers: id, label, NOAH source-layer, attribute, colors for level 1/2/3
const NOAH_LAYERS = [
    { id: 'noah-flood-5yr', label: 'Flood 5-year', layer: 'flood_5yr', attr: 'Var', colors: ['#bfdbfe', '#60a5fa', '#1d4ed8'], visible: true }
];

function baseStyle() {
    return {
        version: 8,
        sources: {
            osm: {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                maxzoom: 19,
                attribution: '© OpenStreetMap'
            }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
    };
}

function ensurePmtilesProtocol() {
    if (window._pmtilesRegistered) return;
    if (window.maplibregl && window.pmtiles) {
        const protocol = new window.pmtiles.Protocol();
        window.maplibregl.addProtocol('pmtiles', protocol.tile);
        window._pmtilesRegistered = true;
    }
}

export function createMap(elementId, lat, lng, zoom) {
    if (!window.maplibregl) return null;
    ensurePmtilesProtocol();
    const map = new window.maplibregl.Map({
        container: elementId,
        style: baseStyle(),
        center: [lng, lat],      // MapLibre uses [lng, lat]
        zoom: zoom,
        maxZoom: 19,
        attributionControl: { compact: true }
    });
    map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    return map;
}

function addHazardLayers(map, withControl) {
    const add = () => {
        if (!window._pmtilesRegistered || map.getSource('noah')) return;
        map.addSource('noah', { type: 'vector', url: NOAH_PMTILES_URL, attribution: 'Hazard data: Project NOAH (ODbL)' });
        NOAH_LAYERS.forEach(l => {
            map.addLayer({
                id: l.id,
                type: 'fill',
                source: 'noah',
                'source-layer': l.layer,
                layout: { visibility: l.visible ? 'visible' : 'none' },
                paint: {
                    'fill-color': ['match', ['get', l.attr], 1, l.colors[0], 2, l.colors[1], 3, l.colors[2], 'transparent'],
                    'fill-opacity': 0.55
                }
            });
        });
    };
    if (map.loaded()) add(); else map.once('load', add);
    if (withControl) addHazardControl(map);
}

function addHazardControl(map) {
    const box = document.createElement('div');
    box.className = 'noah-control';
    box.innerHTML = '<strong>NOAH Hazards</strong>' + NOAH_LAYERS.map(l =>
        `<label><input type="checkbox" data-layer="${l.id}" ${l.visible ? 'checked' : ''}/> ${l.label}</label>`
    ).join('') +
    '<div class="noah-legend"><span style="background:#bfdbfe"></span>Low <span style="background:#60a5fa"></span>Med <span style="background:#1d4ed8"></span>High</div>';
    box.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-layer');
        if (id && map.getLayer(id)) map.setLayoutProperty(id, 'visibility', e.target.checked ? 'visible' : 'none');
    });
    map.getContainer().appendChild(box);
}

export function renderTaguigMaps() {
    if (window.updateMapMarkers) {
        window.updateMapMarkers(state.stations);
    }
}

export function openPalarMapPopup(stationId) {
    const s = state.stations.find(st => st.id === stationId);
    if (!s) return;
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle');
    const stationModal = document.getElementById('stationModal');
    const isSuperAdminDashboard = document.getElementById('superUserScreen')?.classList.contains('active');
    const savedLoc = stationLocations[s.id] || null;
    const lat = savedLoc ? savedLoc.lat : 14.5325;
    const lng = savedLoc ? savedLoc.lng : 121.0655;
    if (modalTitle) modalTitle.textContent = `${s.name} - Palar, Taguig`;
    if (modalBody) {
        modalBody.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:8px">
                <div class="s-row"><span>Water Level:</span><span class="val">${s.level} cm</span></div>
                <div class="s-row"><span>Precipitation:</span><span class="val">${s.precip} mm/hr</span></div>
                <div class="s-row"><span>Rise Rate:</span><span class="val">${s.rate} cm/hr</span></div>
                <div class="s-row"><span>Status:</span><span class="val">${s.status.toUpperCase()}</span></div>
            </div>
            <div id="palarPopupMap" class="palar-popup-map" style="margin-top:12px;width:100%;border-radius:12px;border:1px solid #E2E8F0;z-index:1"></div>
            <p style="font-size:0.75rem;color:#6B7280;margin:6px 0 10px 0">📍 ${esc(s.name)}, Palar Village, Taguig City - Device Location</p>
            ${isSuperAdminDashboard ? `<button class="btn-login" style="width:auto;padding:12px 30px" data-action="edit-location" data-station-id="${esc(s.id)}">Edit Location</button>` : ''}
        `;
    }
    if (stationModal) {
        stationModal.classList.add('palar-map-modal');
        stationModal.classList.add('active');
        const modalContent = stationModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.removeProperty('height');
            modalContent.style.removeProperty('max-height');
            modalContent.style.removeProperty('overflow-y');
        }
    }
    setTimeout(() => {
        if (window.maplibregl && document.getElementById('palarPopupMap')) {
            if (window._palarPopupMap) { window._palarPopupMap.remove(); window._palarPopupMap = null; }
            const map = createMap('palarPopupMap', lat, lng, 18);
            window._palarPopupMap = map;
            addHazardLayers(map, false);
            new window.maplibregl.Marker({ color: STATUS_COLORS[s.status] || '#3B82F6' })
                .setLngLat([lng, lat])
                .setPopup(new window.maplibregl.Popup({ offset: 25 }).setText(s.name))  // setText = safe, no HTML
                .addTo(map)
                .togglePopup();
            setTimeout(() => map.resize(), 200);
        }
    }, 100);
}

export function openPalarEditModal(stationId) {
    const s = state.stations.find(st => st.id === stationId);
    if (!s) return;
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const stationModal = document.getElementById('stationModal');
    const savedLoc = stationLocations[s.id] || null;
    const lat = savedLoc ? savedLoc.lat : 14.5325;
    const lng = savedLoc ? savedLoc.lng : 121.0655;
    if (modalTitle) modalTitle.textContent = `Edit Location - ${s.id}`;
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="field">
                <label>Device ID</label>
                <input type="text" value="${esc(s.id)}" disabled style="background:#f3f4f6" />
            </div>
            <div class="field">
                <label>Street Name</label>
                <input type="text" id="editStreetName" value="${esc(s.name)}" placeholder="e.g. Fox Street" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="field">
                    <label>Latitude</label>
                    <input type="text" id="editLat" value="${esc(lat)}" placeholder="14.5325" />
                </div>
                <div class="field">
                    <label>Longitude</label>
                    <input type="text" id="editLng" value="${esc(lng)}" placeholder="121.0655" />
                </div>
            </div>
            <div class="field">
                <label>Barangay</label>
                <input type="text" value="Palar, Taguig" disabled style="background:#f3f4f6" />
            </div>
            <div id="palarEditMap" style="margin-top:12px;height:300px;width:100%;border-radius:12px;border:1px solid #E2E8F0;z-index:1"></div>
            <div style="display:flex;gap:12px;margin-top:16px">
                <button class="btn-login" style="width:auto;padding:12px 30px" data-action="save-location" data-station-id="${esc(s.id)}">Save Location</button>
                <button class="btn-login" style="width:auto;padding:12px 30px;background:#6B7280" data-action="close-modal">Cancel</button>
            </div>
        `;
    }
    if (stationModal) {
        stationModal.classList.remove('palar-map-modal');
        stationModal.classList.add('active');
        const chartContainer = stationModal.querySelector('.chart-container');
        if (chartContainer) chartContainer.style.display = 'none';
        const modalContent = stationModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.height = 'auto';
            modalContent.style.maxHeight = '90vh';
            modalContent.style.overflowY = 'auto';
        }
    }
    setTimeout(() => {
        if (window.maplibregl && document.getElementById('palarEditMap')) {
            if (window._palarEditMap) { window._palarEditMap.remove(); window._palarEditMap = null; }
            const map = createMap('palarEditMap', lat, lng, 18);
            window._palarEditMap = map;
            addHazardLayers(map, false);
            const editMarker = new window.maplibregl.Marker({ draggable: true })
                .setLngLat([lng, lat])
                .setPopup(new window.maplibregl.Popup({ offset: 25 }).setText(s.name))
                .addTo(map)
                .togglePopup();
            const updateLatLngInputs = (mLat, mLng) => {
                const latInput = document.getElementById('editLat');
                const lngInput = document.getElementById('editLng');
                if (latInput) latInput.value = mLat.toFixed(6);
                if (lngInput) lngInput.value = mLng.toFixed(6);
            };
            editMarker.on('dragend', function() {
                const pos = editMarker.getLngLat();
                updateLatLngInputs(pos.lat, pos.lng);
                map.easeTo({ center: [pos.lng, pos.lat] });
            });
            const latInput = document.getElementById('editLat');
            const lngInput = document.getElementById('editLng');
            if (latInput && lngInput) {
                const moveMarkerFromInputs = () => {
                    const newLat = parseFloat(latInput.value);
                    const newLng = parseFloat(lngInput.value);
                    if (!isNaN(newLat) && !isNaN(newLng)) {
                        editMarker.setLngLat([newLng, newLat]);
                        map.easeTo({ center: [newLng, newLat], zoom: 18 });
                    }
                };
                latInput.addEventListener('change', moveMarkerFromInputs);
                lngInput.addEventListener('change', moveMarkerFromInputs);
            }
            setTimeout(() => map.resize(), 200);
        }
    }, 100);
}

export async function savePalarLocation(stationId) {
    const newName = document.getElementById('editStreetName')?.value.trim();
    const newLat = parseFloat(document.getElementById('editLat')?.value);
    const newLng = parseFloat(document.getElementById('editLng')?.value);
    if (!newName) {
        alert('Please enter street name!');
        return;
    }
    if (isNaN(newLat) || isNaN(newLng)) {
        alert('Please enter valid latitude/longitude!');
        return;
    }
    if (newLat < 14.51 || newLat > 14.55 || newLng < 121.04 || newLng > 121.09) {
        alert('Latitude must be 14.51-14.55 and longitude 121.04-121.09 (Taguig).');
        return;
    }
    try {
        // Saved to Firestore -> every logged-in super user/admin receives it live via onSnapshot
        await setDoc(doc(db, 'station_locations', stationId), {
            lat: newLat,
            lng: newLng,
            name: newName,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        document.getElementById('stationModal').classList.remove('active');
        import('./notifications').then(({ showToast }) => {
            showToast(`${stationId} updated - visible to all users`, 'success');
        });
    } catch (err) {
        alert('Could not save location: ' + err.message);
    }
}

export function initTaguigMaps() {
    if (!window.maplibregl || !window.pmtiles) return;
    const initMap = (elementId, mapLat, mapLng, zoom) => {
        const el = document.getElementById(elementId);
        if (!el) return null;
        if (el._maplibre_map) {
            el._maplibre_map.resize();
            return el._maplibre_map;
        }
        const map = createMap(elementId, mapLat, mapLng, zoom);
        addHazardLayers(map, true);
        map._stationMarkers = {};
        el._maplibre_map = map;
        setTimeout(() => map.resize(), 300);
        return map;
    };
    window.taguigMap = initMap('taguigMap', 14.5325, 121.0655, 18);
    window.superTaguigMap = initMap('superTaguigMap', 14.5325, 121.0655, 18);
    const mapLocations = new WeakMap();
    const fitMapToLocations = (map) => {
        const locations = mapLocations.get(map) || [];
        if (locations.length > 0) {
            const center = locations.reduce(
                ([latTotal, lngTotal], [lat, lng]) => [latTotal + lat, lngTotal + lng],
                [0, 0]
            );
            map.jumpTo({
                center: [center[1] / locations.length, center[0] / locations.length],
                zoom: 18
            });
        }
    };

    window.updateMapMarkers = (stations) => {
        [window.taguigMap, window.superTaguigMap].forEach(map => {
            if (!map) return;
            const locations = [];
            const seen = new Set();
            stations.forEach((s, idx) => {
                const savedLoc = stationLocations[s.id] || null;
                let sLat, sLng, sName;
                if (savedLoc) {
                    sLat = savedLoc.lat;
                    sLng = savedLoc.lng;
                    sName = savedLoc.name;
                } else {
                    sLat = 14.5325 + (idx * 0.0002);
                    sLng = 121.0655 + (idx * 0.0002);
                    sName = s.name;
                }
                if (!Number.isFinite(sLat) || !Number.isFinite(sLng)) return;
                const color = STATUS_COLORS[s.status] || '#3B82F6';
                let marker = map._stationMarkers[s.id];
                if (marker && marker._color !== color) { marker.remove(); marker = null; }
                if (!marker) {
                    marker = new window.maplibregl.Marker({ color }).setLngLat([sLng, sLat]).setPopup(new window.maplibregl.Popup({ offset: 25 })).addTo(map);
                    marker._color = color;
                    map._stationMarkers[s.id] = marker;
                }
                marker.setLngLat([sLng, sLat]).getPopup().setHTML(`${esc(sName)}<br/>${esc(s.status)}<br/>${esc(s.level)} cm`);
                seen.add(s.id);
                locations.push([sLat, sLng]);
            });
            Object.keys(map._stationMarkers).filter(id => !seen.has(id)).forEach(id => { map._stationMarkers[id].remove(); delete map._stationMarkers[id]; });
            mapLocations.set(map, locations);
            // Re-fit when station coords change (fallback -> Firestore, or an edited location), not on every status tick.
            const fitKey = locations.map(l => l.join(',')).join('|');
            if (fitKey !== map._fitKey && locations.length && map.getContainer().getClientRects().length > 0) { fitMapToLocations(map); map._fitKey = fitKey; }
        });
    };

    [['mapView', 'taguigMap'], ['superMapView', 'superTaguigMap']].forEach(([page, key]) => {
        document.querySelectorAll(`.nav-btn[data-page="${page}"]`).forEach(btn => btn.addEventListener('click', () => {
            [300, 800].forEach(ms => setTimeout(() => { window[key]?.resize(); if (window[key]) fitMapToLocations(window[key]); }, ms));
        }));
    });

    if (state.stations.length > 0) {
        window.updateMapMarkers(state.stations);
    }
}

window.initTaguigMaps = initTaguigMaps;