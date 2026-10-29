import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const merge = (uid, data) => setDoc(doc(db, 'users', uid), data, { merge: true });

export async function loadUserProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
}

export const saveUserProfile = (uid, { name }) => merge(uid, { name, updatedAt: new Date().toISOString() });
export const saveUserPhoto = (uid, photoData) => merge(uid, { photoURL: photoData || '', updatedAt: new Date().toISOString() });