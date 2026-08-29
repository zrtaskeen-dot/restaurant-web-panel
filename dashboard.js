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

const BRANCH_DOC_ID = localStorage.getItem("active_branch_id");
console.log("Active Logged-in Manager Branch ID:", BRANCH_DOC_ID);

let revenueChart = null;

// ✅ Helper: Check if scheduled order
function checkIsScheduled(data) {
    const raw = (data.delivery_time || '').toString().trim().toLowerCase();
    // Sirf comparison ke liye lowercase — "now", empty, asap exclude karo
    if (raw === '' || raw === 'now' || raw === 'as soon as possible' || raw === 'asap') return false;
    // ✅ Original value se parse karo (lowercase nahi)
    const original = (data.delivery_time || '').toString().trim();
    const cleaned  = original.replace(" at ", " ");
    const parsed   = new Date(cleaned);
    return !isNaN(parsed.getTime());
}

// 1. Branch Details
function listenToBranchDetails() {
    if (!BRANCH_DOC_ID) return;
    db.collection("restaurant_info").doc(BRANCH_DOC_ID).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('displayBranchName').innerText   = data.branchName || "Setup Your Branch Name";
            document.getElementById('displayBranchTiming').innerText  = data.timing    || "--:--";
            document.getElementById('displayBranchAddress').innerText = data.address   || "Enter Address";
            document.getElementById('inputBranchName').value    = data.branchName || "";
            document.getElementById('inputBranchTiming').value  = data.timing     || "";
            document.getElementById('inputBranchAddress').value = data.address    || "";
        } else {
            document.getElementById('displayBranchName').innerText   = "Branch Profile Setup Needed";
            document.getElementById('displayBranchTiming').innerText = "--:--";
            document.getElementById('displayBranchAddress').innerText = "--";
        }
    });
}

// 2. Save Branch Details
window.saveBranchDetails = async function() {
    const name    = document.getElementById('inputBranchName').value.trim();
    const timing  = document.getElementById('inputBranchTiming').value.trim();
    const address = document.getElementById('inputBranchAddress').value.trim();
    if (!name || !timing || !address) { alert("Please fill all branch details!"); return; }
    const saveBtn = document.getElementById('btnSaveBranch');
    saveBtn.innerText = "Saving...";
    saveBtn.disabled  = true;
    try {
        await db.collection("restaurant_info").doc(BRANCH_DOC_ID).set({
            branchName: name, timing, address, updatedAt: Date.now()
        }, { merge: true });
        closeBranchModal();
        alert("Branch Details Updated Successfully!");
    } catch (error) {
        alert("Error saving data: " + error.message);
    } finally {
        saveBtn.innerText = "Save Updates";
        saveBtn.disabled  = false;
    }
};

// 3. Dashboard Counters
function initDashboard() {
    if (!BRANCH_DOC_ID) return;

    // Menu count
    db.collection("menu").where("branchId", "==", BRANCH_DOC_ID).onSnapshot(snap => {
        const el = document.getElementById('count-menu');
        if (el) el.innerText = snap.size;
    });

    // Orders
    db.collection("orders").where("branchId", "==", BRANCH_DOC_ID).onSnapshot(snap => {
        let revenue         = 0;
        let pending         = 0;
        let delivered       = 0;
        let deliverNowRev   = 0;
        let deliverLaterRev = 0;
        let codRevenue      = 0;
        let onlineRevenue   = 0;

        snap.forEach(doc => {
            const data   = doc.data();
            const amount = Number(data.total_bill || data.totalAmount || 0);
            revenue += amount;

            // ✅ delivery_time se scheduled check karo
            if (checkIsScheduled(data)) {
                deliverLaterRev += amount;
            } else {
                deliverNowRev += amount;
            }

            // ✅ Payment method breakdown
            const pm = (data.payment_method || data.paymentMethod || 'cod').toLowerCase();
            if (pm === 'cod' || pm === 'cash' || pm === 'cash on delivery') {
                codRevenue += amount;
            } else {
                onlineRevenue += amount;
            }

            const status = (data.order_status || data.status || '').toLowerCase();
            if (status === 'pending')                              pending++;
            if (status === 'completed' || status === 'delivered') delivered++;
        });

        const cOrders    = document.getElementById('count-orders');
        const cRevenue   = document.getElementById('total-revenue');
        const cPending   = document.getElementById('count-pending');
        const cDelivered = document.getElementById('count-delivered');

        if (cOrders)    cOrders.innerText    = snap.size;
        if (cRevenue)   cRevenue.innerText   = "PKR " + revenue.toLocaleString();
        if (cPending)   cPending.innerText   = pending;
        if (cDelivered) cDelivered.innerText = delivered;

        updateRevenueChart(deliverNowRev, deliverLaterRev, codRevenue, onlineRevenue);
    });

    // Unique customers
    db.collection("orders").where("branchId", "==", BRANCH_DOC_ID).onSnapshot(snap => {
        const uniqueCustomers = new Set();
        snap.forEach(doc => {
            const data       = doc.data();
            const identifier = data.customer_email || data.email || data.phone_number || data.phone || doc.id;
            uniqueCustomers.add(identifier);
        });
        const el = document.getElementById('count-customers');
        if (el) el.innerText = uniqueCustomers.size;
    });

    // Riders count
db.collection("users")
    .where("role",          "==", "rider")
    .where("branchId",      "==", BRANCH_DOC_ID)
    .where("emailVerified", "==", true)        // ✅ sirf verified riders count
    .onSnapshot(snap => {
        const el = document.getElementById('count-riders');
        if (el) el.innerText = snap.size;
    });
}

// 4. ✅ Revenue Chart — 4 bars
function updateRevenueChart(nowRevenue, laterRevenue, codRevenue, onlineRevenue) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    const labels = ['Deliver Now', 'Scheduled', 'COD', 'Online Payment'];
    const data   = [nowRevenue, laterRevenue, codRevenue, onlineRevenue];
   const colors = ['#ca880d', '#f9643f', '#c92929', '#e07000'];

    if (revenueChart) {
        revenueChart.data.datasets[0].data = data;
        revenueChart.update();
    } else {
        revenueChart = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label:           'Revenue (PKR)',
                    data:            data,
                    backgroundColor: colors,
                    borderWidth:     0,
                    borderRadius:    10,
                }]
            },
            options: {
                responsive:          true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ' PKR ' + ctx.parsed.y.toLocaleString()
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f0f0f0' },
                        ticks: {
                            callback: val => 'PKR ' + val.toLocaleString()
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }
}

// ✅ Sidebar Badge
function updateOrdersBadge() {
    if (!BRANCH_DOC_ID) return;
    db.collection("orders")
        .where("branchId", "==", BRANCH_DOC_ID)
        .onSnapshot(snap => {
            let pendingCount = 0;
            snap.forEach(doc => {
                const status = (doc.data().order_status || doc.data().status || '').toLowerCase();
                if (status === 'pending') pendingCount++;
            });
            const links = document.querySelectorAll('.sidebar nav a');
            links.forEach(link => {
                if (link.textContent.trim().toLowerCase().includes('order')) {
                    let badge = document.getElementById('orders-badge');
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.id = 'orders-badge';
                        badge.style.cssText = 'background:#f9a03f;color:black;font-size:10px;font-weight:bold;padding:2px 7px;border-radius:10px;margin-left:6px;display:none;';
                        link.appendChild(badge);
                    }
                    badge.innerText = pendingCount;
                    badge.style.display = pendingCount > 0 ? 'inline' : 'none';
                }
            });
        });
}

document.querySelectorAll('.sidebar nav a').forEach(link => {
    link.addEventListener('click', function() {
        document.querySelectorAll('.sidebar nav a').forEach(nav => nav.classList.remove('active'));
        this.classList.add('active');
    });
});

document.addEventListener('DOMContentLoaded', () => {
    listenToBranchDetails();
    initDashboard();
    updateOrdersBadge();
});

window.openBranchModal = function() {
    const overlay = document.getElementById('branchModalOverlay');
    const modal   = document.getElementById('branchEditModal');
    if (overlay && modal) { overlay.style.display = 'block'; modal.style.display = 'block'; }
};

window.closeBranchModal = function() {
    const overlay = document.getElementById('branchModalOverlay');
    const modal   = document.getElementById('branchEditModal');
    if (overlay && modal) { overlay.style.display = 'none'; modal.style.display = 'none'; }
};

document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('branchModalOverlay');
    if (overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeBranchModal();
        });
    }
});