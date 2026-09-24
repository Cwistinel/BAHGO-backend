import { loadStations } from './stationsData';

export function switchPage(pageId) {
    document.querySelectorAll('.nav-btn[data-page]').forEach(btn => btn.classList.toggle('active', btn.dataset.page === pageId));
    document.querySelectorAll('.page-content').forEach(page => page.classList.toggle('active', page.id === pageId));
}

export function showDashboard() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('dashboardScreen').classList.add('active');
    switchPage('overview');
    loadStations();
}
