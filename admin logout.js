// --- Admin Logout Function --- 🟢 async confirm fix
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
            e.preventDefault();

            const agreed = await confirm("Are you sure you want to logout?");
            if (agreed) {
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