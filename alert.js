// ══════════════════════════════
// custom-alert.js
// ══════════════════════════════

// ── Alert override ──
window.alert = function(message) {
    const existing = document.getElementById('customAlertOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customAlertOverlay';

    overlay.innerHTML = `
        <div id="customAlertBox">
            <div id="customAlertMessage">${message}</div>
            <button id="customAlertOk">OK</button>
        </div>
    `;

    document.body.appendChild(overlay);

    function close() { overlay.remove(); }

    document.getElementById('customAlertOk').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    function keyHandler(e) {
        if (e.key === 'Enter' || e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', keyHandler);
        }
    }
    document.addEventListener('keydown', keyHandler);
};

// ── Confirm override ──
window.confirm = function(message) {
    return new Promise((resolve) => {
        const existing = document.getElementById('customConfirmOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'customConfirmOverlay';

        overlay.innerHTML = `
            <div id="customConfirmBox">
                <div id="customConfirmMessage">${message}</div>
                <div class="confirm-btns">
                    <button class="confirm-cancel" id="confirmCancel">Cancel</button>
                    <button class="confirm-ok" id="confirmOk">OK</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        function closeWith(val) {
            overlay.remove();
            resolve(val);
        }

        document.getElementById('confirmOk').onclick     = () => closeWith(true);
        document.getElementById('confirmCancel').onclick = () => closeWith(false);
        overlay.onclick = (e) => { if (e.target === overlay) closeWith(false); };
    });
};