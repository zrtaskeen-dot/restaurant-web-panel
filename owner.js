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
const auth = firebase.auth();
const db = firebase.firestore();

let editOwnerId = null;

// --- ACTIVITY LOG HELPER ---
function logActivity(action, details) {
    try {
        db.collection("system_log").add({
            action,
            role: "Admin",
            branch: "",
            details,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        }).catch((err) => console.error("System log write failed:", err));
    } catch (err) {
        console.error("System log error:", err);
    }
}

// --- MODAL CONTROLS ---
window.openownerModal = function() {
    editOwnerId = null;
    document.querySelector('.modal-header').innerText = "Add Owner";
    document.getElementById('ownerForm').reset();
    document.getElementById('ownerModal').style.display = 'block';
};

window.closeownerModal = function() {
    document.getElementById('ownerModal').style.display = 'none';
    document.getElementById('ownerForm').reset();
    editOwnerId = null;
};

// --- READ / REAL-TIME FETCH DATA ---
db.collection("users")
    .where("role", "==", "owner")
    .onSnapshot((snapshot) => {
    const listContainer = document.getElementById('owner-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (snapshot.empty) {
        listContainer.innerHTML = '<p style="padding: 20px; text-align: center;">No owners registered yet.</p>';
        return;
    }

    snapshot.forEach((doc) => {
        const o = doc.data();
        const id = doc.id;

        const verifiedBadge = o.emailVerified
            ? `<span style="color:#28a745; font-size:11px; font-weight:bold;">✔ Verified</span>`
            : `<span style="color:#b52a00; font-size:11px; font-weight:bold;">✘ Not Verified</span>`;

        listContainer.innerHTML += `
            <div class="owner-row">
                <span>${o.name || '-'}</span>
                <span>${o.email || '-'}<br>${verifiedBadge}</span>
                <span>********</span>
                <span>${o.phone || '-'}</span>
                <div class="owner-actions">
                    <button class="btn-edit-t" onclick="editOwner('${id}')">Edit</button>
                    <button class="btn-delete-t" onclick="deleteOwner('${id}')">Delete</button>
                </div>
            </div>
        `;
    });
}, (error) => {
    console.error("Firestore read error:", error);
});

// --- CREATE & UPDATE FUNCTION ---
document.getElementById('ownerForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const oName     = document.getElementById('ownerName').value.trim();
    const oEmail    = document.getElementById('ownerEmail').value.trim();
    const oPassword = document.getElementById('ownerPassword').value;
    const oPhone    = document.getElementById('ownerPhone').value.trim();

    // 🟢 Name check
    if (!oName || oName.length < 2) {
        alert("Please enter a valid name (at least 2 characters).");
        return;
    }

    // 🟢 Email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(oEmail)) {
        alert("Please enter a valid email address.\nExample: user@example.com");
        return;
    }

    // 🟢 Password strength check (skip in edit mode if empty)
    if (!editOwnerId || oPassword) {
        const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_#^])[A-Za-z\d@$!%*?&_#^]{8,}$/;
        if (!passRegex.test(oPassword)) {
            alert("Password must be at least 8 characters and include:\n• One uppercase letter (A-Z)\n• One lowercase letter (a-z)\n• One number (0-9)\n• One special character (@$!%*?&_#^)");
            return;
        }
    }

    // 🟢 Phone 11 digit check
    if (!/^\d{11}$/.test(oPhone)) {
        alert("Phone number must be exactly 11 digits!");
        return;
    }

    const regBtn = document.getElementById('ownerRegBtn');
    if (regBtn) { regBtn.innerText = "Processing..."; regBtn.disabled = true; }

    const adminPerformer = localStorage.getItem('admin_name')
        || localStorage.getItem('user_name')
        || (auth.currentUser ? auth.currentUser.email : null)
        || 'Admin';

    try {
        // 🟢 Phone uniqueness check
        const phoneSnap = await db.collection("users").where("phone", "==", oPhone).get();
        const phoneDuplicate = phoneSnap.docs.some(doc => doc.id !== editOwnerId);
        if (phoneDuplicate) {
            alert("This phone number is already registered. Each owner must have a unique phone number.");
            if (regBtn) { regBtn.innerText = "Register Owner"; regBtn.disabled = false; }
            return;
        }

        if (editOwnerId) {
            // --- EDIT MODE ---
            await db.collection("users").doc(editOwnerId).update({
                name: oName,
                email: oEmail,
                password: oPassword,
                phone: oPhone,
                updatedAt: Date.now()
            });
            alert("Owner Records Updated Successfully!");
            logActivity("Owner Updated", `Updated details for owner "${oName}"`, adminPerformer);
            closeownerModal();

        } else {
            // --- NEW ENTRY MODE ---

            // Step 1: Firebase Auth account banao
            const userCredential = await auth.createUserWithEmailAndPassword(oEmail, oPassword);
            const newUser = userCredential.user;
            const userUid = newUser.uid;

            // Step 2: Verification email bhejo
            await newUser.sendEmailVerification();

            // Step 3: Firestore mein save karo
            await db.collection("users").doc(userUid).set({
                uid: userUid,
                name: oName,
                email: oEmail,
                password: oPassword,
                phone: oPhone,
                role: "owner",
                roleId: "R004",
                emailVerified: false,
                createdAt: Date.now()
            });

            logActivity("Owner Added", `New owner "${oName}" registered`, adminPerformer);

            // Step 4: Admin session logout
            await auth.signOut();

            alert(`Owner registered successfully!\n\nVerification email sent to:\n${oEmail}\n\nOwner cannot login until email is verified.`);
            closeownerModal();
        }

    } catch (error) {
        console.error("Critical Process Failure:", error);
        alert("Operation Failed!\nReason: " + error.message);
    } finally {
        if (regBtn) { regBtn.innerText = "Register Owner"; regBtn.disabled = false; }
    }
});

// --- EDIT FUNCTION ---
window.editOwner = async (id) => {
    try {
        const doc = await db.collection("users").doc(id).get();
        if (doc.exists) {
            const o = doc.data();
            editOwnerId = id;

            document.getElementById('ownerName').value     = o.name     || '';
            document.getElementById('ownerEmail').value    = o.email    || '';
            document.getElementById('ownerPassword').value = o.password || '';
            document.getElementById('ownerPhone').value    = o.phone    || '';

            document.querySelector('.modal-header').innerText = "Update Owner Details";
            document.getElementById('ownerModal').style.display = 'block';
        }
    } catch (error) {
        console.error("Fetch Error during Edit:", error);
    }
};

// --- DELETE FUNCTION --- 🟢 async confirm fix
window.deleteOwner = async (id) => {
    const agreed = await confirm("Are you sure you want to remove this owner?");
    if (agreed) {
        try {
            const doc = await db.collection("users").doc(id).get();
            const oData = doc.exists ? doc.data() : {};
            await db.collection("users").doc(id).delete();
            alert("Owner Removed Successfully!");
            logActivity("Owner Removed", `Owner "${oData.name || id}" removed`);
        } catch (error) {
            alert("Error removing data: " + error.message);
        }
    }
};

// Close modal on outside click
window.addEventListener('click', function(e) {
    const modal = document.getElementById('ownerModal');
    if (e.target === modal) closeownerModal();
});

function togglePass(id, icon) {
    const input = document.getElementById(id);
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}