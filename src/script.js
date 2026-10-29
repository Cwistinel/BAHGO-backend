import { initBahgoApp } from './functions/initBahgoApp';
import { openStationModal } from './functions/stationModal';
import { deleteAdminUser } from './functions/superUsers';
import { openPalarMapPopup, openPalarEditModal, savePalarLocation } from './functions/palarMap';

Object.assign(window, { initBahgoApp, openStationModal, deleteAdminUser, openPalarMapPopup, openPalarEditModal, savePalarLocation });