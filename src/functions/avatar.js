import { auth } from '../firebase';
import { saveUserPhoto } from './settings';
import { showToast } from './notifications';

const DEFAULT_AVATAR = '/logo192.png';

export function applyAvatar(url) {
    const src = url || DEFAULT_AVATAR;
    document.querySelectorAll('.avatar-circle img').forEach(img => { img.src = src; });
}

function resizeImage(file, size = 160) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read the file.'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('That file is not a valid image.'));
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                const side = Math.min(img.width, img.height);
                const sx = (img.width - side) / 2;
                const sy = (img.height - side) / 2;
                ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function wirePhotoControls(changeBtnId, inputId, removeBtnId) {
    const changeBtn = document.getElementById(changeBtnId);
    const input = document.getElementById(inputId);
    const removeBtn = document.getElementById(removeBtnId);

    if (changeBtn && input) {
        changeBtn.onclick = function() { input.click(); };
        input.onchange = async function() {
            const file = input.files && input.files[0];
            if (!file) return;
            const currentUser = auth.currentUser;
            if (!currentUser) { showToast('You must be logged in!', 'error'); input.value = ''; return; }
            if (!file.type.startsWith('image/')) { showToast('Please choose an image file.', 'error'); input.value = ''; return; }
            if (file.size > 10 * 1024 * 1024) { showToast('Image is too large. Choose one under 10 MB.', 'error'); input.value = ''; return; }
            try {
                changeBtn.disabled = true;
                changeBtn.textContent = 'Saving...';
                const dataUrl = await resizeImage(file);
                await saveUserPhoto(currentUser.uid, dataUrl);
                applyAvatar(dataUrl);
                showToast('Profile photo updated!', 'success');
            } catch (err) {
                showToast('Could not update photo: ' + err.message, 'error');
            } finally {
                changeBtn.disabled = false;
                changeBtn.textContent = 'Change Photo';
                input.value = '';
            }
        };
    }

    if (removeBtn) {
        removeBtn.onclick = async function() {
            const currentUser = auth.currentUser;
            if (!currentUser) { showToast('You must be logged in!', 'error'); return; }
            try {
                await saveUserPhoto(currentUser.uid, '');
                applyAvatar('');
                showToast('Profile photo removed.', 'success');
            } catch (err) {
                showToast('Could not remove photo: ' + err.message, 'error');
            }
        };
    }
}

export function initAvatar() {
    wirePhotoControls('changePhotoBtn', 'photoInput', 'removePhotoBtn');
    wirePhotoControls('superChangePhotoBtn', 'superPhotoInput', 'superRemovePhotoBtn');
}