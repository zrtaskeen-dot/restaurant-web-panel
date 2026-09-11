// --- Firebase Configuration ---
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

// 🟢 Pehle sab orders fetch karo — phir customers ke liye address dhundo
let allOrders = [];

async function loadAllOrders() {
    try {
        const snap = await db.collection("orders").get();
        allOrders = [];
        snap.forEach(doc => allOrders.push(doc.data()));
    } catch (e) {
        console.error("Orders fetch error:", e);
    }
}

// Address dhundne ka function
function findAddressForCustomer(name, phone) {
    // naam se match karo
    const matches = allOrders.filter(o => 
        (o.customer_name && o.customer_name.toLowerCase().trim() === (name || '').toLowerCase().trim()) ||
        (o.phone_number && phone && o.phone_number === phone)
    );

    if (matches.length === 0) return "N/A";

    // Latest order ka address lo
    matches.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return matches[0].delivery_address || "N/A";
}

// --- Load Customers ---
async function loadCustomers() {
    const listContainer = document.getElementById('customer-list');
    listContainer.innerHTML = '<p style="padding:20px; text-align:center; color:#666;">Loading...</p>';

    // Pehle orders load karo
    await loadAllOrders();

    db.collection("users")
    .onSnapshot((snapshot) => {
        listContainer.innerHTML = ""; 

        let count = 0;

        snapshot.forEach((doc) => {
            const user = doc.data();
            const role = user.role || "";

            // Riders aur Managers skip karo
            if (role === "rider" || role === "manager"|| role === "owner"|| role === "admin") return;

            count++;
            const id = doc.id;
            const isBlocked = user.status === "blocked";

            // 🟢 Address orders se dhundo
            const address = findAddressForCustomer(user.name, user.phone);

            const row = document.createElement('div');
            row.className = `customer-row ${isBlocked ? 'blocked-row' : ''}`;
            
            row.innerHTML = `
                <span style="font-weight:500;">
                    ${user.name || 'N/A'} 
                    ${isBlocked ? '<span style="color:#b52a00; font-size:11px; font-weight:bold;">(Blocked)</span>' : ''}
                </span>
                <span style="color:#555;">${user.email || 'N/A'}</span>
                <span>********</span>
                <span style="color:#555; font-size:12px;">${address}</span>
                <div class="actions-cell">
                    <button class="block-btn" style="background:${isBlocked ? '#28a745' : '#7a1c00'};" onclick="toggleBlock('${id}', ${isBlocked})">
                        ${isBlocked ? 'Unblock' : 'Block'}
                    </button>
                    <button class="delete-btn" onclick="deleteUser('${id}')">Delete</button>
                </div>
            `;
            listContainer.appendChild(row);
        });

        if (count === 0) {
            listContainer.innerHTML = '<p style="padding:20px; text-align:center; color:#666;">No customers found.</p>';
        }

    }, (error) => {
        console.error("Error fetching users: ", error);
    });
}

// --- Toggle Block/Unblock --- 🟢 async confirm fix
window.toggleBlock = async function(id, currentStatus) {
    const newStatus = currentStatus ? "active" : "blocked";
    const actionText = currentStatus ? "Unblock" : "Block";

    const agreed = await confirm(`Are you sure you want to ${actionText} this customer?`);
    if (agreed) {
        try {
            await db.collection("users").doc(id).update({ status: newStatus });
        } catch (e) {
            alert("Error: " + e.message);
        }
    }
};

// --- Delete Customer --- 🟢 async confirm fix
window.deleteUser = async function(id) {
    const agreed = await confirm("Are you sure you want to delete this customer?");
    if (agreed) {
        try {
            await db.collection("users").doc(id).delete();
            alert("Customer deleted successfully!");
        } catch (e) {
            alert("Error deleting: " + e.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', loadCustomers);