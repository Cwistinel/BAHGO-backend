import { signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { auth, db, rtdb } from '../firebase';
import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';

let stationsUnsubscribe = null;

let stations = [];
let stationChart = null;

const ML_INTERCEPT = 0.4853274789608488;
const ML_COEFS = [0.28838929176029493, 2.308913517624719, -1.4872272003480662, -0.07209977300363027, 0.19923314282525553, 0.007294433872660001, 0.5957491461495974, 0.0034158286180801718, 0.0, 0.0, -0.8160093786547183, 1.1515807293933271, -1.0982686162850888, -0.14217436522030538, -0.2142782521256309];
const ML_SCALER_MEANS = [4.979546286132464, 0.9707281375777533, 12.08233321136725, 1.4164371469816792, 0.4941102112609621, 74.08003049152346, 3.8851274545676304, 0.15453104037077692, 0.0, 0.0, 105.02214062690574, 407.79307269179185, 0.943632381677064, 0.7479950752842007, 6.116260323429428];
const ML_SCALER_SCALES = [7.020267037356046, 1.715463301117939, 78.96412771457267, 0.8126480027439398, 0.5318684592811325, 404.67016765278345, 27.061348879016073, 0.36145704853094546, 1.0, 1.0, 2496.7843126789944, 7216.529475774812, 1.465615474765435, 0.6412733464976822, 19.245374310411187];

function calculateRiseRate(water_level, precipitation) {
    const features = [
        water_level,
        precipitation,
        water_level * precipitation,
        Math.log1p(water_level),
        Math.log1p(precipitation),
        Math.pow(water_level, 2),
        Math.pow(precipitation, 2),
        precipitation === 0 ? 1 : 0,
        water_level === 0 ? 1 : 0,
        (precipitation === 0 && water_level === 0) ? 1 : 0,
        water_level * Math.pow(precipitation, 2),
        Math.pow(water_level, 2) * precipitation,
        Math.log1p(water_level) * Math.log1p(precipitation),
        Math.sqrt(precipitation),
        water_level * Math.sqrt(precipitation)
    ];

    let prediction = ML_INTERCEPT;
    for (let i = 0; i < features.length; i++) {
        const scaledValue = (features[i] - ML_SCALER_MEANS[i]) / ML_SCALER_SCALES[i];
        prediction += scaledValue * ML_COEFS[i];
    }

    if (prediction < 0) prediction = 0;

    const DEMO_DAMPENER = 0.05;
    prediction = prediction * DEMO_DAMPENER;

    return Math.round(prediction * 100) / 100; 
}

function showToast(message, type = 'success') {
    if (!document.getElementById('bahgo-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'bahgo-toast-styles';
        style.innerHTML = `
            .toast-container { position: fixed; bottom: 30px; right: 30px; z-index: 9999; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
            .custom-toast { background: #ffffff; color: #1f2937; padding: 16px 24px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); font-weight: 600; font-size: 0.95rem; border-left: 5px solid #3B82F6; transform: translateX(120%); opacity: 0; transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55); }
            .custom-toast.show { transform: translateX(0); opacity: 1; }
            .custom-toast.success { border-left-color: #22C55E; }
            .custom-toast.error { border-left-color: #EF4444; }
        `;
        document.head.appendChild(style);
    }

    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `custom-toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

function showDashboard() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('dashboardScreen').classList.add('active');
    switchPage('overview');
    loadStations();
}

function initBahgoApp() {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.onclick = async function() {
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPass').value;
            const emailErrorDiv = document.getElementById('emailError');
            const passwordErrorDiv = document.getElementById('passwordError');
            
            emailErrorDiv.style.display = 'none';
            passwordErrorDiv.style.display = 'none';
            
            if (!email) {
                emailErrorDiv.textContent = 'Please enter an email';
                emailErrorDiv.style.display = 'block';
                return;
            }
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                emailErrorDiv.textContent = 'Please enter a valid email address';
                emailErrorDiv.style.display = 'block';
                return;
            }
            
            if (!password) {
                passwordErrorDiv.textContent = 'Please enter a password';
                passwordErrorDiv.style.display = 'block';
                return;
            }
            
            try {
                loginBtn.disabled = true;
                loginBtn.textContent = 'Signing in...';
                await setPersistence(auth, browserSessionPersistence);
                await signInWithEmailAndPassword(auth, email, password);
            } catch (err) {
                passwordErrorDiv.textContent = err.message || 'Login failed.';
                passwordErrorDiv.style.display = 'block';
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Log in';
            }
        };
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = async function() {
            await signOut(auth);
            if (stationsUnsubscribe) stationsUnsubscribe();
            stationsUnsubscribe = null;
        };
    }

    document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
        btn.onclick = function() {
            switchPage(this.dataset.page);
        };
    });

    const closeModalBtn = document.getElementById('closeModal');
    if (closeModalBtn) {
        closeModalBtn.onclick = function() {
            document.getElementById('stationModal').classList.remove('active');
        };
    }

    const saveProfileBtn = document.getElementById('saveProfile');
    if (saveProfileBtn) {
        saveProfileBtn.onclick = async function() {
            const name = document.getElementById('settingsName').value;
            const email = document.getElementById('settingsEmail').value;
            
            const currentUser = auth.currentUser; 

            if (!currentUser) {
                showToast("You must be logged in to save a profile!", 'error');
                return;
            }

            try {
                await setDoc(doc(db, 'users', currentUser.uid), {
                    name: name,
                    email: email,
                    role: 'Developer',
                    updatedAt: new Date().toISOString()
                }, { merge: true });
                
                document.getElementById('userName').textContent = name;
                showToast('Profile saved!', 'success');
            } catch (err) {
                showToast('Could not save profile. Check your connection.', 'error');
            }
        };
    }

    const saveNotifBtn = document.getElementById('saveNotif');
    if (saveNotifBtn) {
        saveNotifBtn.onclick = async function() {
            const prefs = {
                crit: document.getElementById('crit').checked,
                email: document.getElementById('email').checked
            };
            
            const currentUser = auth.currentUser;
            if (!currentUser) {
                showToast("You must be logged in to save settings!", 'error');
                return;
            }

            try {
                await setDoc(doc(db, 'users', currentUser.uid), {
                    notifications: prefs
                }, { merge: true });
                
                showToast('Preferences synced to your account!', 'success');
            } catch (err) {
                console.warn('Firestore save failed:', err);
                showToast('Could not update cloud settings.', 'error');
            }
        };
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.oninput = function(e) {
            renderTable(e.target.value);
        };
    }

    if (!window.__bahgoBackgroundTasksStarted) {
        window.__bahgoBackgroundTasksStarted = true;

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                showDashboard();
                
                try {
                    const userDocRef = doc(db, 'users', user.uid);
                    const userDoc = await getDoc(userDocRef);
                    
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        document.getElementById('userName').textContent = data.name || user.email;
                        document.getElementById('settingsName').value = data.name || '';
                        document.getElementById('settingsEmail').value = data.email || user.email;
                        
                        if (data.notifications) {
                            document.getElementById('crit').checked = data.notifications.crit || false;
                            document.getElementById('email').checked = data.notifications.email || false;
                        }
                    } else {
                        document.getElementById('userName').textContent = "Admin";
                        document.getElementById('settingsName').value = "";
                        document.getElementById('settingsEmail').value = user.email; 
                        document.getElementById('crit').checked = false;
                        document.getElementById('email').checked = false;
                    }
                } catch (error) {}

            } else {
                document.getElementById('dashboardScreen').classList.remove('active');
                document.getElementById('loginScreen').classList.add('active');
                
                const loginEmail = document.getElementById('loginEmail');
                const loginPass = document.getElementById('loginPass');
                if (loginEmail) loginEmail.value = '';
                if (loginPass) loginPass.value = '';
            }
        });

        updateClock();
        setInterval(updateClock, 1000);
    }
}

window.initBahgoApp = initBahgoApp;

function switchPage(pageId) {
    document.querySelectorAll('.nav-btn[data-page]').forEach(btn => btn.classList.toggle('active', btn.dataset.page === pageId));
    document.querySelectorAll('.page-content').forEach(page => page.classList.toggle('active', page.id === pageId));
}

function updateCounts() {
    const critical = stations.filter(s => s.status === 'critical').length;
    const warning = stations.filter(s => s.status === 'warning').length;
    const normal = stations.filter(s => s.status === 'safe').length;
    const offline = stations.filter(s => s.status === 'offline').length;
    
    const active = stations.length - offline;

    const criticalCount = document.getElementById('criticalCount');
    const warningCount = document.getElementById('warningCount');
    const normalCount = document.getElementById('normalCount');
    const activeCount = document.getElementById('activeCount');
    const offlineCount = document.getElementById('offlineCount');

    if(criticalCount) criticalCount.textContent = critical;
    if(warningCount) warningCount.textContent = warning;
    if(normalCount) normalCount.textContent = normal;
    if(activeCount) activeCount.textContent = active;
    if(offlineCount) offlineCount.textContent = offline;
}

function renderStations() {
    const grid = document.getElementById('stationGrid');
    if (!grid) return;
    grid.innerHTML = stations.map(s => `
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

function renderTable(filter = '') {
    const tbody = document.getElementById('stationTableBody');
    if (!tbody) return;
    const filtered = stations.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));
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

window.openStationModal = async function(id) {
    const s = stations.find(st => st.id === id);
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

    if (stationChart) stationChart.destroy();
    
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
        
        while(recent.length < 6) {
            recent.unshift(recent.length > 0 ? recent[0] : s.level);
        }
        historyLevels = recent;
    } catch(e) {
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

    stationChart = new window.Chart(ctx, {
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

function updateClock() {
    const now = new Date();
    const dateOptions = { month: 'long', day: 'numeric', year: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    const currentDateEl = document.getElementById('currentDate');
    const currentTimeEl = document.getElementById('currentTime');
    
    if (currentDateEl) currentDateEl.innerText = now.toLocaleDateString('en-US', dateOptions);
    if (currentTimeEl) currentTimeEl.innerText = now.toLocaleTimeString('en-US', timeOptions).toLowerCase();
}

function loadStations() {
    if (stationsUnsubscribe) {
        stationsUnsubscribe();
    }

    const stationsRef = ref(rtdb, '/');
    stationsUnsubscribe = onValue(stationsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            stations = Object.entries(data).filter(([key, s]) => key.toLowerCase().includes('sensor')).map(([key, s]) => {
                const distanceCm = s.Distance_cm ?? 0;
                const rawRain = s.Rain_Value ?? 4095;
                
                const rainRatio = (4095 - rawRain) / 4095;
                let precip = Math.pow(rainRatio, 2) * 15;
                precip = Math.round(precip * 10) / 10;
                
                const SENSOR_MOUNT_HEIGHT_CM = 7.62;
                let actualWaterLevelCm = SENSOR_MOUNT_HEIGHT_CM - distanceCm;
                
                if (actualWaterLevelCm < 0) actualWaterLevelCm = 0;

                const rate = calculateRiseRate(actualWaterLevelCm, precip);

                const existingStation = stations.find(old => old.id === key);
                const finalTimestamp = s.Last_Updated || (existingStation ? existingStation.timestamp : new Date().toISOString());

                const now = new Date().getTime();
                const lastUpdateMs = new Date(finalTimestamp).getTime();
                const secondsSinceUpdate = (now - lastUpdateMs) / 1000;

                let status = 'safe';
                if (secondsSinceUpdate > 5) {
                    status = 'offline';
                } else if (actualWaterLevelCm >= 4.8 || precip >= 10) {
                    status = 'critical';    
                } else if (actualWaterLevelCm >= 3.5 || precip >= 5) {
                    status = 'warning';
                }

                const customNames = {
                    'sensordata1': 'Sealion Street',
                    'sensordata2': 'Centurion Street',
                    'sensordata3': 'Swingfire Street'
                };
                
                const normalizedKey = key.toLowerCase();
                const displayName = customNames[normalizedKey] || key;

                return {
                    id: key,
                    name: displayName,
                    level: Math.round(actualWaterLevelCm * 100) / 100, 
                    precip: precip,
                    rate: rate,
                    status: status,
                    timestamp: finalTimestamp
                };
            });
            renderStations();
            renderTable();
            updateCounts();
        }
    });
}