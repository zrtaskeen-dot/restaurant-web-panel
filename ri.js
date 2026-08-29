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

// Global variable edit mode track karne ke liye
let editId = null;

// Modal Functions
window.openModal = function() { 
    editId = null; // Reset edit ID
    document.querySelector('.modal-header').innerText = "Add Rider";
    document.getElementById('riderForm').reset();
    document.getElementById('riderModal').style.display = 'block'; 
};

window.closeModal = function() { 
    document.getElementById('riderModal').style.display = 'none'; 
    document.getElementById('riderForm').reset();
    editId = null;
};

// --- SAVE & UPDATE FUNCTION ---
document.getElementById('riderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const riderData = {
        name: document.getElementById('riderName').value,
        email: document.getElementById('riderEmail').value,
        password: document.getElementById('riderPassword').value,
        phone: document.getElementById('riderPhone').value,
        updatedAt: Date.now()
    };

    try {
        if (editId) {
            // Agar editId hai to UPDATE karein
            await db.collection("riders").doc(editId).update(riderData);
            alert("Rider Updated Successfully!");
        } else {
            // Warna Naya ADD karein
            riderData.createdAt = Date.now();
            await db.collection("riders").add(riderData);
            alert("Rider Added Successfully!");
        }
        closeModal();
    } catch (error) {
        alert("Error: " + error.message);
    }
});

// --- REAL-TIME DATA LOAD (With Password Masking) ---
db.collection("riders").orderBy("updatedAt", "desc").onSnapshot((snapshot) => {
    const list = document.getElementById('rider-list');
    list.innerHTML = '';
    
    snapshot.forEach((doc) => {
        const r = doc.data();
        const id = doc.id;
        
        list.innerHTML += `
            <div class="rider-row">
                <span>${r.name || '-'}</span>
                <span>${r.email || '-'}</span>
                <span>••••••••</span> <!-- Password hamesha dots mein dikhayega -->
                <span>${r.phone || '-'}</span>
                <div class="rider-actions">
                    <button class="btn-edit-t" onclick="editRider('${id}')">Edit</button>
                    <button class="btn-delete-t" onclick="deleteRider('${id}')">Delete</button>
                </div>
            </div>
        `;
    });
});

// --- EDIT FUNCTION (Sahi logic) ---
window.editRider = async (id) => {
    try {
        const doc = await db.collection("riders").doc(id).get();
        if (doc.exists) {
            const r = doc.data();
            editId = id; // ID save karlein update ke liye

            // Modal mein values bharna
            document.getElementById('riderName').value = r.name;
            document.getElementById('riderEmail').value = r.email;
            document.getElementById('riderPassword').value = r.password;
            document.getElementById('riderPhone').value = r.phone;

            // UI change karein
            document.querySelector('.modal-header').innerText = "Edit Rider";
            document.getElementById('riderModal').style.display = 'block';
        }
    } catch (error) {
        console.log("Error fetching rider:", error);
    }
};

// Delete Function
window.deleteRider = async (id) => {
    if(confirm("Are you sure you want to delete?")) {
        try {
            await db.collection("riders").doc(id).delete();
            alert("Rider Deleted!");
        } catch (error) {
            alert("Error: " + error.message);
        }
    }
};