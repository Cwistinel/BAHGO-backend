import { state } from '../state';

export function updateCounts() {
    const critical = state.stations.filter(s => s.status === 'critical').length;
    const warning = state.stations.filter(s => s.status === 'warning').length;
    const normal = state.stations.filter(s => s.status === 'safe').length;
    const offline = state.stations.filter(s => s.status === 'offline').length;

    const active = state.stations.length - offline;

    const criticalCount = document.getElementById('criticalCount');
    const warningCount = document.getElementById('warningCount');
    const normalCount = document.getElementById('normalCount');
    const activeCount = document.getElementById('activeCount');
    const offlineCount = document.getElementById('offlineCount');

    if (criticalCount) criticalCount.textContent = critical;
    if (warningCount) warningCount.textContent = warning;
    if (normalCount) normalCount.textContent = normal;
    if (activeCount) activeCount.textContent = active;
    if (offlineCount) offlineCount.textContent = offline;
}

export function renderStations() {
    const grid = document.getElementById('stationGrid');
    if (!grid) return;
    grid.innerHTML = state.stations.map(s => `
        <div class="station-card" onclick="openStationModal('${s.id}')">
            <div class="s-header">
                <div>
                    <h3>${s.name}</h3>
                    <p style="font-size: 0.75rem; color: #888;">${new Date(s.timestamp).toLocaleString()}</p>
                </div>
                <span class="dot ${s.status === 'safe' ? 'green' : s.status === 'warning' ? 'yellow' : s.status === 'critical' ? 'red' : 'offline'}"></span>
            </div>
            <div class="s-stats">
                <div class="s-row"><span>Water Level:</span><span class="val">${s.level} cm</span></div>
                <div class="s-row"><span>Precipitation:</span><span class="val">${s.precip} mm/hr</span></div>
                <div class="s-row"><span>Rise Rate:</span><span class="val">${s.rate} cm/hr</span></div>
            </div>
            <div class="s-label ${s.status}">${s.status.toUpperCase()}</div>
        </div>
    `).join('');
}

export function renderTable(filter = '') {
    const tbody = document.getElementById('stationTableBody');
    if (!tbody) return;
    const filtered = state.stations.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));
    tbody.innerHTML = filtered.map(s => `
        <tr onclick="openStationModal('${s.id}')">
            <td>${s.name}</td>
            <td>${s.level} cm</td>
            <td>${s.precip} mm/hr</td>
            <td>${s.rate} cm/hr</td>
            <td>${new Date(s.timestamp).toLocaleString()}</td>
            <td><span class="status-badge ${s.status}">${s.status.toUpperCase()}</span></td>
        </tr>
    `).join('');
}
