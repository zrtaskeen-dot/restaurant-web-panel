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
function logActivity(action, details) {
    try {
        const logData = {
            action,
            performedBy: "Admin",  // ✅ sirf "Admin"
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

    const emailGroup = document.getElementById('managerEmail').closest('.input-group');
    const passwordGroup = document.getElementById('managerPassword').closest('.input-group');
    if (emailGroup) emailGroup.style.display = 'block';
    if (passwordGroup) passwordGroup.style.display = 'block';

    // 🟢 Hidden fields dobara required bana do (Add Manager ke liye)
    document.getElementById('managerEmail').required = true;
    document.getElementById('managerPassword').required = true;
};

// --- READ / REAL-TIME FETCH DATA ---
db.collection("users")
    .where("roleId", "==", "R003")
    .onSnapshot((snapshot) => {
        const listContainer = document.getElementById('manager-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        if (snapshot.empty) {
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
                    <span>${m.phone || '-'}</span>
                    <span>${m.cnic || '-'}</span>
                    <span style="font-weight: bold; color: #b52a00;">${m.branchName || 'Not Assigned'}</span>
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

    const mName = document.getElementById('managerName').value.trim();
    const mEmail = document.getElementById('managerEmail').value.trim();
    const mPassword = document.getElementById('managerPassword').value;
    const mPhone = document.getElementById('managerPhone').value.trim();
    const mCnic = document.getElementById('managerCnic').value.trim();
    const mBranch = document.getElementById('managerBranch').value.trim();

    // 🟢 Name check
    if (!mName || mName.length < 2) {
        alert("Please enter a valid name (at least 2 characters).");
        return;
    }

    // 🟢 Email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mEmail)) {
        alert("Please enter a valid email address.\nExample: user@example.com");
        return;
    }

    // 🟢 Password strength check (skip in edit mode if empty)
    if (!editManagerId || mPassword) {
        const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_#^])[A-Za-z\d@$!%*?&_#^]{8,}$/;
        if (!passRegex.test(mPassword)) {
            alert("Password must be at least 8 characters and include:\n• One uppercase letter (A-Z)\n• One lowercase letter (a-z)\n• One number (0-9)\n• One special character (@$!%*?&_#^)");
            return;
        }
    }

    // 🟢 Phone 11 digit check
    if (!/^\d{11}$/.test(mPhone)) {
        alert("Phone number must be exactly 11 digits!");
        return;
    }

    // 🟢 CNIC format check
    if (!/^\d{5}-\d{7}-\d{1}$/.test(mCnic)) {
        alert("CNIC format must be: XXXXX-XXXXXXX-X");
        return;
    }

    if (!mBranch) {
        alert("Please enter a branch name!");
        return;
    }

    const regBtn = document.getElementById('regBtn');
    if (regBtn) { regBtn.innerText = "Processing..."; regBtn.disabled = true; }

    const adminPerformer = localStorage.getItem('admin_name')
        || localStorage.getItem('user_name')
        || (auth.currentUser ? auth.currentUser.email : null)
        || 'Admin';

    try {
        // 🟢 Phone uniqueness check
        const phoneSnap = await db.collection("users").where("phone", "==", mPhone).get();
        const phoneDuplicate = phoneSnap.docs.some(doc => doc.id !== editManagerId);
        if (phoneDuplicate) {
            alert("This phone number is already registered. Each manager must have a unique phone number.");
            if (regBtn) { regBtn.innerText = "Register Manager"; regBtn.disabled = false; }
            return;
        }

        // 🟢 CNIC uniqueness check
        const cnicSnap = await db.collection("users").where("cnic", "==", mCnic).get();
        const cnicDuplicate = cnicSnap.docs.some(doc => doc.id !== editManagerId);
        if (cnicDuplicate) {
            alert("This CNIC is already registered. Each manager must have a unique CNIC.");
            if (regBtn) { regBtn.innerText = "Register Manager"; regBtn.disabled = false; }
            return;
        }

        if (editManagerId) {
            // --- EDIT MODE ---
            const updatedData = {
                name: mName,
                email: mEmail,
                phone: mPhone,
                cnic: mCnic,
                branchName: mBranch,
                updatedAt: Date.now()
            };
            await db.collection("users").doc(editManagerId).update(updatedData);

            // 🟢 Is manager ki asal branchId nikal lo, taake branch ka
            // naya naam sirf is manager tak mahdood na rahe
            const managerSnap = await db.collection("users").doc(editManagerId).get();
            const managerBranchId = managerSnap.exists ? managerSnap.data().branchId : null;

            if (managerBranchId) {
                // 🟢 restaurant_info (asal branch record) mein naam sync karo
                await db.collection("restaurant_info").doc(managerBranchId).set({
                    branchName: mBranch,
                    updatedAt: Date.now()
                }, { merge: true });

                // 🟢 Isi branchId se linked SAARE users (doosre managers,
                // riders) mein bhi branchName update kar do
                const linkedUsersSnap = await db.collection("users")
                    .where("branchId", "==", managerBranchId)
                    .get();

                if (!linkedUsersSnap.empty) {
                    const batch = db.batch();
                    linkedUsersSnap.forEach(userDoc => {
                        batch.update(userDoc.ref, { branchName: mBranch });
                    });
                    await batch.commit();
                }
            }

            alert("Manager Records Updated Successfully!");
            logActivity("Manager Updated", `Updated details for manager "${mName}" (branch: ${mBranch})`, adminPerformer);
            closeManagerModal();
        } else {
            // ✅ Case-insensitive branch check
            const branchSnap = await db.collection("users")
                .where("roleId", "==", "R003")
                .get();

            const branchDuplicate = branchSnap.docs.some(doc =>
                doc.data().branchName?.toLowerCase().trim() === mBranch.toLowerCase().trim()
            );

            if (branchDuplicate) {
                alert(`Branch "${mBranch}" is already assigned to another manager.`);
                if (regBtn) { regBtn.innerText = "Register Manager"; regBtn.disabled = false; }
                return;
            }

            // Firebase Auth account banao
            const userCredential = await auth.createUserWithEmailAndPassword(mEmail, mPassword);
            const newUser = userCredential.user;
            const userUid = newUser.uid;

            // Verification email
            await newUser.sendEmailVerification();

            // Branch check/create
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

            // Manager Data in Firebase
            const managerData = {
                uid: userUid,
                name: mName,
                email: mEmail,
                phone: mPhone,
                cnic: mCnic,
                branchName: mBranch,
                branchId: automaticBranchId,
                roleId: "R003",
                emailVerified: false,
                createdAt: Date.now()
            };
            await db.collection("users").doc(userUid).set(managerData);

            if (branchWasCreated) {
                logActivity("Branch Added", `New branch "${mBranch}" created`, adminPerformer);
            }
            logActivity("Manager Added", `New manager "${mName}" registered for branch "${mBranch}"`, adminPerformer);

            await auth.signOut();

            alert(`Manager registered successfully!\n\nVerification email sent to:\n${mEmail}`);
            closeManagerModal();
        }
    } catch (error) {
        console.error("Critical Process Failure:", error);
        alert("Operation Failed!\nReason: " + error.message);
    } finally {
        if (regBtn) { regBtn.innerText = "Register Manager"; regBtn.disabled = false; }
    }
});

window.editManager = function(id) {
    db.collection("users").doc(id).get()
        .then((doc) => {
            if (doc.exists) {
                const m = doc.data();
                editManagerId = id;

                document.getElementById('managerName').value = m.name || '';
                document.getElementById('managerEmail').value = m.email || '';
                document.getElementById('managerPassword').value = m.password || '';
                document.getElementById('managerPhone').value = m.phone || '';
                document.getElementById('managerCnic').value = m.cnic || '';
                document.getElementById('managerBranch').value = m.branchName || '';

                const emailGroup = document.getElementById('managerEmail').closest('.input-group');
                const passwordGroup = document.getElementById('managerPassword').closest('.input-group');
                if (emailGroup) emailGroup.style.display = 'none';
                if (passwordGroup) passwordGroup.style.display = 'none';

                // 🟢 Hidden fields ko required se hata do, warna hidden required
                // field ki wajah se form silently submit hona band ho jata hai
                document.getElementById('managerEmail').required = false;
                document.getElementById('managerPassword').required = false;

                document.querySelector('.modal-header').innerText = "Update Manager Details";
                document.getElementById('managerModal').style.display = 'block';
            }
        })
        .catch((error) => {
            console.error("Edit load error:", error);
        });
};

// --- DELETE FUNCTION --- 🟢 async confirm fix
window.deleteManager = async function(id) {
    const agreed = await confirm("Are you sure you want to remove this manager?");
    if (agreed) {
        try {
            const doc = await db.collection("users").doc(id).get();
            const mData = doc.exists ? doc.data() : {};

            await db.collection("users").doc(id).delete();

            alert("Manager Removed Successfully!");
            logActivity("Manager Removed", `Manager "${mData.name || id}" (branch: ${mData.branchName || '-'}) removed`);
        } catch (error) {
            alert("Error removing data: " + error.message);
        }
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
// --- BRANCH MANAGEMENT MODULE ---
const BRANCH_LINKED_COLLECTIONS = [
    "menu",
    "users",
    "orders",
    "carts",
    "notifications",
    "reviews",
    "toppings"
];

// --- READ / REAL-TIME FETCH BRANCHES ---
db.collection("restaurant_info")
    .onSnapshot((snapshot) => {
        const listContainer = document.getElementById('branch-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        if (snapshot.empty) {
            listContainer.innerHTML = '<p style="padding: 20px; text-align: center;">No branches found.</p>';
            return;
        }

        snapshot.forEach((doc) => {
            const b = doc.data();
            const id = doc.id;

            listContainer.innerHTML += `
                <div class="manager-row branch-row">
                    <span style="font-weight: bold; color: #b52a00;">${b.branchName || '-'}</span>
                    <span>${b.address || '-'}</span>
                    <span>${b.deliveryCharge || '-'}</span>
                    <span>${b.timing || '-'}</span>
                    <div class="manager-actions">
                        <button class="btn-delete-t" onclick="deleteBranch('${id}', '${(b.branchName || '').replace(/'/g, "\\'")}')">Delete</button>
                    </div>
                </div>
            `;
        });
    }, (error) => {
        console.error("Firestore branch read error:", error);
    });

// --- CASCADE DELETE A BRANCH + EVERYTHING LINKED TO IT ---
window.deleteBranch = async function(branchId, branchName) {
    const agreed = await confirm(
        `Are you sure you want to delete branch "${branchName}"?\n\n` +
        `This will delete ALL data linked to this branch. `
    );
    if (!agreed) return;

    try {
        let totalDeleted = 0;

        // Collect every doc ref linked to this branch, across all linked collections
        for (const colName of BRANCH_LINKED_COLLECTIONS) {
            const snap = await db.collection(colName)
                .where("branchId", "==", branchId)
                .get();

            if (snap.empty) continue;

            // Firestore batches are capped at 500 writes; chunk defensively at 450
            const docs = snap.docs;
            for (let i = 0; i < docs.length; i += 450) {
                const chunk = docs.slice(i, i + 450);
                const batch = db.batch();
                chunk.forEach(docSnap => batch.delete(docSnap.ref));
                await batch.commit();
                totalDeleted += chunk.length;
            }
        }

        // Finally delete the branch document itself
        await db.collection("restaurant_info").doc(branchId).delete();

        logActivity(
            "Branch Deleted",
            `Branch "${branchName}" deleted along with ${totalDeleted} linked record(s) ` +
            `across: ${BRANCH_LINKED_COLLECTIONS.join(", ")}`
        );

        alert(`Branch "${branchName}" and all linked data (${totalDeleted} records) removed successfully!`);

    } catch (error) {
        console.error("Branch cascade delete error:", error);
        alert("Error deleting branch: " + error.message);
    }
};