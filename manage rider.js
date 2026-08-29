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

const currentBranchId = localStorage.getItem("active_branch_id") || "";
console.log("Manager Rider Panel - Active Branch ID:", currentBranchId);

if (!currentBranchId) {
    const list = document.getElementById('rider-list');
    if (list) list.innerHTML = '<p style="padding: 20px; text-align: center; color: red;">Session error: Branch ID not found. Please login again.</p>';
} else {
    db.collection("users")
        .where("role",          "==", "rider")
        .where("branchId",      "==", currentBranchId)
        .where("emailVerified", "==", true)          // ✅ sirf verified riders
        .onSnapshot((snapshot) => {
            const list = document.getElementById('rider-list');
            if (!list) return;
            list.innerHTML = '';

            if (snapshot.empty) {
                list.innerHTML = '<p style="padding: 20px; text-align: center;">No verified riders registered under your branch yet.</p>';
                return;
            }

            snapshot.forEach((doc) => {
                const r = doc.data();
                list.innerHTML += `
                    <div class="rider-row">
                        <span>${r.name}</span>
                        <span>${r.email}</span>
                        <span>********</span>
                        <span>${r.phone}</span>
                        <span>${r.cnic || '-'}</span>
                        <span class="rider-branch-text">${r.branchName || "Assigned"}</span>
                    </div>`;
            });
        }, (err) => {
            console.error("Firestore error:", err);
            const list = document.getElementById('rider-list');
            if (list) list.innerHTML = '<p style="padding: 20px; text-align: center; color:red;">Error loading riders: ' + err.message + '</p>';
        });
}

// ✅ Sidebar Badge — both "pending" and "Pending"
function updateOrdersBadge() {
    if (!currentBranchId) return;
    db.collection("orders")
        .where("branchId", "==", currentBranchId)
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

document.addEventListener('DOMContentLoaded', updateOrdersBadge);