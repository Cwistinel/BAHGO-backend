const set = (ids, text) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.innerText = text; });

export function updateClock() {
    const now = new Date();
    set(['currentDate', 'superCurrentDate'], now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
    set(['currentTime', 'superCurrentTime'], now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase());
}