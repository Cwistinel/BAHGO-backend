import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Returns the user's profile doc data, or null if it doesn't exist yet.
export async function loadUserProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
}

export async function saveUserProfile(uid, { name, email }) {
    await setDoc(doc(db, 'users', uid), {
        name,
        email,
        role: 'Developer',
        updatedAt: new Date().toISOString()
    }, { merge: true });
}

export async function saveNotificationPrefs(uid, prefs) {
    await setDoc(doc(db, 'users', uid), { notifications: prefs }, { merge: true });
}
