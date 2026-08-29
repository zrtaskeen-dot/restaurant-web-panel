// --- Admin Logout Function ---
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm("Are you sure you want to logout?")) {
                // Firebase Auth logout
                if (typeof firebase !== 'undefined' && firebase.auth) {
                    firebase.auth().signOut().then(() => {
                        localStorage.clear();
                        sessionStorage.clear();
                        window.location.href = "admin login.html";
                    }).catch(() => {
                        localStorage.clear();
                        sessionStorage.clear();
                        window.location.href = "admin login.html";
                    });
                } else {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.href = "admin login.html";
                }
            }
        });
    }
});