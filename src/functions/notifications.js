export function showToast(message, type = 'success') {
    if (!document.getElementById('bahgo-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'bahgo-toast-styles';
        style.innerHTML = `
            .toast-container { position: fixed; bottom: 30px; right: 30px; z-index: 9999; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
            .custom-toast { background: #ffffff; color: #1f2937; padding: 16px 24px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); font-weight: 600; font-size: 0.95rem; border-left: 5px solid #3B82F6; transform: translateX(120%); opacity: 0; transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55); }
            .custom-toast.show { transform: translateX(0); opacity: 1; }
            .custom-toast.success { border-left-color: #22C55E; }
            .custom-toast.error { border-left-color: #EF4444; }
        `;
        document.head.appendChild(style);
    }

    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `custom-toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}
