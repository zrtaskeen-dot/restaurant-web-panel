// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: 'AIzaSyCwstpeM4MkOs9aNkh9faJQm-1jggbMZZE',
    appId: '1:848662087857:web:0c1349bc37248181a0fa90',
    messagingSenderId: '848662087857',
    projectId: 'resturant-e0389',
    authDomain: 'resturant-e0389.firebaseapp.com',
};
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.firestore();

// --- Load Customers from Firebase ---
function loadCustomers() {
    const listContainer = document.getElementById('customer-list');

    // Real-time listener for 'users' collection
    db.collection("users").onSnapshot((snapshot) => {
        listContainer.innerHTML = ""; // Clear existing list

        snapshot.forEach((doc) => {
            const user = doc.data();
            const id = doc.id;

            const row = document.createElement('div');
            row.className = 'customer-row';
            row.innerHTML = `
                <span>${user.name || 'N/A'}</span>
                <span>${user.email || 'N/A'}</span>
                <span>********</span>
                <span>${user.address || 'N/A'}</span>
                <div class="actions-cell">
                    <button class="btn-action block-btn" onclick="blockUser('${id}')">Block</button>
                    <button class="btn-action delete-btn" onclick="deleteUser('${id}')">Delete</button>
                </div>
            `;
            listContainer.appendChild(row);
        });
    }, (error) => {
        console.error("Error fetching users: ", error);
    });
}

// --- Delete Function ---
async function deleteUser(id) {
    if (confirm("Are you sure you want to delete this customer?")) {
        try {
            await db.collection("users").doc(id).delete();
            alert("Customer deleted successfully!");
        } catch (e) {
            alert("Error deleting: " + e.message);
        }
    }
}

// --- Block Function ---
async function blockUser(id) {
    try {
        await db.collection("users").doc(id).update({
            status: "blocked"
        });
        alert("Customer has been blocked.");
    } catch (e) {
        alert("Error blocking: " + e.message);
    }
}

// Start fetching when page loads
document.addEventListener('DOMContentLoaded', loadCustomers);