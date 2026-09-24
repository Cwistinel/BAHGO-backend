export function updateClock() {
    const now = new Date();
    const dateOptions = { month: 'long', day: 'numeric', year: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    const currentDateEl = document.getElementById('currentDate');
    const currentTimeEl = document.getElementById('currentTime');

    if (currentDateEl) currentDateEl.innerText = now.toLocaleDateString('en-US', dateOptions);
    if (currentTimeEl) currentTimeEl.innerText = now.toLocaleTimeString('en-US', timeOptions).toLowerCase();
}
