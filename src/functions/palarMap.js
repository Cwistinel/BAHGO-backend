import { state } from '../state';
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

const BARANGAYS = ['Western Bicutan','Lower Bicutan','Upper Bicutan','Bagumbayan','Central Bicutan','Maharlika Village','Pinagsama','Tanyag','Ususan','Wawa','Bambang','Calzada','Hagonoy','Ibayo-Tipas','Ligid-Tipas','Napindan','Palingon','San Miguel','Santa Ana','Tuktukan','Palar'];

export function getPalarBarangay(name, idx) {
    if (name.toLowerCase().includes('palar')) return 'Palar';
    return BARANGAYS[idx % BARANGAYS.length];
}

export function renderTaguigMaps() {
    if (window.updateLeafletMarkers) {
        window.updateLeafletMarkers(state.stations);
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
            <p style="font-size:0.75rem;color:#6B7280;margin:6px 0 10px 0">📍 ${s.name}, Palar Village, Taguig City - Device Location</p>
            ${isSuperAdminDashboard ? `<button class="btn-login" style="width:auto;padding:12px 30px" onclick="window.openPalarEditModal('${s.id}')">Edit Location</button>` : ''}
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
        if (window.L && document.getElementById('palarPopupMap')) {
            const map = window.L.map('palarPopupMap').setView([lat, lng], 19);
            map.attributionControl.setPrefix('');
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap',
                maxZoom: 19
            }).addTo(map);
            window.L.marker([lat, lng]).addTo(map).bindPopup(s.name).openPopup();
            setTimeout(() => map.invalidateSize(), 200);
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
                <input type="text" value="${s.id}" disabled style="background:#f3f4f6" />
            </div>
            <div class="field">
                <label>Street Name</label>
                <input type="text" id="editStreetName" value="${s.name}" placeholder="e.g. Fox Street" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="field">
                    <label>Latitude</label>
                    <input type="text" id="editLat" value="${lat}" placeholder="14.5325" />
                </div>
                <div class="field">
                    <label>Longitude</label>
                    <input type="text" id="editLng" value="${lng}" placeholder="121.0655" />
                </div>
            </div>
            <div class="field">
                <label>Barangay</label>
                <input type="text" value="Palar, Taguig" disabled style="background:#f3f4f6" />
            </div>
            <div id="palarEditMap" style="margin-top:12px;height:300px;width:100%;border-radius:12px;border:1px solid #E2E8F0;z-index:1"></div>
            <div style="display:flex;gap:12px;margin-top:16px">
                <button class="btn-login" style="width:auto;padding:12px 30px" onclick="window.savePalarLocation('${s.id}')">Save Location</button>
                <button class="btn-login" style="width:auto;padding:12px 30px;background:#6B7280" onclick="document.getElementById('stationModal').classList.remove('active')">Cancel</button>
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
        if (window.L && document.getElementById('palarEditMap')) {
            const map = window.L.map('palarEditMap').setView([lat, lng], 19);
            map.attributionControl.setPrefix('');
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap',
                maxZoom: 19
            }).addTo(map);
            const editMarker = window.L.marker([lat, lng], { draggable: true }).addTo(map).bindPopup(s.name).openPopup();
            const updateLatLngInputs = (mLat, mLng) => {
                const latInput = document.getElementById('editLat');
                const lngInput = document.getElementById('editLng');
                if (latInput) latInput.value = mLat.toFixed(6);
                if (lngInput) lngInput.value = mLng.toFixed(6);
            };
            editMarker.on('dragend', function(e) {
                const pos = e.target.getLatLng();
                updateLatLngInputs(pos.lat, pos.lng);
                map.setView(pos, 19);
            });
            const latInput = document.getElementById('editLat');
            const lngInput = document.getElementById('editLng');
            if (latInput && lngInput) {
                const moveMarkerFromInputs = () => {
                    const newLat = parseFloat(latInput.value);
                    const newLng = parseFloat(lngInput.value);
                    if (!isNaN(newLat) && !isNaN(newLng)) {
                        editMarker.setLatLng([newLat, newLng]);
                        map.setView([newLat, newLng], 19);
                    }
                };
                latInput.addEventListener('change', moveMarkerFromInputs);
                lngInput.addEventListener('change', moveMarkerFromInputs);
            }
            setTimeout(() => map.invalidateSize(), 200);
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
    if (!window.L) return;
    const initMap = (elementId, mapLat, mapLng, zoom) => {
        const el = document.getElementById(elementId);
        if (!el) return null;
        if (el._leaflet_id) {
            el._leaflet_map.invalidateSize();
            return el._leaflet_map;
        }
        const map = window.L.map(elementId).setView([mapLat, mapLng], zoom);
        map.attributionControl.setPrefix('');
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(map);
        el._leaflet_map = map;
        setTimeout(() => map.invalidateSize(), 300);
        return map;
    };
    window.taguigMap = initMap('taguigMap', 14.5176, 121.05, 13);
    window.superTaguigMap = initMap('superTaguigMap', 14.5176, 121.05, 13);
    const mapLocations = new WeakMap();
    const fitMapToLocations = (map) => {
        const locations = mapLocations.get(map) || [];
        if (locations.length > 0) {
            const center = locations.reduce(
                ([latTotal, lngTotal], [lat, lng]) => [latTotal + lat, lngTotal + lng],
                [0, 0]
            );
            map.setView(
                [center[0] / locations.length, center[1] / locations.length],
                19
            );
        }
    };

    window.updateLeafletMarkers = (stations) => {
        [window.taguigMap, window.superTaguigMap].forEach(map => {
            if (!map) return;
            const locations = [];
            map.eachLayer(layer => {
                if (layer instanceof window.L.Marker) {
                    map.removeLayer(layer);
                }
            });
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
                if (!Number.isFinite(sLat) || !Number.isFinite(sLng) ||
                    sLat < 14.51 || sLat > 14.55 || sLng < 121.04 || sLng > 121.09) {
                    return;
                }
                window.L.marker([sLat, sLng]).addTo(map).bindPopup(`${sName}<br/>${s.status}<br/>${s.level} cm`);
                locations.push([sLat, sLng]);
            });
            mapLocations.set(map, locations);
            if (map.getContainer().getClientRects().length > 0) fitMapToLocations(map);
        });
    };

    document.querySelectorAll('.nav-btn[data-page="mapView"]').forEach(btn => {
        btn.addEventListener('click', () => {
            setTimeout(() => {
                if (window.taguigMap) {
                    window.taguigMap.invalidateSize();
                    fitMapToLocations(window.taguigMap);
                }
            }, 300);
        });
    });
    document.querySelectorAll('.nav-btn[data-page="superMapView"]').forEach(btn => {
        btn.addEventListener('click', () => {
            setTimeout(() => {
                if (window.superTaguigMap) {
                    window.superTaguigMap.invalidateSize();
                    fitMapToLocations(window.superTaguigMap);
                }
            }, 300);
        });
    });

    if (state.stations.length > 0) {
        window.updateLeafletMarkers(state.stations);
    }
}

window.initTaguigMaps = initTaguigMaps;
window.savePalarLocation = savePalarLocation;
window.openPalarEditModal = openPalarEditModal;
window.openPalarMapPopup = openPalarMapPopup;