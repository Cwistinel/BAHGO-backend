import { state } from '../state';
import { SENSOR_MOUNT_HEIGHT_CM, WARN_LEVEL_CM, CRIT_LEVEL_CM } from './stationsData';
import { stationRows, statusText, ageLabel, ageClass } from './stationText';

export async function openStationModal(id) {
    const s = state.stations.find(st => st.id === id);
    document.getElementById('modalTitle').textContent = s.name;

    let modalHtml = `
        <div class="s-stats">
            ${stationRows(s)}
            <div class="s-row"><span>Status:</span><span class="val">${statusText(s)}</span></div>
            <div class="s-row"><span>Last Updated:</span><span class="val age ${ageClass(s)}">${ageLabel(s)} (${new Date(s.timestamp).toLocaleString()})</span></div>
        </div>
        <p style="margin-top: 20px; font-weight: 600; color: var(--text-muted);">Next hour if the measured rise rate continues (estimate)</p>
    `;

    if (s.sensorError) {
        modalHtml += `
        <div style="text-align:center; padding: 30px; background: #f9fafb; border-radius: 8px; margin-top: 10px; border: 1px dashed #d1d5db;">
            <p style="color: #6b7280; font-weight: 600; margin-bottom: 5px;">⚠️ Sensor Error</p>
            <p style="color: #9ca3af; font-size: 0.9rem;">The device is online but the water sensor has not returned a reading for over a minute. Check the sensor.</p>
        </div>`;
    } else if (s.status !== 'offline' && (!s.trend || s.trend.state === 'collecting')) {
        modalHtml += `
        <div style="text-align:center; padding: 30px; background: #f9fafb; border-radius: 8px; margin-top: 10px; border: 1px dashed #d1d5db;">
            <p style="color: #6b7280; font-weight: 600; margin-bottom: 5px;">Collecting readings…</p>
            <p style="color: #9ca3af; font-size: 0.9rem;">The rise rate and this chart appear after a few minutes of readings while this page is open.</p>
        </div>`;
    } else if (s.status === 'offline') {
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

    if (s.status === 'offline' || !s.trend || s.trend.state === 'collecting') {
        canvas.style.display = 'none';
        return;
    }

    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');

    const riseRate = s.trend.rate;   // measured cm/hr; 0 when steady

    const predictData = [s.level];
    let projectedLevel = s.level;
    for (let i = 10; i <= 60; i += 10) {
        projectedLevel = Math.min(Math.max(projectedLevel + riseRate / 6, 0), SENSOR_MOUNT_HEIGHT_CM);
        predictData.push(Math.round(projectedLevel * 100) / 100);
    }

    const labels = ['Now', '+10m', '+20m', '+30m', '+40m', '+50m', '+60m'];

    const maxPredicted = predictData[6];
    let predictLineColor = '#22C55E';
    let predictBgColor = 'rgba(34, 197, 94, 0.1)';

    if (maxPredicted > CRIT_LEVEL_CM) {
        predictLineColor = '#EF4444';
        predictBgColor = 'rgba(239, 68, 68, 0.1)';
    } else if (maxPredicted > WARN_LEVEL_CM) {
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
                    borderDash: [5, 5], 
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointBackgroundColor: predictData.map((val, idx) =>
                        idx === 0 ? '#9CA3AF' : (val > CRIT_LEVEL_CM ? '#EF4444' : val > WARN_LEVEL_CM ? '#F59E0B' : '#22C55E')
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