import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { showToast } from './notifications';
import { esc } from './escape';

export async function loadAdminUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;
    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        let rows = '';
        usersSnap.forEach(docSnap => {
            const u = docSnap.data();
            let lastLoginDisplay = 'Never';
            if (u.lastLogin) lastLoginDisplay = new Date(u.lastLogin).toLocaleString();
            else if (u.createdAt) lastLoginDisplay = new Date(u.createdAt).toLocaleString() + ' (created)';
            if (u.role === 'Super User') {
                rows += `<tr><td>${esc(u.email)}</td><td><span class='status-badge critical'>Super User</span></td><td>${esc(lastLoginDisplay)}</td><td>Active</td><td><span style='color:#888'>Protected</span></td></tr>`;
            } else {
                rows += `<tr><td>${esc(u.email)}</td><td><span class='status-badge safe'>Admin</span></td><td>${esc(lastLoginDisplay)}</td><td>Active</td><td><button data-action='delete-admin' data-uid='${esc(docSnap.id)}' data-email='${esc(u.email)}' style='background:#EF4444;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer'>Delete</button></td></tr>`;
            }
        });
        tbody.innerHTML = rows || `<tr><td colspan='5' style='text-align:center;color:#888'>No users yet</td></tr>`;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan='5' style='color:#EF4444'>Error loading users: ${esc(err.message)}</td></tr>`;
    }
}

export async function deleteAdminUser(uid, email) {
    if (!window.confirm('Delete admin ' + email + '? Their account is removed and they can no longer log in.')) return;
    try {
        await httpsCallable(functions, 'removeAdmin')({ uid });
        showToast('Admin ' + email + ' removed.', 'success');
        loadAdminUsers();
    } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
    }
}

export function initSuperUsers() {
    const addAdminBtn = document.getElementById('addAdminBtn');
    if (!addAdminBtn) return;
    addAdminBtn.onclick = async function () {
        const email = document.getElementById('newAdminEmail')?.value.trim();
        const tempPass = document.getElementById('newAdminTempPass')?.value.trim();
        const errorDiv = document.getElementById('addAdminError');
        const fail = (msg) => { if (errorDiv) { errorDiv.textContent = msg; errorDiv.style.display = 'block'; } };
        if (errorDiv) errorDiv.style.display = 'none';
        if (!email || !tempPass) return fail('Email and temp password required');
        if (tempPass.length < 8) return fail('Temp password must be at least 8 characters');
        try {
            addAdminBtn.disabled = true;
            addAdminBtn.textContent = 'Adding...';
            await httpsCallable(functions, 'createAdmin')({ email, tempPassword: tempPass });
            const emailInput = document.getElementById('newAdminEmail');
            const passInput = document.getElementById('newAdminTempPass');
            if (emailInput) emailInput.value = '';
            if (passInput) passInput.value = '';
            showToast('Admin ' + email + ' added!', 'success');
            loadAdminUsers();
        } catch (err) {
            fail(err.message);
        } finally {
            addAdminBtn.disabled = false;
            addAdminBtn.textContent = 'Add Admin';
        }
    };
}