import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export async function loadUserProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
}

export async function saveUserProfile(uid, { name }) {
    await setDoc(doc(db, 'users', uid), {
        name,
        updatedAt: new Date().toISOString()
    }, { merge: true });
}

export async function saveUserPhoto(uid, photoData) {
    await setDoc(doc(db, 'users', uid), {
        photoURL: photoData || '',
        updatedAt: new Date().toISOString()
    }, { merge: true });
}

export async function saveNotificationPrefs(uid, prefs) {
    await setDoc(doc(db, 'users', uid), { notifications: prefs }, { merge: true });
}