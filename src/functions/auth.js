import { signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { auth } from '../firebase';

// Signs a user in with session-only persistence (cleared when the tab closes).
// Throws on failure so callers can show their own error UI.
export async function login(email, password) {
    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
    await signOut(auth);
}

// Subscribes to auth state changes. Returns the unsubscribe function.
export function watchAuthState(callback) {
    return onAuthStateChanged(auth, callback);
}
