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
const RIDER_ROLE_ID = "R002";
let editId = null;
const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'hotmail.com', 'live.com', 'yahoo.com'];
function logActivity(action, details) {
    try {
        const logData = {
            action,
            performedBy: "Admin",  
            details,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        db.collection("system_log").add(logData)
            .catch(err => console.error("system_log error:", err));

        db.collection("activity_logs").add(logData)
            .catch(err => console.error("activity_logs error:", err));

    } catch (err) {
        console.error("Log error:", err);
    }
}
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

    // Verification email 
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

//  DYNAMIC BRANCHES LOADER FOR DROPDOWN 
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

// MODAL FUNCTIONS 
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
    const emailGroup    = document.getElementById('riderEmail').closest('.input-group');
    const passwordGroup = document.getElementById('riderPassword').closest('.input-group');
       if (emailGroup)    emailGroup.style.display    = 'block';
    if (passwordGroup) passwordGroup.style.display = 'block';

    document.getElementById('riderEmail').required    = true;
    document.getElementById('riderPassword').required = true;
};

// SAVE and UPDATE RIDER 
document.getElementById('riderForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name     = document.getElementById('riderName').value.trim();
    const mEmail = document.getElementById('managerEmail').value.trim().toLowerCase();
    const password = document.getElementById('riderPassword').value.trim();
    const phone    = document.getElementById('riderPhone').value.trim();
    const cnic     = document.getElementById('riderCnic').value.trim();

    const branchSelect   = document.getElementById('riderBranchSelect');
    const branchId       = branchSelect ? branchSelect.value : "";
    const selectedOption = branchSelect ? branchSelect.options[branchSelect.selectedIndex] : null;
    const branchName     = selectedOption ? selectedOption.getAttribute('data-name') : "";

    // Email format check
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mEmail)) {
    alert("Please enter a valid email address.");
    return;
}
// Email domain check
const emailDomain = mEmail.split('@')[1].toLowerCase();
if (!ALLOWED_EMAIL_DOMAINS.includes(emailDomain)) {
    alert("Only these email providers are allowed:\n• @gmail.com\n• @hotmail.com\n• @live.com\n• @yahoo.com");
    return;
}

    // Password 
    if (!editId || password) {
        const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_#^])[A-Za-z\d@$!%*?&_#^]{8,}$/;
        if (!passRegex.test(password)) {
            alert("Password must be at least 8 characters and include:\n• One uppercase letter (A-Z)\n• One lowercase letter (a-z)\n• One number (0-9)\n• One special character (@$!%*?&_#^)");
            return;
        }
    }

       // Phone 
    if (!/^\+92\d{10}$/.test(phone)) {
        alert("Phone number must be in +92 format!\nExample: +923001234567");
        return;
    }

    //CNIC validation 
    if (!/^\d{5}-\d{7}-\d{1}$/.test(cnic)) {
        alert("CNIC format must be: XXXXX-XXXXXXX-X");
        return;
    }

    if (!branchId) { alert("Please select a branch for this rider!"); return; }

    const saveBtn = document.querySelector('.btn-save');
    if (saveBtn) { saveBtn.innerText = "Saving..."; saveBtn.disabled = true; }

    try {
        // 🟢 Phone uniqueness check
        const phoneSnap = await db.collection("users").where("phone", "==", phone).get();
        const phoneDuplicate = phoneSnap.docs.some(doc => doc.id !== editId);
        if (phoneDuplicate) {
            alert("This phone number is already registered. Each rider must have a unique phone number.");
            if (saveBtn) { saveBtn.innerText = "Save"; saveBtn.disabled = false; }
            return;
        }

        // 🟢 CNIC uniqueness check
        const cnicSnap = await db.collection("users").where("cnic", "==", cnic).get();
        const cnicDuplicate = cnicSnap.docs.some(doc => doc.id !== editId);
        if (cnicDuplicate) {
            alert("This CNIC is already registered. Each rider must have a unique CNIC.");
            if (saveBtn) { saveBtn.innerText = "Save"; saveBtn.disabled = false; }
            return;
        }

        if (editId) {
            const updateData = {
                name, email, phone, cnic,
                branchId, branchName,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await db.collection("users").doc(editId).update(updateData);
            alert("Rider Updated Successfully!");

        } else {
            // --- ADD 
            let uid = null;
            try {
                uid = await createAuthUser(email, password);
            } catch (authErr) {
                alert("Auth Error: " + authErr.message + "\n\nCommon reasons: email already exists, weak password.");
                return;
            }

            const riderData = {
                 name, email,
                phone, cnic,
                branchId, branchName,
                roleId: RIDER_ROLE_ID,
                emailVerified: false,
                isAvailable: false,
                totalOrders: 0,
                delivered: 0,
                pending: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
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

db.collection("users")
    .where("roleId", "==", RIDER_ROLE_ID)
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
        <span>${r.email || '-'}<br>${verifiedBadge}</span>
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

// --- EDIT RIDER 
window.editRider = async (id) => {
    try {
        const doc = await db.collection("users").doc(id).get();
        if (doc.exists) {
            const r = doc.data();
            editId = id;

            document.getElementById('riderName').value     = r.name     || "";
            document.getElementById('riderEmail').value    = r.email    || "";
            document.getElementById('riderPassword').value = "";
                        let ph = r.phone || "";
            if (/^0\d{10}$/.test(ph)) ph = "+92" + ph.slice(1);   
            document.getElementById('riderPhone').value    = ph || "+92";
            document.getElementById('riderCnic').value     = r.cnic     || "";

            await loadBranchDropdown(r.branchId);

            const emailGroup    = document.getElementById('riderEmail').closest('.input-group');
            const passwordGroup = document.getElementById('riderPassword').closest('.input-group');
            if (emailGroup)    emailGroup.style.display    = 'none';
            if (passwordGroup) passwordGroup.style.display = 'none';

            document.getElementById('riderEmail').required    = false;
            document.getElementById('riderPassword').required = false;

            document.querySelector('.modal-header').innerText = "Edit Rider";
            document.getElementById('riderModal').style.display = 'block';
        }
    } catch (error) {
        console.log("Error fetching rider:", error);
    }
};

// --- DELETE RIDER
window.deleteRider = async (id) => {
    const agreed = await confirm("Are you sure you want to delete this rider?");
    if (agreed) {
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

document.getElementById('riderCnic').addEventListener('input', function(e) {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length > 5) val = val.slice(0,5) + '-' + val.slice(5);
    if (val.length > 13) val = val.slice(0,13) + '-' + val.slice(13);
    if (val.length > 15) val = val.slice(0,15);
    e.target.value = val;
});

document.getElementById('riderPhone').addEventListener('input', function (e) {
    let raw = e.target.value;
    if (raw.startsWith('+92')) raw = raw.slice(3);
    let val = raw.replace(/\D/g, '');
    if (val.startsWith('0')) val = val.slice(1);
    if (val.startsWith('92') && val.length > 10) val = val.slice(2);
    val = val.slice(0, 10);
    e.target.value = '+92' + val;
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