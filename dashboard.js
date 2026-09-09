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
    if (raw === '' || raw === 'now' || raw === 'as soon as possible' || raw === 'asap') return false;
    const original = (data.delivery_time || '').toString().trim();
    const cleaned  = original.replace(" at ", " ");
    const parsed   = new Date(cleaned);
    return !isNaN(parsed.getTime());
}

// 1. Branch Details & Payment Numbers Listener
function listenToBranchDetails() {
    if (!BRANCH_DOC_ID) return;
    
    // Branch Info Listener
    db.collection("restaurant_info").doc(BRANCH_DOC_ID).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            const bName = document.getElementById('displayBranchName');
            const bTiming = document.getElementById('displayBranchTiming');
            const bAddr = document.getElementById('displayBranchAddress');
            
            if (bName) bName.innerText = data.branchName || "Setup Your Branch Name";
            if (bTiming) bTiming.innerText = data.timing || "--:--";
            if (bAddr) bAddr.innerText = data.address || "Enter Address";

            const inName = document.getElementById('inputBranchName');
            const inTiming = document.getElementById('inputBranchTiming');
            const inAddr = document.getElementById('inputBranchAddress');

            if (inName) inName.value = data.branchName || "";
            if (inTiming) inTiming.value = data.timing || "";
            if (inAddr) inAddr.value = data.address || "";
        } else {
            const bName = document.getElementById('displayBranchName');
            if (bName) bName.innerText = "Branch Profile Setup Needed";
        }
    });

    // 🟢 Payment Accounts Listener (Updates Header View & Modal Inputs)
    db.collection("branches").doc(BRANCH_DOC_ID).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            const ep = data.easyPaisaNumber || "Not Set";
            const jc = data.jazzCashNumber  || "Not Set";

            // Header UI update
            const epEl = document.getElementById("displayEasyPaisa");
            const jcEl = document.getElementById("displayJazzCash");
            if (epEl) epEl.innerText = ep;
            if (jcEl) jcEl.innerText = jc;

            // Modal inputs pre-fill
            const epModalInput = document.getElementById("modalEasyPaisa");
            const jcModalInput = document.getElementById("modalJazzCash");
            if (epModalInput) epModalInput.value = data.easyPaisaNumber || "";
            if (jcModalInput) jcModalInput.value = data.jazzCashNumber  || "";
        }
    });
}

// 2. Save Branch Details
window.saveBranchDetails = async function() {
    const name    = document.getElementById('inputBranchName').value.trim();
    const timing  = document.getElementById('inputBranchTiming').value.trim();
    const address = document.getElementById('inputBranchAddress').value.trim();
    
    if (!name || !timing || !address) { 
        alert("Please fill all branch details!"); 
        return; 
    }
    
    const saveBtn = document.getElementById('btnSaveBranch');
    if (saveBtn) {
        saveBtn.innerText = "Saving...";
        saveBtn.disabled  = true;
    }

    try {
        await db.collection("restaurant_info").doc(BRANCH_DOC_ID).set({
            branchName: name, 
            timing: timing, 
            address: address, 
            updatedAt: Date.now()
        }, { merge: true });
        
        closeBranchModal();
        alert("Branch Details Updated Successfully!");
    } catch (error) {
        alert("Error saving data: " + error.message);
    } finally {
        if (saveBtn) {
            saveBtn.innerText = "Save Updates";
            saveBtn.disabled  = false;
        }
    }
};


/// 🟢 Save Payment Account Numbers (Exact 11 Digits Validation)
window.savePaymentNumbers = async function() {
    if (!BRANCH_DOC_ID) return alert("Session expired. Please login again!");

    const epVal = document.getElementById("modalEasyPaisa")?.value.trim() || "";
    const jcVal = document.getElementById("modalJazzCash")?.value.trim() || "";
    const btn   = document.getElementById("btnSavePayment");

    const phoneRegex = /^\d{11}$/;

    if (epVal && !phoneRegex.test(epVal)) {
        alert("Invalid Number");
        return;
    }

    if (jcVal && !phoneRegex.test(jcVal)) {
        alert("Invalid Number");
        return;
    }

    if (btn) {
        btn.innerText = "Saving...";
        btn.disabled  = true;
    }

    try {
        await db.collection("branches").doc(BRANCH_DOC_ID).set({
            easyPaisaNumber: epVal,
            jazzCashNumber:  jcVal
        }, { merge: true });

        closePaymentModal();
        alert("Payment account numbers updated successfully!");
    } catch (e) {
        console.error("Error saving payment numbers:", e);
        alert("Failed to update payment numbers: " + e.message);
    } finally {
        if (btn) {
            btn.innerText = "Save Updates";
            btn.disabled  = false;
        }
    }
};

// 🟢 Modal Controls for Branch Modal
window.openBranchModal = function() {
    const overlay = document.getElementById('branchModalOverlay');
    const modal   = document.getElementById('branchEditModal');
    if (overlay && modal) { 
        overlay.style.display = 'block'; 
        modal.style.display   = 'block'; 
    }
};

window.closeBranchModal = function() {
    const overlay = document.getElementById('branchModalOverlay');
    const modal   = document.getElementById('branchEditModal');
    if (overlay && modal) { 
        overlay.style.display = 'none'; 
        modal.style.display   = 'none'; 
    }
};

// 🟢 Modal Controls for Payment Modal
window.openPaymentModal = function() {
    const overlay = document.getElementById('paymentModalOverlay');
    const modal   = document.getElementById('paymentEditModal');
    if (overlay && modal) {
        overlay.style.display = 'block';
        modal.style.display   = 'block';
    }
};

window.closePaymentModal = function() {
    const overlay = document.getElementById('paymentModalOverlay');
    const modal   = document.getElementById('paymentEditModal');
    if (overlay && modal) {
        overlay.style.display = 'none';
        modal.style.display   = 'none';
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

    // Orders & Revenue
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
            const status = (data.order_status || data.status || '').toLowerCase();
            const amount = Number(data.total_bill || data.totalAmount || 0);

            if (status === 'pending') pending++;
            if (status === 'completed' || status === 'delivered') delivered++;

            if (status !== 'delivered' && status !== 'completed') return;

            revenue += amount;

            if (checkIsScheduled(data)) {
                deliverLaterRev += amount;
            } else {
                deliverNowRev += amount;
            }

            const pm = (data.payment_method || data.paymentMethod || 'cod').toLowerCase();
            if (pm === 'cod' || pm === 'cash' || pm === 'cash on delivery') {
                codRevenue += amount;
            } else {
                onlineRevenue += amount;
            }
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
        .where("emailVerified", "==", true)
        .onSnapshot(snap => {
            const el = document.getElementById('count-riders');
            if (el) el.innerText = snap.size;
        });
}

// 4. Revenue Chart
function updateRevenueChart(nowRevenue, laterRevenue, codRevenue, onlineRevenue) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    const labels = ['Deliver Now', 'Scheduled', 'COD', 'Online Payment'];
    const data   = [nowRevenue, laterRevenue, codRevenue, onlineRevenue];
    const colors = ['#2C3E50', '#7F8C8D', '#B52A00', '#5D4037'];

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

// Sidebar Badges
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

function updateReviewsBadge() {
    if (!BRANCH_DOC_ID) return;

    db.collection("orders")
        .where("branchId", "==", BRANCH_DOC_ID)
        .onSnapshot(ordersSnap => {
            const branchOrderIds = new Set();
            ordersSnap.forEach(doc => branchOrderIds.add(doc.id));

            db.collection("reviews")
                .where("isRead", "==", false)
                .onSnapshot(reviewsSnap => {
                    let unreadCount = 0;
                    reviewsSnap.forEach(doc => {
                        if (branchOrderIds.has(doc.data().orderId)) {
                            unreadCount++;
                        }
                    });

                    const links = document.querySelectorAll('.sidebar nav a');
                    links.forEach(link => {
                        if (link.textContent.trim().toLowerCase().includes('review')) {
                            let badge = document.getElementById('reviews-badge');
                            if (!badge) {
                                badge = document.createElement('span');
                                badge.id = 'reviews-badge';
                                badge.style.cssText = 'background:#f9a03f;color:black;font-size:10px;font-weight:bold;padding:2px 7px;border-radius:10px;margin-left:6px;display:none;';
                                link.appendChild(badge);
                            }
                            badge.innerText = unreadCount;
                            badge.style.display = unreadCount > 0 ? 'inline' : 'none';
                        }
                    });
                });
        });
}

// UI Event Listeners
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
    updateReviewsBadge();

    // Close branch modal on backdrop click
    const branchOverlay = document.getElementById('branchModalOverlay');
    if (branchOverlay) {
        branchOverlay.addEventListener('click', function(e) {
            if (e.target === branchOverlay) closeBranchModal();
        });
    }

    // Close payment modal on backdrop click
    const paymentOverlay = document.getElementById('paymentModalOverlay');
    if (paymentOverlay) {
        paymentOverlay.addEventListener('click', function(e) {
            if (e.target === paymentOverlay) closePaymentModal();
        });
    }
});