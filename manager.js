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

let editManagerId = null; 

// --- ACTIVITY LOG HELPER ---
// NOTE: performedBy is picked from localStorage first (adjust the key name below
// to whatever your login flow actually stores, e.g. 'admin_name' / 'user_name'),
// falling back to the signed-in auth email, then to a generic "Admin" label.
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

// --- MODAL CONTROLS ---
window.openManagerModal = function() {
    editManagerId = null;
    document.querySelector('.modal-header').innerText = "Add Manager";
    document.getElementById('managerForm').reset();
    document.getElementById('managerModal').style.display = 'block';
};

window.closeManagerModal = function() {
    document.getElementById('managerModal').style.display = 'none';
    document.getElementById('managerForm').reset();
    editManagerId = null;
};

// --- READ / REAL-TIME FETCH DATA ---
db.collection("users")
    .where("role", "==", "manager")
    .onSnapshot((snapshot) => {
    const listContainer = document.getElementById('manager-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    if(snapshot.empty) {
        listContainer.innerHTML = '<p style="padding: 20px; text-align: center;">No managers registered yet.</p>';
        return;
    }

    snapshot.forEach((doc) => {
        const m = doc.data();
        const id = doc.id;

        const verifiedBadge = m.emailVerified
            ? `<span style="color:#28a745; font-size:11px; font-weight:bold;">✔ Verified</span>`
            : `<span style="color:#b52a00; font-size:11px; font-weight:bold;">✘ Not Verified</span>`;
        
        listContainer.innerHTML += `
            <div class="manager-row">
                <span>${m.name || '-'}</span>
                <span>${m.email || '-'}<br>${verifiedBadge}</span>
                <span>********</span> 
                <span>${m.phone || '-'}</span>
                <span>${m.cnic || '-'}</span>
                <span style="font-weight: bold; color: #b52a00;">${m.branch || 'Not Assigned'}</span> 
                <div class="manager-actions">
                    <button class="btn-edit-t" onclick="editManager('${id}')">Edit</button>
                    <button class="btn-delete-t" onclick="deleteManager('${id}')">Delete</button>
                </div>
            </div>
        `;
    });
}, (error) => {
    console.error("Firestore read error:", error);
});

// --- CREATE & UPDATE FUNCTION ---
document.getElementById('managerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const mName     = document.getElementById('managerName').value;
    const mEmail    = document.getElementById('managerEmail').value.trim();
    const mPassword = document.getElementById('managerPassword').value;
    const mPhone    = document.getElementById('managerPhone').value;
    const mCnic     = document.getElementById('managerCnic').value.trim();
    const mBranch   = document.getElementById('managerBranch').value.trim(); 

    // 🟢 Phone 11 digit check
    if (mPhone.length !== 11) {
        alert("Phone number must be exactly 11 digits!");
        return;
    }

    if (!mBranch) {
        alert("Please enter a branch name!");
        return;
    }

    const regBtn = document.getElementById('regBtn');
    if(regBtn) { regBtn.innerText = "Processing..."; regBtn.disabled = true; }

    // Capture the admin's identity BEFORE any auth-state switching happens below
    // (creating the manager's auth account temporarily swaps auth.currentUser).
    const adminPerformer = localStorage.getItem('admin_name')
        || localStorage.getItem('user_name')
        || (auth.currentUser ? auth.currentUser.email : null)
        || 'Admin';

    try {
        if (editManagerId) {
            // --- EDIT MODE ---
            const updatedData = {
                name: mName,
                email: mEmail,
                password: mPassword,
                phone: mPhone,
                cnic: mCnic,
                branch: mBranch,
                updatedAt: Date.now()
            };
            await db.collection("users").doc(editManagerId).update(updatedData);
            alert("Manager Records Updated Successfully!");
            logActivity("Manager Updated", `Updated details for manager "${mName}" (branch: ${mBranch})`, adminPerformer);
            closeManagerModal();

        } else {
            // --- NEW ENTRY MODE ---

            // 🟢 STEP 1: Check karo ke ye branch already kisi manager ko assign to nahi
            const branchCheck = await db.collection("users")
                .where("role", "==", "manager")
                .where("branch", "==", mBranch)
                .get();

            if (!branchCheck.empty) {
                alert(`Branch "${mBranch}" is already assigned to another manager.\n\nEach branch can only have one manager.`);
                if(regBtn) { regBtn.innerText = "Register Manager"; regBtn.disabled = false; }
                return;
            }

            // Step 2: Firebase Auth mein account banao
            const userCredential = await auth.createUserWithEmailAndPassword(mEmail, mPassword);
            const newUser = userCredential.user;
            const userUid = newUser.uid;

            // Step 3: Verification email bhejo
            await newUser.sendEmailVerification();

            // Step 4: restaurant_info mein check karo ke same branch already exist to nahi karti
            const existingBranch = await db.collection("restaurant_info")
                .where("branchName", "==", mBranch)
                .get();

            let automaticBranchId = "";
            let branchWasCreated = false;
            if (!existingBranch.empty) {
                automaticBranchId = existingBranch.docs[0].id;
            } else {
                const branchDocRef = await db.collection("restaurant_info").add({
                    branchName: mBranch,
                    createdAt: Date.now()
                });
                automaticBranchId = branchDocRef.id;
                branchWasCreated = true;
            }

            // Step 5: Firestore mein manager data save karo
            const managerData = {
                uid: userUid,
                name: mName,
                email: mEmail,
                password: mPassword,
                phone: mPhone,
                cnic: mCnic,
                branch: mBranch,              
                branchId: automaticBranchId,  
                role: "manager",
                roleId: "R003",
                emailVerified: false,
                createdAt: Date.now()
            };
            await db.collection("users").doc(userUid).set(managerData);

            // Log the branch creation (if any) and the manager registration
            if (branchWasCreated) {
                logActivity("Branch Added", `New branch "${mBranch}" created`, adminPerformer);
            }
            logActivity("Manager Added", `New manager "${mName}" registered for branch "${mBranch}"`, adminPerformer);

            // Step 6: Admin ka session logout karo
            await auth.signOut();

            alert(`Manager registered successfully!\n\nVerification email sent to:\n${mEmail}`);
            closeManagerModal();
        }
    } catch (error) {
        console.error("Critical Process Failure:", error);
        alert("Operation Failed!\nReason: " + error.message);
    } finally {
        if(regBtn) { regBtn.innerText = "Register Manager"; regBtn.disabled = false; }
    }
});

// --- EDIT FUNCTION ---
window.editManager = function(id) {
    db.collection("users").doc(id).get()
        .then((doc) => {
            if (doc.exists) {
                const m = doc.data();
                editManagerId = id; 

                document.getElementById('managerName').value     = m.name     || '';
                document.getElementById('managerEmail').value    = m.email    || '';
                document.getElementById('managerPassword').value = m.password || '';
                document.getElementById('managerPhone').value    = m.phone    || '';
                document.getElementById('managerCnic').value     = m.cnic     || '';
                document.getElementById('managerBranch').value   = m.branch   || ''; 

                document.querySelector('.modal-header').innerText = "Update Manager Details";
                document.getElementById('managerModal').style.display = 'block';
            }
        })
        .catch((error) => {
            console.error("Edit load error:", error);
        });
};

// --- DELETE FUNCTION ---
window.deleteManager = function(id) {
    if(confirm("Are you sure you want to remove this manager?")) {
        db.collection("users").doc(id).get()
            .then((doc) => {
                const mData = doc.exists ? doc.data() : {};
                return db.collection("users").doc(id).delete().then(() => {
                    alert("Manager Removed Successfully!");
                    logActivity("Manager Removed", `Manager "${mData.name || id}" (branch: ${mData.branch || '-'}) removed`);
                });
            })
            .catch((error) => {
                alert("Error removing data: " + error.message);
            });
    }
};

window.addEventListener('click', function(e) {
    const modal = document.getElementById('managerModal');
    if (e.target === modal) closeManagerModal();
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