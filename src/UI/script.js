import { signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { auth, db, rtdb } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
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

let stations = [];
let stationChart = null;

function showToast(message, type = 'success') {
    console.log("Toast Triggered:", message);

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
                } catch (error) {
                    console.error("Error loading profile from database:", error);
                }

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
    
    const canvas = document.getElementById('stationChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
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