import './actions';
import { auth } from '../firebase';
import { state } from '../state';
import { login, logout, watchAuthState } from './auth';
import { saveUserProfile } from './settings';
import { showToast } from './notifications';
import { updateClock } from './clock';
import { switchPage, switchSuperPage, showDashboard, showSuperDashboard } from './navigation';
import { renderTable } from './stationsRender';
import { loadAdminUsers, initSuperUsers } from './superUsers';
import { doc, getDoc, getDocFromServer, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { signOut, updatePassword } from 'firebase/auth';
import { friendlyAuthError } from './authMessages';
import { initAvatar, applyAvatar } from './avatar';

/**
 * Reads the logged-in user's profile from the server, so the name and photo are the saved ones.
 * Right after a page load Firestore may not be connected yet, so it retries for about 10 seconds.
 * If the server still can't be reached it throws ("Could not verify your account"); it never
 * reports "deleted" from an empty local copy.
 */
async function readProfile(ref) {
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            return await getDocFromServer(ref);
        } catch (err) {
            if (err.code !== 'unavailable') throw err;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    const snap = await getDoc(ref);
    if (!snap.exists() && snap.metadata.fromCache) throw new Error('Could not reach the server to check the account.');
    return snap;
}

export function initBahgoApp() {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.onclick = async function(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPass').value;
            const emailErrorDiv = document.getElementById('emailError');
            const passwordErrorDiv = document.getElementById('passwordError');
            emailErrorDiv.style.display = 'none'; passwordErrorDiv.style.display = 'none';
            if (!email) { emailErrorDiv.textContent = 'Please enter an email'; emailErrorDiv.style.display = 'block'; return; }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) { emailErrorDiv.textContent = 'Please enter a valid email address'; emailErrorDiv.style.display = 'block'; return; }
            if (!password) { passwordErrorDiv.textContent = 'Please enter a password'; passwordErrorDiv.style.display = 'block'; return; }
            try { loginBtn.disabled = true; loginBtn.textContent = 'Signing in...'; await login(email, password); }
            catch (err) { passwordErrorDiv.textContent = friendlyAuthError(err, 'Login failed. Please try again.'); passwordErrorDiv.style.display = 'block'; }
            finally { loginBtn.disabled = false; loginBtn.textContent = 'Log in'; }
        };
    }

    // Show / hide password fields. Assigned with onclick (not addEventListener) so running this
    // setup twice, as React does in development, can't attach two handlers that cancel each other out.
    document.querySelectorAll('[data-show-pass]').forEach(btn => {
        btn.onclick = () => {
            const input = document.getElementById(btn.dataset.showPass);
            if (!input) return;
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.textContent = show ? 'Hide' : 'Show';
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        };
    });

    const setNewPassBtn = document.getElementById('setNewPassBtn');
    if (setNewPassBtn) {
        setNewPassBtn.onclick = async function() {
            const newPassInput = document.getElementById('newPass1');
            const confirmPassInput = document.getElementById('newPass2');
            const errorDiv = document.getElementById('newPassError');
            const newPassword = newPassInput?.value || '';
            const confirmPassword = confirmPassInput?.value || '';
            if (errorDiv) errorDiv.style.display = 'none';

            if (newPassword.length < 8) {
                if (errorDiv) {
                    errorDiv.textContent = 'Password must be at least 8 characters.';
                    errorDiv.style.display = 'block';
                }
                return;
            }
            if (newPassword !== confirmPassword) {
                if (errorDiv) {
                    errorDiv.textContent = 'Passwords do not match.';
                    errorDiv.style.display = 'block';
                }
                return;
            }

            const currentUser = auth.currentUser;
            if (!currentUser) {
                if (errorDiv) {
                    errorDiv.textContent = 'Your session expired. Please log in again.';
                    errorDiv.style.display = 'block';
                }
                return;
            }

            try {
                setNewPassBtn.disabled = true;
                setNewPassBtn.textContent = 'Saving...';
                await updatePassword(currentUser, newPassword);
                await updateDoc(doc(db, 'users', currentUser.uid), {
                    isFirstLogin: false,
                    passwordUpdatedAt: new Date().toISOString()
                });
                document.getElementById('firstLoginModal')?.classList.remove('active');
                showToast('Password updated. Please log in with your new password.', 'success');
                await signOut(auth);
            } catch (err) {
                if (errorDiv) {
                    errorDiv.textContent = friendlyAuthError(err, 'Could not update password. Please try again.');
                    errorDiv.style.display = 'block';
                }
            } finally {
                setNewPassBtn.disabled = false;
                setNewPassBtn.textContent = 'Set New Password & Continue';
            }
        };
    }

    const closeFirstLoginModalBtn = document.getElementById('closeFirstLoginModal');
    if (closeFirstLoginModalBtn) {
        closeFirstLoginModalBtn.onclick = async function() {
            try {
                await signOut(auth);
                document.getElementById('firstLoginModal')?.classList.remove('active');
                const newPassInput = document.getElementById('newPass1');
                const confirmPassInput = document.getElementById('newPass2');
                if (newPassInput) newPassInput.value = '';
                if (confirmPassInput) confirmPassInput.value = '';
            } catch (err) {
                showToast(friendlyAuthError(err, 'Could not return to login. Please reload the page.'), 'error');
            }
        };
    }

    ['logoutBtn', 'superLogoutBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = async () => { await logout(); state.stationsUnsubscribe?.(); state.stationsUnsubscribe = null; };
    });

    document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
        btn.onclick = function() {
            const page = this.dataset.page;
            if (page.startsWith('super')) { switchSuperPage(page); if (page === 'superUsers') loadAdminUsers(); }
            else { switchPage(page); }
        };
    });

    const saveProfileBtn = document.getElementById('saveProfile');
    if (saveProfileBtn) {
        saveProfileBtn.onclick = async function() {
            const name = document.getElementById('settingsName').value.trim();
            const currentUser = auth.currentUser;
            if (!currentUser) { showToast("You must be logged in!", 'error'); return; }
            if (!name) { showToast("Display name cannot be empty!", 'error'); return; }
            try { await saveUserProfile(currentUser.uid, { name }); document.getElementById('userName').textContent = name; showToast('Name saved.', 'success'); }
            catch (err) { showToast(friendlyAuthError(err, 'Could not save. Please try again.'), 'error'); }
        };
    }
    const saveSuperProfileBtn = document.getElementById('saveSuperProfile');
    if (saveSuperProfileBtn) {
        saveSuperProfileBtn.onclick = async function() {
            const name = document.getElementById('superSettingsName')?.value.trim();
            const currentUser = auth.currentUser;
            if (!currentUser) { showToast("You must be logged in!", 'error'); return; }
            if (!name) { showToast("Display name cannot be empty!", 'error'); return; }
            try { await saveUserProfile(currentUser.uid, { name }); const superNameEl = document.getElementById('superUserName'); if (superNameEl) superNameEl.textContent = name; document.getElementById('userName').textContent = name; showToast('Name saved.', 'success'); }
            catch (err) { showToast(friendlyAuthError(err, 'Could not save. Please try again.'), 'error'); }
        };
    }

    initAvatar();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) { searchInput.oninput = function(e) { renderTable(e.target.value); }; }
    const superSearchInput = document.getElementById('superSearchInput');
    if (superSearchInput) { superSearchInput.oninput = function(e) { renderTable(e.target.value); }; }

    if (!window.__bahgoBackgroundTasksStarted) {
        window.__bahgoBackgroundTasksStarted = true;
        watchAuthState(async (user) => {
            if (user) {
                let isSuper = false;
            try {
            const tokenResult = await user.getIdTokenResult(true);
            isSuper = tokenResult.claims.role === 'super';
            } catch (e) {
            isSuper = false;
            }
               
                let userDocSnap;
                try {
                    userDocSnap = await readProfile(doc(db, 'users', user.uid));
                    if (!userDocSnap.exists()) {
                        await signOut(auth);
                        document.getElementById('dashboardScreen')?.classList.remove('active');
                        document.getElementById('superUserScreen')?.classList.remove('active');
                        document.getElementById('loginScreen')?.classList.add('active');
                        const passwordErrorDiv = document.getElementById('passwordError');
                        if (passwordErrorDiv) { passwordErrorDiv.textContent = 'Account not found - it was deleted. Contact admin.'; passwordErrorDiv.style.display = 'block'; }
                        showToast('Account deleted - cannot login.', 'error');
                        return;
                    }
                    if (userDocSnap.data()?.isFirstLogin === true) {
                        document.getElementById('loginScreen')?.classList.add('active');
                        document.getElementById('dashboardScreen')?.classList.remove('active');
                        document.getElementById('superUserScreen')?.classList.remove('active');
                        document.getElementById('firstLoginModal')?.classList.add('active');
                        return;
                    }
                } catch (e) {
                    console.warn('Block check error', e);
                    await signOut(auth);
                    document.getElementById('dashboardScreen')?.classList.remove('active');
                    document.getElementById('superUserScreen')?.classList.remove('active');
                    document.getElementById('loginScreen')?.classList.add('active');
                    showToast('Could not verify your account. Please try again or contact admin.', 'error');
                     return;
                }
                try {
                    const data = userDocSnap.data();
                    applyAvatar(data ? data.photoURL : '');
                    if (data) {
                        document.getElementById('userName').textContent = data.name || user.email;
                        const superNameEl = document.getElementById('superUserName'); if (superNameEl) superNameEl.textContent = data.name || user.email;
                        const settingsName = document.getElementById('settingsName'); const settingsEmail = document.getElementById('settingsEmail');
                        if (settingsName) settingsName.value = data.name || ''; if (settingsEmail) settingsEmail.textContent = user.email;
                        const superSettingsName = document.getElementById('superSettingsName'); const superSettingsEmail = document.getElementById('superSettingsEmail');
                        if (superSettingsName) superSettingsName.value = data.name || ''; if (superSettingsEmail) superSettingsEmail.textContent = user.email;
                    }
                    if (isSuper) { showSuperDashboard(); initSuperUsers(); loadAdminUsers(); } else { showDashboard(); }
                } catch (error) { if (isSuper) { showSuperDashboard(); initSuperUsers(); loadAdminUsers(); } else { showDashboard(); } }
            } else {
                document.getElementById('dashboardScreen')?.classList.remove('active');
                document.getElementById('superUserScreen')?.classList.remove('active');
                document.getElementById('loginScreen')?.classList.add('active');
                applyAvatar(''); state.stationsUnsubscribe?.(); state.stationsUnsubscribe = null;
                const loginEmail = document.getElementById('loginEmail'); const loginPass = document.getElementById('loginPass');
                if (loginEmail) loginEmail.value = ''; if (loginPass) loginPass.value = '';
            }
        });
        updateClock(); setInterval(updateClock, 1000);
    }
}