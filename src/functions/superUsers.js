import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getAuth, signOut } from 'firebase/auth';
import { db, firebaseConfig } from '../firebase';
import { showToast } from './notifications';

export const SUPER_USERS = [
    'kaye.01012@gmail.com',
    'lollypopcurrent@gmail.com',
    'sopiasargado@gmail.com',
    'itsnana.hanna@gmail.com'
];

export async function loadAdminUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;
    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        let rows = '';
        usersSnap.forEach(docSnap => {
            const u = docSnap.data();
            const isSuperTeam = SUPER_USERS.includes(u.email) || u.role === 'Super User' || u.role === 'Developer';
            let lastLoginDisplay = 'Never';
            if (u.lastLogin) lastLoginDisplay = new Date(u.lastLogin).toLocaleString();
            else if (u.createdAt) lastLoginDisplay = new Date(u.createdAt).toLocaleString() + ' (created)';
            if (isSuperTeam) {
                rows += `<tr><td>${u.email}</td><td><span class="status-badge critical">Developer</span></td><td>${lastLoginDisplay}</td><td>Active</td><td><span style="color:#888">Protected</span></td></tr>`;
            } else {
                rows += `<tr><td>${u.email}</td><td><span class="status-badge safe">Admin</span></td><td>${lastLoginDisplay}</td><td>Active</td><td><button onclick="window.deleteAdminUser('${docSnap.id}', '${u.email}')" style="background:#EF4444;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer">Delete</button></td></tr>`;
            }
        });
        tbody.innerHTML = rows || `<tr><td colspan="5" style="text-align:center;color:#888">No users yet</td></tr>`;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:#EF4444">Error loading users: ${err.message}</td></tr>`;
    }
}


export async function deleteAdminUser(docId, email) {
    if (SUPER_USERS.map(e=>e.toLowerCase()).includes(email.toLowerCase())) {
        showToast('Cannot delete protected super user!', 'error'); return;
    }
    if (!window.confirm(`Delete admin ${email}? This will immediately block them.`)) return;
    try {
        await deleteDoc(doc(db, 'users', docId));
        await setDoc(doc(db, 'blocked_users', docId), {
            email: email,
            blockedAt: new Date().toISOString(),
            blockedBy: 'super_admin',
            reason: 'Deleted from User Management - cannot login again'
        }, { merge: true });
        await setDoc(doc(db, 'blocked_users', email.toLowerCase()), { 
            email: email, blockedAt: new Date().toISOString(), blockedBy: 'super_admin', reason: 'Deleted from User Management - cannot login again' }, { merge: true });
        showToast(`Admin ${email} deleted and BLOCKED! Firestore: users deleted + blocked_users added. Now also delete in Firebase Console > Authentication.`, 'success');
        loadAdminUsers();
    } catch (err) {
        showToast(`Delete failed: ${err.message}`, 'error');
    }
}

export function initSuperUsers() {
    window.deleteAdminUser = deleteAdminUser;
    const addAdminBtn = document.getElementById('addAdminBtn');
    if (addAdminBtn) {
        addAdminBtn.onclick = async function() {
            const email = document.getElementById('newAdminEmail')?.value.trim();
            const tempPass = document.getElementById('newAdminTempPass')?.value.trim();
            const errorDiv = document.getElementById('addAdminError');
            if (errorDiv) errorDiv.style.display = 'none';
            if (!email || !tempPass) { if (errorDiv) { errorDiv.textContent = 'Email and temp password required'; errorDiv.style.display = 'block'; } return; }
            if (tempPass.length < 6) { if (errorDiv) { errorDiv.textContent = 'Temp password must be at least 6 chars'; errorDiv.style.display = 'block'; } return; }
            try {
                addAdminBtn.disabled = true; addAdminBtn.textContent = 'Adding...';
                const secondaryApp = initializeApp(firebaseConfig, "Secondary-" + Date.now());
                const secondaryAuth = getAuth(secondaryApp);
                let userCred;
                try { userCred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPass); }
                catch (createErr) {
                    if (createErr.code === 'auth/email-already-in-use') throw new Error(`Email ${email} already exists in Authentication. Delete in Firebase Console > Authentication first.`);
                    else throw createErr;
                }
                const newUid = userCred.user.uid;
                await setDoc(doc(db, 'users', newUid), { email, role: 'Admin', name: email.split('@')[0], isFirstLogin: true, lastLogin: null, createdAt: new Date().toISOString(), createdBy: 'super' }, { merge: true });
                await signOut(secondaryAuth);
                const emailInput = document.getElementById('newAdminEmail'); const passInput = document.getElementById('newAdminTempPass');
                if (emailInput) emailInput.value = ''; if (passInput) passInput.value = '';
                showToast(`Admin ${email} added!`, 'success'); loadAdminUsers();
            } catch (err) { if (errorDiv) { errorDiv.textContent = err.message; errorDiv.style.display = 'block'; } }
            finally { addAdminBtn.disabled = false; addAdminBtn.textContent = 'Add Admin'; }
        };
    }
}
