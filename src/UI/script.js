import { signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { auth, db, rtdb } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';
let stationsUnsubscribe = null;

async function apiRequest(path, options = {}) {
    const headers = {
        ...(options.headers || {})
    };

    if (auth.currentUser) {
        const freshToken = await auth.currentUser.getIdToken();
        headers.Authorization = `Bearer ${freshToken}`;
    }

    if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
    }
    return res.json();
}

async function apiUpdateNotificationSettings(prefs) {
    return apiRequest('/users/me/notifications', {
        method: 'PUT',
        body: JSON.stringify(prefs)
    });
}

let stations = [];
let stationChart = null;

function showDashboard() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('dashboardScreen').classList.add('active');
    switchPage('overview');
    loadStations();
}

function initBahgoApp() {
    if (window.__bahgoInitialized) return;
    window.__bahgoInitialized = true;
    
    document.getElementById('loginBtn').addEventListener('click', async function() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPass').value;
        const loginBtn = document.getElementById('loginBtn');
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
    });

    document.getElementById('logoutBtn').addEventListener('click', async function() {
        await signOut(auth);
        if (stationsUnsubscribe) stationsUnsubscribe();
        stationsUnsubscribe = null;
    });

    document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', function() {
            switchPage(this.dataset.page);
        });
    });

    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('stationModal').classList.remove('active');
    });

    document.getElementById('saveProfile').addEventListener('click', async function() {
        const name = document.getElementById('settingsName').value;
        const email = document.getElementById('settingsEmail').value;
        try {
            await setDoc(doc(db, 'users', 'admin'), {
                name: name,
                email: email,
                role: 'Developer',
                updatedAt: new Date().toISOString()
            });
            localStorage.setItem('bahgoUserName', name);
            localStorage.setItem('bahgoUserEmail', email);
            document.getElementById('userName').textContent = name;
            alert('Profile saved!');
        } catch (err) {
            alert(`Could not save profile: ${err.message}`);
        }
    });

    document.getElementById('saveNotif').addEventListener('click', async function() {
        const prefs = {
            crit: document.getElementById('crit').checked,
            warn: document.getElementById('warn').checked,
            email: document.getElementById('email').checked
        };
        try {
            await apiUpdateNotificationSettings(prefs);
        } catch (err) {
            console.warn('Notification endpoint unavailable or failed:', err);
            alert(`Could not update backend notification settings: ${err.message}`);
            return;
        }
        localStorage.setItem('bahgoNotif', JSON.stringify(prefs));
        alert('Preferences updated!');
    });

    document.getElementById('searchInput').addEventListener('input', function(e) {
        renderTable(e.target.value);
    });

    if (localStorage.getItem('bahgoUserName')) {
        document.getElementById('userName').textContent = localStorage.getItem('bahgoUserName');
        document.getElementById('settingsName').value = localStorage.getItem('bahgoUserName');
    }
    if (localStorage.getItem('bahgoUserEmail')) {
        document.getElementById('settingsEmail').value = localStorage.getItem('bahgoUserEmail');
    }
    if (localStorage.getItem('bahgoNotif')) {
        const prefs = JSON.parse(localStorage.getItem('bahgoNotif'));
        document.getElementById('crit').checked = prefs.crit;
        document.getElementById('warn').checked = prefs.warn;
        document.getElementById('email').checked = prefs.email;
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            showDashboard();
        } else {
            document.getElementById('dashboardScreen').classList.remove('active');
            document.getElementById('loginScreen').classList.add('active');
            
            document.getElementById('loginEmail').value = '';
            document.getElementById('loginPass').value = '';
        }
    });

    updateClock();
    setInterval(updateClock, 1000);
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

    document.getElementById('criticalCount').textContent = critical;
    document.getElementById('warningCount').textContent = warning;
    document.getElementById('normalCount').textContent = normal;
    document.getElementById('activeCount').textContent = active;
    document.getElementById('offlineCount').textContent = offline;
}

function renderStations() {
    const grid = document.getElementById('stationGrid');
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

window.openStationModal = function(id) {
    const s = stations.find(st => st.id === id);
    document.getElementById('modalTitle').textContent = s.name;
    document.getElementById('modalBody').innerHTML = `
        <div class="s-stats">
            <div class="s-row"><span>Current Water Level:</span><span class="val">${s.level} cm</span></div>
            <div class="s-row"><span>Precipitation:</span><span class="val">${s.precip} mm/hr</span></div>
            <div class="s-row"><span>Rise Rate:</span><span class="val">${s.rate} cm/hr</span></div>
            <div class="s-row"><span>Status:</span><span class="val">${s.status.toUpperCase()}</span></div>
            <div class="s-row"><span>Last Updated:</span><span class="val">${new Date(s.timestamp).toLocaleString()}</span></div>
        </div>
        <p style="margin-top: 20px; font-weight: 600; color: var(--text-muted);">24-Hour Water Level Trend</p>
    `;
    
    document.getElementById('stationModal').classList.add('active');
    
    const history = [0, 0, 0, 0, 0, 0, 0, 0];
    
    if (stationChart) stationChart.destroy();
    
    const ctx = document.getElementById('stationChart').getContext('2d');
    const hours = ['12am', '3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm'];
    stationChart = new window.Chart(ctx, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [{
                label: 'Water Level (cm)',
                data: history,
                borderColor: s.status === 'critical' ? '#EF4444' : s.status === 'warning' ? '#F59E0B' : s.status === 'offline' ? '#9CA3AF' : '#22C55E',
                backgroundColor: s.status === 'critical' ? 'rgba(239, 68, 68, 0.1)' : s.status === 'warning' ? 'rgba(245, 158, 11, 0.1)' : s.status === 'offline' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#fff',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f0f0f0' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function updateClock() {
    const now = new Date();
    const dateOptions = { month: 'long', day: 'numeric', year: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    document.getElementById('currentDate').innerText = now.toLocaleDateString('en-US', dateOptions);
    document.getElementById('currentTime').innerText = now.toLocaleTimeString('en-US', timeOptions).toLowerCase();
}

function loadStations() {
    if (stationsUnsubscribe) {
        stationsUnsubscribe();
    }

    const stationsRef = ref(rtdb, '/');
    stationsUnsubscribe = onValue(stationsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            stations = Object.entries(data).map(([key, s]) => {
                const level = s.Distance_cm ?? 0;
                const rawRain = s.Rain_Value ?? 4095;
                const precip = Math.round(((4095 - rawRain) / 4095) * 50);
                const rate = 0;

                const existingStation = stations.find(old => old.id === key);
                const finalTimestamp = s.Last_Updated || (existingStation ? existingStation.timestamp : new Date().toISOString());

                const now = new Date().getTime();
                const lastUpdateMs = new Date(finalTimestamp).getTime();
                const minutesSinceUpdate = (now - lastUpdateMs) / (1000 * 60);

                let status = 'safe';
                if (minutesSinceUpdate > 5) {
                    status = 'offline';
                } else if (level > 200 || precip > 30) {
                    status = 'critical';
                } else if (level > 100 || precip > 15) {
                    status = 'warning';
                }

                return {
                    id: key,
                    name: key,
                    level: level,
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