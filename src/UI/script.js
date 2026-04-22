import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';
let authToken = localStorage.getItem('bahgoAuthToken') || null;

async function apiRequest(path, options = {}) {
    const headers = {
        ...(options.headers || {})
    };

    if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
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

function normalizeStation(s, idx) {
    return {
        id: s.id ?? s._id ?? idx + 1,
        name: s.name ?? s.stationName ?? `Station ${idx + 1}`,
        level: s.level ?? s.waterLevel ?? 0,
        precip: s.precip ?? s.precipitation ?? 0,
        rate: s.rate ?? s.riseRate ?? 0,
        status: (s.status || 'safe').toLowerCase(),
        timestamp: s.timestamp ?? s.updatedAt ?? new Date().toISOString()
    };
}


async function apiGetStations() {
    const payload = await apiRequest('/stations');
    const raw = Array.isArray(payload) ? payload : (payload.stations || []);
    return raw.map(normalizeStation);
}

async function apiGetHistory(id) {
    const payload = await apiRequest(`/stations/${id}/history`);
    const source = payload.history || payload.data || payload.points || [];
    const history = Array.isArray(source)
        ? source.map((item, idx) => (typeof item === 'number' ? item : (item.level ?? item.value ?? idx)))
        : [];
    return { history };
}


async function apiUpdateNotificationSettings(prefs) {
    return apiRequest('/users/me/notifications', {
        method: 'PUT',
        body: JSON.stringify(prefs)
    });
}
let stations = [];
let stationChart = null;
let currentUserEmail = null;

function initBahgoApp() {
    if (window.__bahgoInitialized) return;
    window.__bahgoInitialized = true;
    console.log('DOM loaded');
    
    document.getElementById('loginBtn').addEventListener('click', async function() {
        console.log('Login clicked');
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
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = { email: userCredential.user.email, name: 'Admin' };
            authToken = await userCredential.user.getIdToken();
            localStorage.setItem('bahgoAuthToken', authToken);
            // Successful login
            currentUserEmail = user.email;
            document.getElementById('loginScreen').classList.remove('active');
            document.getElementById('dashboardScreen').classList.add('active');
            switchPage('overview');
            await loadStations();
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
        currentUserEmail = null;
        authToken = null;
        localStorage.removeItem('bahgoAuthToken');
        document.getElementById('dashboardScreen').classList.remove('active');
        document.getElementById('loginScreen').classList.add('active');
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPass').value = '';
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
            if (email !== currentUserEmail) currentUserEmail = email;
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

    if (localStorage.getItem('bahgoEmail')) {
        document.getElementById('loginEmail').value = localStorage.getItem('bahgoEmail');
        document.getElementById('rem').checked = true;
    }
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
            document.getElementById('loginScreen').classList.remove('active');
            document.getElementById('dashboardScreen').classList.add('active');
            switchPage('overview');
            loadStations();
        } else {
            document.getElementById('dashboardScreen').classList.remove('active');
            document.getElementById('loginScreen').classList.add('active');
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
    document.getElementById('criticalCount').textContent = stations.filter(s => s.status === 'critical').length;
    document.getElementById('warningCount').textContent = stations.filter(s => s.status === 'warning').length;
    document.getElementById('normalCount').textContent = stations.filter(s => s.status === 'safe').length;
    document.getElementById('activeCount').textContent = stations.length;
    document.getElementById('offlineCount').textContent = 0;
}

function renderStations() {
    const grid = document.getElementById('stationGrid');
    grid.innerHTML = stations.map(s => `
        <div class="station-card" onclick="openStationModal(${s.id})">
            <div class="s-header">
                <div>
                    <h3>${s.name}</h3>
                    <p style="font-size: 0.75rem; color: #888;">${new Date(s.timestamp).toLocaleString()}</p>
                </div>
                <span class="dot ${s.status === 'safe' ? 'green' : s.status === 'warning' ? 'yellow' : 'red'}"></span>
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
        <tr onclick="openStationModal(${s.id})">
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
    
    const { history } = await apiGetHistory(id);
    
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
                borderColor: s.status === 'critical' ? '#EF4444' : s.status === 'warning' ? '#F59E0B' : '#22C55E',
                backgroundColor: s.status === 'critical' ? 'rgba(239, 68, 68, 0.1)' : s.status === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)',
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

async function loadStations() {
    try {
        stations = await apiGetStations();
        renderStations();
        renderTable();
        updateCounts();
    } catch (err) {
        console.warn('Backend not available:', err.message);
        renderStations();
        renderTable();
        updateCounts();
    }
}