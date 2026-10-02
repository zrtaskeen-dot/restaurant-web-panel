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

const CUSTOMER_ROLE_ID = "R001";
// --- Load Customers ---
function loadCustomers() {
    const listContainer = document.getElementById('customer-list');
    listContainer.innerHTML = '<p style="padding:20px; text-align:center; color:#666;">Loading...</p>';

    db.collection("users")
    .onSnapshot((snapshot) => {
        listContainer.innerHTML = ""; 

        let count = 0;

        snapshot.forEach((doc) => {
            const user = doc.data();

            if (user.roleId !== CUSTOMER_ROLE_ID) return;

            // 🟢 Incomplete/empty records skip karo — jin ka na naam hai na email
            if (!user.name && !user.email) return;

            count++;
            const id = doc.id;
            const isBlocked = user.status === "blocked";

            const address = user.address || "N/A";

            // 🟢 Email verification badge
            const verifiedBadge = user.emailVerified
                ? `<span style="color:#28a745; font-size:11px; font-weight:bold;">✔ Verified</span>`
                : `<span style="color:#b52a00; font-size:11px; font-weight:bold;">✘ Not Verified</span>`;

            const row = document.createElement('div');
            row.className = `customer-row ${isBlocked ? 'blocked-row' : ''}`;
            
            row.innerHTML = `
                <span style="font-weight:500;">
                    ${user.name || 'N/A'} 
                    ${isBlocked ? '<span style="color:#b52a00; font-size:11px; font-weight:bold;">(Blocked)</span>' : ''}
                </span>
                <span style="color:#555;">
                    ${user.email || 'N/A'}<br>
                    ${verifiedBadge}
                </span>
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