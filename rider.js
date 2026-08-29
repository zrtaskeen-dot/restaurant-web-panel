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

const FIREBASE_API_KEY = 'AIzaSyCwstpeM4MkOs9aNkh9faJQm-1jggbMZZE';

let editId = null;

// --- ACTIVITY LOG HELPER ---
// NOTE: performedBy is picked from localStorage first (adjust the key name below
// to whatever your login flow actually stores, e.g. 'admin_name' / 'user_name'),
// falling back to a generic "Admin" label. (This file uses the REST Identity
// Toolkit API instead of the Firebase Auth SDK, so there's no auth.currentUser
// to fall back on here — localStorage is the only source.)
function logActivity(action, details) {
    try {
        db.collection("system_log").add({
            action,
            role: "Admin",
            branch:       "",
            details,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        }).catch((err) => console.error("System log write failed:", err));
    } catch (err) {
        console.error("System log error:", err);
    }
}

// --- CREATE USER IN FIREBASE AUTHENTICATION ---
async function createAuthUser(email, password) {
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    // Verification email bhejo
    await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken: data.idToken })
        }
    );

    return data.localId;
}

// --- DYNAMIC BRANCHES LOADER FOR DROPDOWN ---
async function loadBranchDropdown(selectedBranchId = null) {
    const branchDropdown = document.getElementById('riderBranchSelect');
    if (!branchDropdown) return;

    try {
        branchDropdown.innerHTML = '<option value="">Loading Branches...</option>';
        const snapshot = await db.collection("restaurant_info").get();
        branchDropdown.innerHTML = '<option value="">Select Associated Branch</option>';

        if (snapshot.empty) {
            branchDropdown.innerHTML = '<option value="">No Branches Available</option>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const isSelected = (selectedBranchId === doc.id) ? 'selected' : '';
            const actualBranchName = data.branchName || "Unnamed Branch";
            branchDropdown.innerHTML += `
                <option value="${doc.id}" data-name="${actualBranchName}" ${isSelected}>
                    ${actualBranchName}
                </option>`;
        });
    } catch (error) {
        console.error("Error loading branches:", error);
        branchDropdown.innerHTML = '<option value="">Error loading branches</option>';
    }
}

// --- MODAL FUNCTIONS ---
window.openModal = async function () {
    document.getElementById('riderModal').style.display = 'block';
    document.querySelector('.modal-header').innerText = "Register New Rider";
    editId = null;
    await loadBranchDropdown();
};

window.closeModal = function () {
    document.getElementById('riderModal').style.display = 'none';
    document.getElementById('riderForm').reset();
    editId = null;
};

// --- SAVE / UPDATE RIDER ---
document.getElementById('riderForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name     = document.getElementById('riderName').value.trim();
    const email    = document.getElementById('riderEmail').value.trim();
    const password = document.getElementById('riderPassword').value.trim();
    const phone    = document.getElementById('riderPhone').value.trim();
    const cnic     = document.getElementById('riderCnic').value.trim();

    const branchSelect   = document.getElementById('riderBranchSelect');
    const branchId       = branchSelect ? branchSelect.value : "";
    const selectedOption = branchSelect ? branchSelect.options[branchSelect.selectedIndex] : null;
    const branchName     = selectedOption ? selectedOption.getAttribute('data-name') : "";

    // 🟢 Phone validation — exactly 11 digits
    if (!/^\d{11}$/.test(phone)) {
        alert("Phone number must be exactly 11 digits!");
        return;
    }

    // 🟢 CNIC validation — XXXXX-XXXXXXX-X format
    if (!/^\d{5}-\d{7}-\d{1}$/.test(cnic)) {
        alert("CNIC format must be: XXXXX-XXXXXXX-X");
        return;
    }

    if (!branchId) { alert("Please select a branch for this rider!"); return; }

    const saveBtn = document.querySelector('.btn-save');
    if (saveBtn) { saveBtn.innerText = "Saving..."; saveBtn.disabled = true; }

    try {
        if (editId) {
            // --- EDIT MODE ---
            const updateData = {
                name, email, phone, cnic,
                branchId, branchName,
                updatedAt: Date.now()
            };
            if (password) updateData.password = password;

            await db.collection("users").doc(editId).update(updateData);
            alert("Rider Updated Successfully!");
            logActivity("Rider Updated", `Updated details for rider "${name}" (branch: ${branchName || '-'})`);

        } else {
            // --- ADD MODE ---
            let uid = null;
            try {
                uid = await createAuthUser(email, password);
            } catch (authErr) {
                alert("Auth Error: " + authErr.message + "\n\nCommon reasons: email already exists, weak password.");
                return;
            }

            const riderData = {
                uid, name, email, password,
                phone, cnic,
                branchId, branchName,
                role: "rider",
                roleId: "R002",
                emailVerified: false,
                isAvailable: false,
                totalOrders: 0,
                delivered: 0,
                pending: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            await db.collection("users").doc(uid).set(riderData);
            alert(`Rider registered successfully!\n\nVerification email sent to:\n${email}`);
            logActivity("Rider Added", `New rider "${name}" registered for branch "${branchName || '-'}"`);
        }

        closeModal();
    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        if (saveBtn) { saveBtn.innerText = "Save"; saveBtn.disabled = false; }
    }
});

// --- REAL-TIME RIDERS LIST ---
db.collection("users")
    .where("role", "==", "rider")
    .onSnapshot((snapshot) => {
        const list = document.getElementById('rider-list');
        if (!list) return;
        list.innerHTML = '';

        if (snapshot.empty) {
            list.innerHTML = '<p style="padding: 20px; text-align: center;">No riders registered yet.</p>';
            return;
        }

        snapshot.forEach((doc) => {
            const r = doc.data();
            const id = doc.id;
            const branchDisplay = r.branchName || "Not Assigned";

            const verifiedBadge = r.emailVerified
                ? `<span style="color:#28a745; font-size:11px; font-weight:bold;">✔ Verified</span>`
                : `<span style="color:#b52a00; font-size:11px; font-weight:bold;">✘ Not Verified</span>`;

            list.innerHTML += `
                <div class="rider-row">
                    <span>${r.name || '-'}</span>
                    <span>${r.email || '-'} ${verifiedBadge}</span>
                    <span>********</span>
                    <span>${r.phone || '-'}</span>
                    <span>${r.cnic || '-'}</span>
                    <span class="rider-branch-text">${branchDisplay}</span>
                    <div class="rider-actions">
                        <button class="btn-edit-t" onclick="editRider('${id}')">Edit</button>
                        <button class="btn-delete-t" onclick="deleteRider('${id}')">Delete</button>
                    </div>
                </div>`;
        });
    }, (err) => {
        console.error("Firestore error:", err);
        const list = document.getElementById('rider-list');
        if (list) list.innerHTML = '<p style="padding: 20px; text-align: center; color:red;">Error: ' + err.message + '</p>';
    });

// --- EDIT RIDER ---
window.editRider = async (id) => {
    try {
        const doc = await db.collection("users").doc(id).get();
        if (doc.exists) {
            const r = doc.data();
            editId = id;

            document.getElementById('riderName').value     = r.name     || "";
            document.getElementById('riderEmail').value    = r.email    || "";
            document.getElementById('riderPassword').value = r.password || "";
            document.getElementById('riderPhone').value    = r.phone    || "";
            document.getElementById('riderCnic').value     = r.cnic     || "";

            await loadBranchDropdown(r.branchId);

            document.querySelector('.modal-header').innerText = "Edit Rider";
            document.getElementById('riderModal').style.display = 'block';
        }
    } catch (error) {
        console.log("Error fetching rider:", error);
    }
};

// --- DELETE RIDER ---
window.deleteRider = async (id) => {
    if (confirm("Are you sure you want to delete this rider?")) {
        try {
            const doc = await db.collection("users").doc(id).get();
            const rData = doc.exists ? doc.data() : {};

            await db.collection("users").doc(id).delete();
            alert("Rider deleted successfully.");
            logActivity("Rider Removed", `Rider "${rData.name || id}" (branch: ${rData.branchName || '-'}) removed`);
        } catch (error) {
            alert("Error: " + error.message);
        }
    }
};
// 🟢 CNIC auto format — XXXXX-XXXXXXX-X
document.getElementById('riderCnic').addEventListener('input', function(e) {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length > 5) val = val.slice(0,5) + '-' + val.slice(5);
    if (val.length > 13) val = val.slice(0,13) + '-' + val.slice(13);
    if (val.length > 15) val = val.slice(0,15);
    e.target.value = val;
});
window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('riderModal')) closeModal();
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