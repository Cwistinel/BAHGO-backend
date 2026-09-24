// Entry point: exposes the functions App.js relies on as globals
// (they're invoked from inline onclick="" HTML in the rendered markup).
import { initBahgoApp } from './functions/initBahgoApp';
import { openStationModal } from './functions/stationModal';

window.initBahgoApp = initBahgoApp;
window.openStationModal = openStationModal;
