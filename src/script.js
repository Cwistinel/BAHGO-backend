import { initBahgoApp } from './functions/initBahgoApp';
import { openStationModal } from './functions/stationModal';
import { loadAdminUsers, deleteAdminUser, initSuperUsers } from './functions/superUsers';
import { renderTaguigMaps, openPalarMapPopup, openPalarEditModal, savePalarLocation } from './functions/palarMap';
import { switchSuperPage, showSuperDashboard } from './functions/navigation';

window.initBahgoApp = initBahgoApp;
window.openStationModal = openStationModal;
window.loadAdminUsers = loadAdminUsers;
window.deleteAdminUser = deleteAdminUser;
window.renderTaguigMaps = renderTaguigMaps;
window.openPalarMapPopup = openPalarMapPopup;
window.openPalarEditModal = openPalarEditModal;
window.savePalarLocation = savePalarLocation;
window.switchSuperPage = switchSuperPage;
window.showSuperDashboard = showSuperDashboard;

const originalInit = initBahgoApp;
window.initBahgoApp = function() {
  originalInit();
  initSuperUsers();
  const superLogoutBtn = document.getElementById('superLogoutBtn');
  if (superLogoutBtn) {
    superLogoutBtn.onclick = async function() {
      const { logout } = await import('./functions/auth');
      const { state } = await import('./state');
      await logout();
      if (state.stationsUnsubscribe) state.stationsUnsubscribe();
      state.stationsUnsubscribe = null;
    };
  }
};