import { state } from '../state';
import { esc } from './escape';
import { getPalarBarangay } from './palarMap';

function statusText(s) {
    const base = s.status.toUpperCase();
    if (s.status !== 'offline') return base;
    return base + ' - LAST KNOWN: ' + (s.lastKnownStatus || 'safe').toUpperCase();
}

export function updateCounts() {
    // shortcut: offline stations count by last known status, so a dead sensor keeps the Critical/Warning total up; add a stale-after-N-hours rule once sensors report reliably.
    const count = (st) => state.stations.filter(s => s.status === st || (s.status === 'offline' && s.lastKnownStatus === st)).length;
    const critical = count('critical');
    const warning = count('warning');
    const normal = state.stations.filter(s => s.status === 'safe').length;
    const offline = state.stations.filter(s => s.status === 'offline').length;
    const active = state.stations.length - offline;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('criticalCount', critical);       set('superCriticalCount', critical);
    set('warningCount', warning);         set('superWarningCount', warning);
    set('normalCount', normal);           set('superNormalCount', normal);
    set('activeCount', active);           set('superActiveCount', active);
    const atRisk = state.stations.filter(s => s.status === 'offline' && (s.lastKnownStatus === 'critical' || s.lastKnownStatus === 'warning')).length;
    const offlineText = atRisk > 0 ? offline + ' (' + atRisk + ' last known at risk)' : offline;
    set('offlineCount', offlineText);     set('superOfflineCount', offlineText);
    }

export function renderStations() {
    const grid = document.getElementById('stationGrid');
    const superGrid = document.getElementById('superStationGrid');
    if (!grid && !superGrid) return;
    const html = state.stations.map(s => `
        <div class="station-card" data-action="open-station" data-station-id="${esc(s.id)}" style="position:relative">
            <div class="card-header-icons" style="display:flex;gap:8px;align-items:center;position:absolute;top:12px;right:12px">
                <button class="map-icon-btn" data-action="open-map" data-station-id="${esc(s.id)}" title="View Palar Map" aria-label="View Palar Map">
                    <img src="/Image/marker.png" alt="Palar map marker" style="width:18px;height:18px;display:block;object-fit:contain;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.2));" />
                </button>
                <span class="dot ${s.status === 'safe' ? 'green' : s.status === 'warning' ? 'yellow' : s.status === 'critical' ? 'red' : 'offline'}"></span>
            </div>
            <div class="s-header">
                <div>
                    <h3>${esc(s.name)}</h3>
                    <p class="location-text" style="font-size: 0.75rem; color: #6B7280;">${getPalarBarangay(s.name)}, Taguig</p>
                    <p style="font-size: 0.75rem; color: #888;">${new Date(s.timestamp).toLocaleString()}</p>
                </div>
            </div>
            <div class="s-stats">
                <div class="s-row"><span>Water Level:</span><span class="val">${s.level} cm</span></div>
                <div class="s-row"><span>Precipitation:</span><span class="val">${s.precip} mm/hr</span></div>
                <div class="s-row"><span>Rise Rate:</span><span class="val">${s.rate} cm/hr</span></div>
            </div>
            <div class="s-label ${s.status}">${statusText(s)}</div>
        </div>
    `).join('');
    if (grid) grid.innerHTML = html;
    if (superGrid) superGrid.innerHTML = html;
}

export function renderTable(filter = document.getElementById('searchInput')?.value || document.getElementById('superSearchInput')?.value || '') {
    const tbody = document.getElementById('stationTableBody');
    const superTbody = document.getElementById('superStationTableBody');
    if (!tbody && !superTbody) return;
    const filtered = state.stations.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));
    const rows = filtered.map(s => `
        <tr data-action="open-station" data-station-id="${esc(s.id)}">
            <td>${esc(s.name)}</td>
            <td>${s.level} cm</td>
            <td>${s.precip} mm/hr</td>
            <td>${s.rate} cm/hr</td>
            <td>${new Date(s.timestamp).toLocaleString()}</td>
            <td><span class="status-badge ${s.status}">${statusText(s)}</span></td>
        </tr>
    `).join('');
    if (tbody) tbody.innerHTML = rows;
    if (superTbody) superTbody.innerHTML = rows;
}