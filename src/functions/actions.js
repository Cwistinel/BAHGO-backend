// One click listener for every button that used to have an inline onclick.
document.addEventListener('click', (e) => {
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