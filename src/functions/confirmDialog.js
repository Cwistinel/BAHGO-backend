// The site's own confirmation box, instead of the browser's "bahgo.web.app says" pop-up.
// Resolves true on the confirm button, false on Cancel, Esc or a click outside the box.
export function confirmDialog({ title, message, confirmLabel = 'OK' }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal active';
        overlay.style.zIndex = '10001';
        overlay.innerHTML = `
            <div class="modal-content" role="alertdialog" aria-modal="true" style="max-width:440px">
                <h2 style="font-size:1.25rem;margin-bottom:12px"></h2>
                <p style="color:var(--text-muted);line-height:1.5;margin-bottom:24px"></p>
                <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap">
                    <button type="button" data-answer="no" class="btn-login" style="width:auto;margin:0;padding:10px 22px;background:#E2E8F0;color:#1E293B">Cancel</button>
                    <button type="button" data-answer="yes" class="btn-login" style="width:auto;margin:0;padding:10px 22px;background:#EF4444"></button>
                </div>
            </div>`;
        // textContent, so an email or name can never be read as HTML
        overlay.querySelector('h2').textContent = title;
        overlay.querySelector('p').textContent = message;
        overlay.querySelector('[data-answer="yes"]').textContent = confirmLabel;

        const close = (answer) => {
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            resolve(answer);
        };
        const onKey = (e) => { if (e.key === 'Escape') close(false); };
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false);
            const answer = e.target.closest('[data-answer]')?.dataset.answer;
            if (answer) close(answer === 'yes');
        });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
        overlay.querySelector('[data-answer="no"]').focus();   // safe choice selected by default
    });
}