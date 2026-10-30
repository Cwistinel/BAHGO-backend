import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const merge = (uid, data) => setDoc(doc(db, 'users', uid), data, { merge: true });

export const saveUserProfile = (uid, { name }) => merge(uid, { name, updatedAt: new Date().toISOString() });
export const saveUserPhoto = (uid, photoData) => merge(uid, { photoURL: photoData || '', updatedAt: new Date().toISOString() });