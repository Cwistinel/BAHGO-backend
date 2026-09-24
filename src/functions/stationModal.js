import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
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
            <div class="s-row"><span>Last Updated:</span><span class="val">${new Date(s.timestamp).toLocaleString()}</span></div>
        </div>
        <p style="margin-top: 20px; font-weight: 600; color: var(--text-muted);">1-Hour Predicted Trend</p>
    `;

    if (s.status === 'offline') {
        modalHtml += `
        <div style="text-align:center; padding: 30px; background: #f9fafb; border-radius: 8px; margin-top: 10px; border: 1px dashed #d1d5db;">
            <p style="color: #6b7280; font-weight: 600; margin-bottom: 5px;">⚠️ Device Offline</p>
            <p style="color: #9ca3af; font-size: 0.9rem;">Cannot predict future levels. Please reconnect the hardware sensor to view the live graph.</p>
        </div>`;
    }

    document.getElementById('modalBody').innerHTML = modalHtml;
    document.getElementById('stationModal').classList.add('active');

    const canvas = document.getElementById('stationChart');
    if (!canvas) return;

    if (state.stationChart) state.stationChart.destroy();

    if (s.status === 'offline') {
        canvas.style.display = 'none';
        return;
    }

    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');

    let historyLevels = [];
    try {
        const collectionMap = {
            'sensordata1': 'sensor_readings1',
            'sensordata2': 'sensor_readings2',
            'sensordata3': 'sensor_readings3'
        };

        const collectionName = collectionMap[id.toLowerCase()] || id;
        const histRef = collection(db, collectionName);
        const snap = await getDocs(histRef);

        let records = snap.docs.map(d => d.data());
        records.sort((a, b) => new Date(a.timestamp || a.time || a.Last_Updated || 0) - new Date(b.timestamp || b.time || b.Last_Updated || 0));

        let recent = records.slice(-6).map(r => {
            if (r.level !== undefined) return r.level;
            if (r.Distance_cm !== undefined) {
                let actualLevel = 7.62 - r.Distance_cm;
                return actualLevel < 0 ? 0 : Math.round(actualLevel * 100) / 100;
            }
            return 0;
        });

        while (recent.length < 6) {
            recent.unshift(recent.length > 0 ? recent[0] : s.level);
        }
        historyLevels = recent;
    } catch (e) {
        historyLevels = [s.level, s.level, s.level, s.level, s.level, s.level];
    }

    const realWorldPastRate = s.level - historyLevels[0];
    let fusedRiseRate = (s.rate * 0.6) + (realWorldPastRate * 0.4);
    if (fusedRiseRate < 0) fusedRiseRate = 0;

    const predictData = [s.level];
    let projectedLevel = s.level;
    for (let i = 10; i <= 60; i += 10) {
        projectedLevel += (fusedRiseRate / 6);
        predictData.push(Math.round(projectedLevel * 100) / 100);
    }

    const labels = ['Now', '+10m', '+20m', '+30m', '+40m', '+50m', '+60m'];

    const maxPredicted = predictData[6];
    let predictLineColor = '#22C55E';
    let predictBgColor = 'rgba(34, 197, 94, 0.1)';

    if (maxPredicted >= 4.8) {
        predictLineColor = '#EF4444';
        predictBgColor = 'rgba(239, 68, 68, 0.1)';
    } else if (maxPredicted >= 3.5) {
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
                        idx === 0 ? '#9CA3AF' : (val >= 4.8 ? '#EF4444' : val >= 3.5 ? '#F59E0B' : '#22C55E')
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
                    max: 8,
                    grid: { color: '#f0f0f0' }
                },
                x: { grid: { display: false } }
            }
        }
    });
}
