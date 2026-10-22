export function updateClock() {
    const now = new Date();
    const dateOptions = { month: 'long', day: 'numeric', year: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    const dateText = now.toLocaleDateString('en-US', dateOptions);
    const timeText = now.toLocaleTimeString('en-US', timeOptions).toLowerCase();

    ['currentDate', 'superCurrentDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = dateText;
    });
    ['currentTime', 'superCurrentTime'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = timeText;
    });
}