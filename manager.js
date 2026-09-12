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

            role:         "Admin",

            branch:       "",

            details,

            created_at: firebase.firestore.FieldValue.serverTimestamp()

        };



        // ✅ System log — admin dashboard ke liye

        db.collection("system_log").add(logData)

            .catch(err => console.error("system_log error:", err));



        // ✅ Activity log — owner app ke liye

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

    // 🟢 Fields wapas dikhao (next time Add Manager ke liye)
    const emailGroup    = document.getElementById('managerEmail').closest('.input-group');
    const passwordGroup = document.getElementById('managerPassword').closest('.input-group');
    if (emailGroup)    emailGroup.style.display    = 'block';
    if (passwordGroup) passwordGroup.style.display = 'block';
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

   

    const mName     = document.getElementById('managerName').value.trim();

    const mEmail    = document.getElementById('managerEmail').value.trim();

    const mPassword = document.getElementById('managerPassword').value;

    const mPhone    = document.getElementById('managerPhone').value.trim();

    const mCnic     = document.getElementById('managerCnic').value.trim();

    const mBranch   = document.getElementById('managerBranch').value.trim();



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

    if(regBtn) { regBtn.innerText = "Processing..."; regBtn.disabled = true; }



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

            if(regBtn) { regBtn.innerText = "Register Manager"; regBtn.disabled = false; }

            return;

        }



        // 🟢 CNIC uniqueness check

        const cnicSnap = await db.collection("users").where("cnic", "==", mCnic).get();

        const cnicDuplicate = cnicSnap.docs.some(doc => doc.id !== editManagerId);

        if (cnicDuplicate) {

            alert("This CNIC is already registered. Each manager must have a unique CNIC.");

            if(regBtn) { regBtn.innerText = "Register Manager"; regBtn.disabled = false; }

            return;

        }



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

           // ✅ Case-insensitive branch check
const branchSnap = await db.collection("users")
    .where("role", "==", "manager")
    .get();

const branchDuplicate = branchSnap.docs.some(doc => 
    doc.data().branch?.toLowerCase().trim() === mBranch.toLowerCase().trim()
);

if (branchDuplicate) {
    alert(`Branch "${mBranch}" is already assigned to another manager.`);
    if(regBtn) { regBtn.innerText = "Register Manager"; regBtn.disabled = false; }
    return;
}
            // Firebase Auth account banao
            const userCredential = await auth.createUserWithEmailAndPassword(mEmail, mPassword);
            const newUser = userCredential.user;
            const userUid = newUser.uid;
            // Verification email bhejo
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



            // Firestore mein manager data save karo

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
        if(regBtn) { regBtn.innerText = "Register Manager"; regBtn.disabled = false; }
    }
});



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

                // 🟢 Edit mode mein email aur password fields hide karo
                const emailGroup    = document.getElementById('managerEmail').closest('.input-group');
                const passwordGroup = document.getElementById('managerPassword').closest('.input-group');
                if (emailGroup)    emailGroup.style.display    = 'none';
                if (passwordGroup) passwordGroup.style.display = 'none';

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

            logActivity("Manager Removed", `Manager "${mData.name || id}" (branch: ${mData.branch || '-'}) removed`);

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