let pressedOnBackdrop = false;
document.addEventListener('mousedown', (e) => {
    pressedOnBackdrop = e.target.id === 'stationModal';
});

document.addEventListener('click', (e) => {
    if (e.target.id === 'stationModal' && pressedOnBackdrop) {
        e.target.classList.remove('active');
        return;
    }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.stationId;
    switch (el.dataset.action) {
        case 'open-station': window.openStationModal?.(id); break;
        case 'open-map': window.openPalarMapPopup?.(id); break;
        case 'edit-location': window.openPalarEditModal?.(id); break;
        case 'save-location': window.savePalarLocation?.(id); break;
        case 'close-modal': document.getElementById('stationModal')?.classList.remove('active'); break;
        case 'delete-admin': window.deleteAdminUser?.(el.dataset.uid, el.dataset.email); break;
        default: break;
    }
});