// --- Manager Logout Function ---
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            const agreed = await confirm("Are you sure you want to logout?");
            if (agreed) {
                if (typeof firebase !== 'undefined' && firebase.auth) {
                    firebase.auth().signOut().then(() => {
                        localStorage.clear();
                        sessionStorage.clear();
                        window.location.href = "login.html";
                    }).catch(() => {
                        localStorage.clear();
                        sessionStorage.clear();
                        window.location.href = "login.html";
                    });
                } else {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.href = "login.html";
                }
            }
        });
    }
});