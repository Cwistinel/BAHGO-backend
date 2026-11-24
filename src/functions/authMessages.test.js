import { friendlyAuthError } from './authMessages';

test('known Firebase codes get plain messages; unknown ones get the fallback, never raw Firebase text', () => {
    expect(friendlyAuthError({ code: 'auth/invalid-credential', message: 'Firebase: Error (auth/invalid-credential).' })).toBe('Wrong email or password.');
    expect(friendlyAuthError({ code: 'auth/too-many-requests' })).toMatch(/Too many attempts/);
    expect(friendlyAuthError({ code: 'auth/network-request-failed' })).toMatch(/No internet/);
    expect(friendlyAuthError({ code: 'auth/something-new', message: 'Firebase: Error (auth/something-new).' }, 'Login failed.')).toBe('Login failed.');
    expect(friendlyAuthError(undefined)).toBe('Something went wrong. Please try again.');
});