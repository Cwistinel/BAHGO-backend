import { state } from '../state';
import { esc } from './escape';
import { LOCATION_LABEL, ageLabel, ageClass, severityOf, statusText, stationRows, trendText, rainText, levelText, timeText } from './stationText';
import { serverNow } from './serverClock';

export function updateCounts() {
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
    set('offlineCount', offline);         set('superOfflineCount', offline);
    const atRisk = state.stations.filter(s => s.status === 'offline' && (s.lastKnownStatus === 'critical' || s.lastKnownStatus === 'warning')).length;
    const riskNote = atRisk > 0 ? atRisk + ' last known at risk' : '';
    set('offlineRiskNote', riskNote);     set('superOfflineRiskNote', riskNote);
}

export function renderStations() {
    const grid = document.getElementById('stationGrid');
    const superGrid = document.getElementById('superStationGrid');
    if (!grid && !superGrid) return;
    const now = serverNow();
    const html = state.stations.map(s => {
        const sev = severityOf(s);
        const offline = s.status === 'offline' ? ' offline' : '';
        return `
        <div class="station-card sev-${sev}${offline}" data-action="open-station" data-station-id="${esc(s.id)}" style="position:relative">
            <div class="card-header-icons" style="display:flex;gap:8px;align-items:center;position:absolute;top:12px;right:12px">
                <button class="map-icon-btn" data-action="open-map" data-station-id="${esc(s.id)}" title="View on map" aria-label="View on map">
                    <img src="/Image/marker.png" alt="" style="width:18px;height:18px;display:block;object-fit:contain;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.2));" />
                </button>
                <span class="dot ${sev}${offline}" role="img" aria-label="${statusText(s)}"></span>
            </div>
            <div class="s-header">
                <div>
                    <h3>${esc(s.name)}</h3>
                    <p class="location-text">${LOCATION_LABEL}</p>
                    <p class="age ${ageClass(s, now)}" title="${esc(timeText(s))}">${ageLabel(s, now)}</p>
                </div>
            </div>
            <div class="s-stats">${stationRows(s)}</div>
            <div class="s-label ${s.status}">${statusText(s)}</div>
        </div>`;
    }).join('');
    if (grid) grid.innerHTML = html;
    if (superGrid) superGrid.innerHTML = html;
}

export function renderTable(filter = document.querySelector('.screen.active :is(#searchInput, #superSearchInput)')?.value || '') {
    const tbody = document.getElementById('stationTableBody');
    const superTbody = document.getElementById('superStationTableBody');
    if (!tbody && !superTbody) return;
    const now = serverNow();
    const filtered = state.stations.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));
    const rows = filtered.map(s => `
        <tr data-action="open-station" data-station-id="${esc(s.id)}">
            <td data-label="Status"><span class="status-badge ${s.status}">${statusText(s)}</span></td>
            <td data-label="Station">${esc(s.name)}</td>
            <td data-label="Water Level">${levelText(s).replace(' ', '&nbsp;')}</td>
            <td data-label="Rain">${rainText(s)}</td>
            <td data-label="Rise Rate">${trendText(s)}</td>
            <td data-label="Last Updated" class="age ${ageClass(s, now)}" title="${esc(timeText(s))}">${ageLabel(s, now)}</td>
        </tr>
    `).join('');
    if (tbody) tbody.innerHTML = rows;
    if (superTbody) superTbody.innerHTML = rows;
}