// Plain-language messages for Firebase Auth errors, instead of raw "Firebase: Error (auth/...)" text.
const MESSAGES = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled. Contact the Super User.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'No internet connection. Check your connection and try again.',
    'auth/weak-password': 'Password is too weak. Use at least 8 characters.',
    'auth/requires-recent-login': 'For your security, log out, log in again, then retry.'
};

export function friendlyAuthError(err, fallback = 'Something went wrong. Please try again.') {
    return (err && MESSAGES[err.code]) || fallback;
}