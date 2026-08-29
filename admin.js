const firebaseConfig = {
    apiKey: 'AIzaSyCwstpeM4MkOs9aNkh9faJQm-1jggbMZZE',
    appId: '1:848662087857:web:0c1349bc37248181a0fa90',
    messagingSenderId: '848662087857',
    projectId: 'resturant-e0389',
    authDomain: 'resturant-e0389.firebaseapp.com',
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

let previousOrderCount = null;

// ── DATE BADGE ──
function setDateBadge() {
    const now     = new Date();
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    const badge   = document.getElementById('dateBadge');
    if (badge) badge.innerText = now.toLocaleDateString('en-US', options);
}

// ✅ Live Clock
function startLiveClock() {
    function tick() {
        const clock = document.getElementById('liveClock');
        if (clock) {
            clock.innerText = new Date().toLocaleTimeString('en-US', {
                hour:   '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }
    }
    tick();
    setInterval(tick, 1000);
}

// ── TIME HELPER ──
function nowTime() {
    return new Date().toLocaleTimeString('en-US', {
        hour:   '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// ── SYSTEM LOG PANEL HELPER ──
function showLog(id, textId, timeId, text) {
    const entry = document.getElementById(id);
    if (entry) entry.style.display = 'flex';
    const t = document.getElementById(textId);
    if (t) t.innerText = text;
    const tm = document.getElementById(timeId);
    if (tm) tm.innerText = nowTime();
}

// ── COUNT HELPER ──
function animateCount(elementId, target) {
    const el = document.getElementById(elementId);
    if (el) el.innerText = target;
}

// ✅ System Log — from "system_log" collection
function loadActivityLog() {
    const container = document.getElementById('activityLog');
    if (!container) return;

    db.collection("system_log")           // ✅ collection rename
        .orderBy("created_at", "desc")
        .limit(50)
        .onSnapshot(snap => {
            if (snap.empty) {
                container.innerHTML = `<p style="padding:20px; text-align:center; color:#999;">No activity recorded yet.</p>`;
                return;
            }

            container.innerHTML = '';

            snap.forEach(doc => {
                const log    = doc.data();
                const action = (log.action || '').toLowerCase();

                // Dot color
                let dotColor = '#888';
                if (action.includes('delete') || action.includes('remov')) dotColor = '#b52a00';
                else if (action.includes('add') || action.includes('creat'))  dotColor = '#2a6b3f';
                else if (action.includes('update') || action.includes('edit')) dotColor = '#555';
                else if (action.includes('order'))  dotColor = '#7a1c00';
                else if (action.includes('assign')) dotColor = '#444';
                else if (action.includes('login'))  dotColor = '#333';

                // Time format
                let timeStr = '—';
                if (log.created_at) {
                    const date = log.created_at.toDate ? log.created_at.toDate() : new Date(log.created_at);
                    timeStr = date.toLocaleString('en-US', {
                        day:    '2-digit',
                        month:  'short',
                        year:   'numeric',
                        hour:   '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                }

                // ✅ Role + By ek line, branch agar ho
                const metaLine = `${log.role || ''}${log.branch ? ` | ${log.branch}` : ''}`;

                container.innerHTML += `
                    <div class="activity-entry">
                        <div class="activity-dot" style="background:${dotColor};"></div>
                        <div class="activity-body">
                            <div class="activity-action">${log.action || 'Action'}</div>
                            <div class="activity-details">${log.details || ''}</div>
                            <div class="activity-meta">
                                <span><strong>${metaLine}</strong></span>
                                <span class="activity-time">${timeStr}</span>
                            </div>
                        </div>
                    </div>`;
            });
        }, error => {
            console.error("System log error:", error);
            container.innerHTML = `<p style="padding:20px; text-align:center; color:red;">Error loading system log.</p>`;
        });
}

// ── SYNC ALL STATS ──
function syncStats() {
    const loadTimeEl = document.getElementById('loadTime');
    if (loadTimeEl) loadTimeEl.innerText = nowTime();

    const syncTimeEl = document.getElementById('syncTime');
    if (syncTimeEl) syncTimeEl.innerText = nowTime();

    // Riders
    db.collection("users").where("role", "==", "rider").onSnapshot(snap => {
        animateCount('total-riders', snap.size);
        showLog('logRiders', 'logRidersText', 'logRidersTime',
            `${snap.size} rider(s) synced`);
    });

    // Customers
    db.collection("users").where("roleID", "==", "R001").onSnapshot(snap => {
        animateCount('total-customers', snap.size);
        showLog('logCustomers', 'logCustomersText', 'logCustomersTime',
            `${snap.size} customer(s) synced`);
    });

    // Managers
    db.collection("users").where("role", "==", "manager").onSnapshot(snap => {
        animateCount('total-managers', snap.size);
        showLog('logManagers', 'logManagersText', 'logManagersTime',
            `${snap.size} manager(s) synced`);
    });

    // Branches
    db.collection("restaurant_info").onSnapshot(snap => {
        animateCount('total-branches', snap.size);
        showLog('logBranches', 'logBranchesText', 'logBranchesTime',
            `${snap.size} branch(es) synced`);
    });

    // Orders
    db.collection("orders").onSnapshot(snap => {
        showLog('logOrders', 'logOrdersText', 'logOrdersTime',
            `${snap.size} total order(s) across all branches`);

        if (previousOrderCount !== null && snap.size > previousOrderCount) {
            const diff = snap.size - previousOrderCount;
            showLog('logNewOrder', 'logNewOrderText', 'logNewOrderTime',
                `${diff} new order(s) received across branches`);
        }
        previousOrderCount = snap.size;
    });
}

// ── LOGOUT ──
window.openLogout = function(e) {
    if (e) e.preventDefault();
    const modal = document.getElementById('logoutModal');
    if (modal) modal.classList.add('active');
};

window.closeLogout = function() {
    const modal = document.getElementById('logoutModal');
    if (modal) modal.classList.remove('active');
};

window.confirmLogout = function() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = 'index.html';
};

document.addEventListener('click', function(e) {
    const modal = document.getElementById('logoutModal');
    if (modal && e.target === modal) closeLogout();
});

// ── INIT ──
document.addEventListener("DOMContentLoaded", () => {
    setDateBadge();
    startLiveClock();
    syncStats();
    loadActivityLog();
});