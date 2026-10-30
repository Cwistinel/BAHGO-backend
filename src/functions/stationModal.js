import { state } from '../state';

export async function openStationModal(id) {
    const s = state.stations.find(st => st.id === id);
    document.getElementById('modalTitle').textContent = s.name;

    let modalHtml = `
        <div class="s-stats">
            <div class="s-row"><span>Current Water Level:</span><span class="val">${s.level} cm</span></div>
            <div class="s-row"><span>Precipitation:</span><span class="val">${s.precip} mm/hr</span></div>
            <div class="s-row"><span>Rise Rate:</span><span class="val">${s.rate} cm/hr</span></div>
            <div class="s-row"><span>Current Status:</span><span class="val">${s.status.toUpperCase()}</span></div>
            ${s.status === 'offline' ? `<div class="s-row"><span>Last Known Status:</span><span class="val">${(s.lastKnownStatus || 'safe').toUpperCase()}</span></div>` : ''}
            <div class="s-row"><span>Last Updated:</span><span class="val">${new Date(s.timestamp).toLocaleString()}</span></div>
        </div>
        <p style="margin-top: 20px; font-weight: 600; color: var(--text-muted);">1-Hour Predicted Trend (model estimate)</p>
    `;

    if (s.status === 'offline') {
        modalHtml += `
        <div style="text-align:center; padding: 30px; background: #f9fafb; border-radius: 8px; margin-top: 10px; border: 1px dashed #d1d5db;">
            <p style="color: #6b7280; font-weight: 600; margin-bottom: 5px;">⚠️ Device Offline</p>
            <p style="color: #9ca3af; font-size: 0.9rem;">Cannot predict future levels. Please reconnect the hardware sensor to view the live graph.</p>
        </div>`;
    }

    document.getElementById('modalBody').innerHTML = modalHtml;
    const stationModal = document.getElementById('stationModal');
    stationModal.classList.remove('palar-map-modal');
    const modalContent = stationModal.querySelector('.modal-content');
    modalContent.style.removeProperty('height');
    modalContent.style.removeProperty('max-height');
    modalContent.style.removeProperty('overflow-y');
    const chartContainer = stationModal.querySelector('.chart-container');
    if (chartContainer) chartContainer.style.removeProperty('display');
    stationModal.classList.add('active');

    const canvas = document.getElementById('stationChart');
    if (!canvas) return;

    if (state.stationChart) state.stationChart.destroy();

    if (s.status === 'offline') {
        canvas.style.display = 'none';
        return;
    }

    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');

    const riseRate = Math.max(s.rate, 0); // cm/hr from the model

    const predictData = [s.level];
    let projectedLevel = s.level;
    for (let i = 10; i <= 60; i += 10) {
        projectedLevel += (riseRate / 6);
        predictData.push(Math.round(projectedLevel * 100) / 100);
    }

    const labels = ['Now', '+10m', '+20m', '+30m', '+40m', '+50m', '+60m'];

    const maxPredicted = predictData[6];
    let predictLineColor = '#22C55E';
    let predictBgColor = 'rgba(34, 197, 94, 0.1)';

    if (maxPredicted >= 83.82) {
        predictLineColor = '#EF4444';
        predictBgColor = 'rgba(239, 68, 68, 0.1)';
    } else if (maxPredicted >= 44.45) {
        predictLineColor = '#F59E0B';
        predictBgColor = 'rgba(245, 158, 11, 0.1)';
    }

    state.stationChart = new window.Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Predicted Level (cm)',
                    data: predictData,
                    borderColor: predictLineColor,
                    backgroundColor: predictBgColor,
                    borderDash: [5, 5], // Matching the dashed look from image_cb7a20.png
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    // Matches the visual where 'Now' is a neutral dot and the rest follow prediction severity
                    pointBackgroundColor: predictData.map((val, idx) =>
                        idx === 0 ? '#9CA3AF' : (val >= 83.82 ? '#EF4444' : val >= 44.45 ? '#F59E0B' : '#22C55E')
                    ),
                    pointBorderColor: '#fff',
                    borderWidth: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: '#f0f0f0' }
                },
                x: { grid: { display: false } }
            }
        }
    });
}