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
const db   = firebase.firestore();

// 🟢 Toast function
function showToast(message, type = 'error') {
    const existing = document.getElementById('loginToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'loginToast';
    toast.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        background: ${type === 'success' ? '#28a745' : '#b52a00'};
        color: white;
        padding: 14px 22px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        font-family: 'Segoe UI', Arial, sans-serif;
        box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        z-index: 9999;
        max-width: 320px;
        line-height: 1.5;
        animation: slideIn 0.3s ease;
    `;
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { opacity: 0; transform: translateX(50px); }
            to   { opacity: 1; transform: translateX(0); }
        }
    `;
    document.head.appendChild(style);
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.4s';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
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

function resetLoginButton(button) {
    button.innerText = "Login";
    button.disabled  = false;
}

document.addEventListener("DOMContentLoaded", () => {
    localStorage.clear();

    // 🟢 Forgot Password link
    const forgotLink = document.getElementById('forgotPasswordLink');
    if (forgotLink) {
        forgotLink.addEventListener('click', function(e) {
            e.preventDefault();
            openForgotModal();
        });
    }

    // ✅ Send Reset Link
    const sendResetBtn = document.getElementById('sendResetBtn');
    if (sendResetBtn) {
        sendResetBtn.addEventListener('click', async function() {
            const email = document.getElementById('forgotEmail').value.trim();

            if (!email) {
                showToast("Please enter your email address.");
                return;
            }

            const managerCheck = await db.collection("users")
                .where("email", "==", email)
                .where("role",  "==", "manager")
                .get();

            if (managerCheck.empty) {
                showToast("No manager account found with this email address.");
                return;
            }

            sendResetBtn.innerText = "Sending...";
            sendResetBtn.disabled  = true;

            try {
                await auth.sendPasswordResetEmail(email);
                closeForgotModal();
                showToast("Password reset link sent! Please check your email inbox.", 'success');
            } catch (error) {
                let msg = "Failed to send reset link. Please try again.";
                if (error.code === 'auth/user-not-found')         msg = "No account found with this email address.";
                if (error.code === 'auth/invalid-email')          msg = "Invalid email format.";
                if (error.code === 'auth/network-request-failed') msg = "Network error. Please check your connection.";
                showToast(msg);
            } finally {
                sendResetBtn.innerText = "Send Reset Link";
                sendResetBtn.disabled  = false;
            }
        });
    }

    // 🟢 Eye toggle
    const eyeBtn = document.getElementById('eyeBtn');
    if (eyeBtn) {
        eyeBtn.addEventListener('click', function() {
            const input    = document.getElementById('loginPassword');
            const isHidden = input.type === 'password';
            input.type     = isHidden ? 'text' : 'password';
            document.getElementById('eyeIcon').innerHTML = isHidden
                ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                   <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                   <line x1="1" y1="1" x2="23" y2="23"/>`
                : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                   <circle cx="12" cy="12" r="3"/>`;
        });
    }

    // 🟢 Login Form
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const email    = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const loginBtn = document.getElementById('btnLogin');

        loginBtn.innerText = "Processing...";
        loginBtn.disabled  = true;

        // ✅ Step 1: Pehle email Firestore mein check karo
        try {
            const emailCheck = await db.collection("users")
                .where("email", "==", email)
                .where("role",  "==", "manager")
                .get();

            if (emailCheck.empty) {
                showToast("No manager account found with this email address.");
                resetLoginButton(loginBtn);
                return;
            }
        } catch (e) {
            showToast("Network error. Please check your connection.");
            resetLoginButton(loginBtn);
            return;
        }

        // ✅ Step 2: Email sahi hai — Firebase Auth se login karo
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;

            if (!user.emailVerified) {
                await auth.signOut();
                showToast("Email not verified. Please check your inbox and click the verification link.");
                resetLoginButton(loginBtn);
                return;
            }

            const managerSnapshot = await db.collection("users")
                .where("email", "==", user.email)
                .where("role",  "==", "manager")
                .get();

            if (!managerSnapshot.empty) {
                let dynamicBranchId   = "";
                let dynamicBranchName = "";
                let managerDocId      = "";
                let managerName       = "";

                managerSnapshot.forEach(doc => {
                    managerDocId      = doc.id;
                    dynamicBranchId   = doc.data().branchId;
                    dynamicBranchName = doc.data().branch || doc.data().branchName || "Assigned Branch";
                    managerName       = doc.data().name   || 'Manager';
                });

                if (dynamicBranchId) {
                    await db.collection("users").doc(managerDocId).update({
                        emailVerified: true
                    });

                    localStorage.setItem("active_branch_id",  dynamicBranchId);
                    localStorage.setItem("managerBranchId",   dynamicBranchId);
                    localStorage.setItem("managerBranchName", dynamicBranchName);
                    localStorage.setItem("manager_name",      managerName);
                    localStorage.setItem("user_role",         "Manager");

                    // ✅ Login log
                    const loginLog = {
                        action:       "Manager Login",
                        performed_by: managerName,
                        role:         "Manager",
                        branch:       dynamicBranchName,
                        details:      `Manager "${managerName}" logged in to branch "${dynamicBranchName}"`,
                        created_at:   firebase.firestore.FieldValue.serverTimestamp()
                    };
                    db.collection("system_log").add(loginLog).catch(err => console.error(err));
                    db.collection("activity_logs").add(loginLog).catch(err => console.error(err));

                    showToast("Login Successful!", 'success');
                    setTimeout(() => { window.location.href = "dashboard.html"; }, 1000);

                } else {
                    await auth.signOut();
                    showToast("No branch linked to this account. Please contact admin.");
                    resetLoginButton(loginBtn);
                }

            } else {
                await auth.signOut();
                showToast("Manager account not found. Please check your credentials.");
                resetLoginButton(loginBtn);
            }

        } catch (error) {
            console.error("Login Error:", error);

            let msg = "Incorrect password. Please try again.";

            if (error.code === 'auth/invalid-email') {
                msg = "Invalid email format.";
            } else if (error.code === 'auth/too-many-requests') {
                msg = "Too many attempts. Please wait and try again.";
            } else if (error.code === 'auth/network-request-failed') {
                msg = "Network error. Please check your connection.";
            } else if (error.code === 'auth/user-disabled') {
                msg = "This account has been disabled. Please contact admin.";
            }

            showToast(msg);
            resetLoginButton(loginBtn);
        }
    });
});