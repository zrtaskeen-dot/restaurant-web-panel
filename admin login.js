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
const db   = firebase.firestore();

// --- Toast ---
function showToast(message, type = 'error') {
    const toast = document.getElementById('adminToast');
    toast.innerText = message;
    toast.className = `toast ${type}`;
    setTimeout(() => { toast.className = 'toast hidden'; }, 4000);
}

// ✅ Forgot Password Modal
window.openForgotModal = function() {
    document.getElementById('forgotEmail').value = '';
    document.getElementById('forgotModal').style.display = 'flex';
};

window.closeForgotModal = function() {
    document.getElementById('forgotModal').style.display = 'none';
    document.getElementById('forgotEmail').value = '';
};

window.addEventListener('click', function(e) {
    const modal = document.getElementById('forgotModal');
    if (e.target === modal) closeForgotModal();
});

document.getElementById('forgotPasswordLink').addEventListener('click', function(e) {
    e.preventDefault();
    openForgotModal();
});

// ✅ Send Reset Link
document.getElementById('sendResetBtn').addEventListener('click', async function() {
    const email    = document.getElementById('forgotEmail').value.trim();
    const resetBtn = document.getElementById('sendResetBtn');

    if (!email) {
        showToast("Please enter your email address.");
        return;
    }

    // ✅ Check email in Firestore first
    const adminCheck = await db.collection("users")
        .where("email", "==", email)
        .where("role",  "==", "admin")
        .get();

    if (adminCheck.empty) {
        showToast("No admin account found with this email address.");
        return;
    }

    resetBtn.innerText = "Sending...";
    resetBtn.disabled  = true;

    try {
        await auth.sendPasswordResetEmail(email);
        closeForgotModal();
        showToast("Password reset link sent! Please check your email inbox.", "success");
    } catch (error) {
        let msg = "Failed to send reset link. Please try again.";
        if (error.code === 'auth/user-not-found')         msg = "No account found with this email address.";
        if (error.code === 'auth/invalid-email')          msg = "Invalid email format.";
        if (error.code === 'auth/network-request-failed') msg = "Network error. Please check your connection.";
        showToast(msg);
    } finally {
        resetBtn.innerText = "Send Reset Link";
        resetBtn.disabled  = false;
    }
});

// --- Eye Button ---
document.getElementById('eyeBtn').addEventListener('click', function() {
    const input    = document.getElementById('adminPassword');
    const isHidden = input.type === 'password';
    input.type     = isHidden ? 'text' : 'password';
    document.getElementById('eyeIcon').innerHTML = isHidden
        ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
           <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
           <line x1="1" y1="1" x2="23" y2="23"/>`
        : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
           <circle cx="12" cy="12" r="3"/>`;
});

// --- Login ---
document.getElementById('adminLoginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const email    = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const loginBtn = document.getElementById('btnAdminLogin');

    loginBtn.innerText = "Signing in...";
    loginBtn.disabled  = true;

    // ✅ Step 1: Pehle email Firestore mein check karo
    try {
        const emailCheck = await db.collection("users")
            .where("email", "==", email)
            .where("role",  "==", "admin")
            .get();

        if (emailCheck.empty) {
            showToast("No admin account found with this email address.");
            loginBtn.innerText = "Login";
            loginBtn.disabled  = false;
            return;
        }
    } catch (e) {
        showToast("Network error. Please check your connection.");
        loginBtn.innerText = "Login";
        loginBtn.disabled  = false;
        return;
    }

    // ✅ Step 2: Firebase Auth se login karo
    try {
        await auth.signOut().catch(() => {});

        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        const adminSnap = await db.collection("users")
            .where("email", "==", user.email)
            .where("role",  "==", "admin")
            .get();

        if (adminSnap.empty) {
            await auth.signOut();
            showToast("Access denied. This portal is for admins only.");
            loginBtn.innerText = "Login";
            loginBtn.disabled  = false;
            return;
        }

        // ✅ Login log
        const loginLog = {
            action:       "Admin Login",
            performed_by: "Admin",
            role:         "Admin",
            branch:       "",
            details:      "Admin logged in to the system",
            created_at:   firebase.firestore.FieldValue.serverTimestamp()
        };
        db.collection("system_log").add(loginLog).catch(err => console.error(err));

        showToast("Login successful! Redirecting...", "success");
        setTimeout(() => { window.location.href = "admin.html"; }, 1000);

    } catch (error) {
        console.error("Login Error:", error);

        let msg = "Incorrect password. Please try again.";
        if (error.code === 'auth/invalid-email')          msg = "Invalid email format.";
        if (error.code === 'auth/too-many-requests')      msg = "Too many attempts. Please wait and try again.";
        if (error.code === 'auth/network-request-failed') msg = "Network error. Please check your connection.";
        if (error.code === 'auth/user-disabled')          msg = "This account has been disabled.";

        showToast(msg);
        loginBtn.innerText = "Login";
        loginBtn.disabled  = false;
    }
});