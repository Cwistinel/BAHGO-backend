import { auth } from '../firebase';
import { state } from '../state';
import { login, logout, watchAuthState } from './auth';
import { loadUserProfile, saveUserProfile, saveNotificationPrefs } from './settings';
import { showToast } from './notifications';
import { updateClock } from './clock';
import { switchPage, showDashboard } from './navigation';
import { renderTable } from './stationsRender';

export function initBahgoApp() {
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
                await login(email, password);
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
            await logout();
            if (state.stationsUnsubscribe) state.stationsUnsubscribe();
            state.stationsUnsubscribe = null;
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
                await saveUserProfile(currentUser.uid, { name, email });
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
                await saveNotificationPrefs(currentUser.uid, prefs);
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

        watchAuthState(async (user) => {
            if (user) {
                showDashboard();

                try {
                    const data = await loadUserProfile(user.uid);

                    if (data) {
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
