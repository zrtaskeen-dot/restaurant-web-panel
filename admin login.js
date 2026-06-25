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

// Admin ki pehchan — users/{uid}.roleId == "R005" (user_role collection mein R005 = admin).
const ADMIN_ROLE_ID = "R005";

// --- Toast ---
function showToast(message, type = 'error') {
    const toast = document.getElementById('adminToast');
    toast.innerText = message;
    toast.className = `toast ${type}`;
    setTimeout(() => { toast.className = 'toast hidden'; }, 15000);
}

// Forgot Password Modal
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

// Send Reset Link
// FIXED: login se pehle Firestore ko query karna band kar diya (security rules
// bina login ke users collection padhne nahi deti). Firebase Auth khud
// "auth/user-not-found" bata deta hai agar email maujood nahi.
document.getElementById('sendResetBtn').addEventListener('click', async function() {
    const email    = document.getElementById('forgotEmail').value.trim();
    const resetBtn = document.getElementById('sendResetBtn');

    if (!email) {
        showToast("Please enter your email address.");
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
// FIXED: pehle Firebase Auth se login, PHIR apna hi profile (users/{uid}) padh kar
// roleId check. Login se pehle Firestore ko touch nahi kiya jata.
document.getElementById('adminLoginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const email    = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const loginBtn = document.getElementById('btnAdminLogin');

    loginBtn.innerText = "Signing in...";
    loginBtn.disabled  = true;

    try {
        await auth.signOut().catch(() => {});

        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Sirf apna profile padhna (document ID = user ki UID)
        const adminSnap = await db.collection("users").doc(user.uid).get();

        if (!adminSnap.exists || adminSnap.data().roleId !== ADMIN_ROLE_ID) {
            // Debug info: shows exactly why access was refused
            const reason = !adminSnap.exists
                ? "No profile found. Create Firestore users document with ID: " + user.uid
                : "Profile found but roleId is '" + adminSnap.data().roleId + "' (needs R005)";
            console.log("LOGIN OK for email:", user.email, "| UID:", user.uid);
            console.log("ACCESS DENIED REASON:", reason);
            await auth.signOut();
            showToast(reason);
            loginBtn.innerText = "Login";
            loginBtn.disabled  = false;
            return;
        }

        // Login log
        const loginLog = {
            action:      "Admin Login",
            performedBy: "Admin",
            details:     "Admin logged in to the system",
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        };
        db.collection("system_log").add(loginLog).catch(err => console.error(err));

        showToast("Login successful! Redirecting...", "success");
        setTimeout(() => { window.location.href = "admin.html"; }, 1000);

    } catch (error) {
        console.error("Login Error:", error);

        // Unknown errors now show their real code so the actual cause is visible
        let msg = "Login failed (" + (error.code || error.message) + ")";
        if (error.code === 'auth/invalid-credential' ||
            error.code === 'auth/wrong-password' ||
            error.code === 'auth/user-not-found' ||
            error.code === 'auth/invalid-login-credentials')
                                                          msg = "Incorrect email or password. Please try again.";
        if (error.code === 'auth/invalid-email')          msg = "Invalid email format.";
        if (error.code === 'auth/too-many-requests')      msg = "Too many attempts. Please wait and try again.";
        if (error.code === 'auth/network-request-failed') msg = "Network error. Please check your connection.";
        if (error.code === 'auth/user-disabled')          msg = "This account has been disabled.";
        if (error.code === 'permission-denied')           msg = "Permission denied. Please contact support.";

        showToast(msg);
        loginBtn.innerText = "Login";
        loginBtn.disabled  = false;
    }
});