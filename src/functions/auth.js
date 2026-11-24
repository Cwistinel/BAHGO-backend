import { signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export async function login(email, password) {
    await setPersistence(auth, browserSessionPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    if (userCredential?.user?.uid) {
        try {
            // updateDoc (not setDoc with merge): it never creates a partial copy of the profile in the
            // browser, which the dashboard could otherwise read as "no name, no photo" right after login.
            await updateDoc(doc(db, 'users', userCredential.user.uid), {
                lastLogin: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.warn('Failed to update user last login:', error);
        }
    }

    return userCredential;
}

export async function logout() {
    await signOut(auth);
}

export function watchAuthState(callback) {
    return onAuthStateChanged(auth, callback);
}