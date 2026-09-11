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
const db = firebase.firestore();

const BRANCH_DOC_ID = localStorage.getItem("active_branch_id");

let allReviews = [];

// --- STAR GENERATOR ---
function generateStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        stars += i <= rating ? '⭐' : '☆';
    }
    return stars;
}

// --- DATE FORMAT ---
function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        day: 'numeric', month: 'short', year: 'numeric'
    });
}

// ✅ Go to order — orders.html par jao aur order highlight karo
window.goToOrder = function(orderId) {
    if (!orderId) return;
    // localStorage mein save karo
    localStorage.setItem("highlight_order_id", orderId);
    window.location.href = "orders.html";
};

// --- RENDER REVIEWS ---
function renderReviews(reviews) {
    const container = document.getElementById('reviewsList');

    if (reviews.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div style="font-size:48px;">📭</div>
                <p>No reviews found.</p>
            </div>`;
        return;
    }

    container.innerHTML = reviews.map(r => `
        <div class="review-card">
            <div class="review-card-top">
                <span class="stars">${generateStars(r.rating)}</span>
                <span class="rating-number">${r.rating}/5</span>
            </div>
            <p class="review-comment">"${r.comment || 'No comment provided.'}"</p>
            <div class="review-footer">

                <!-- ✅ Clickable Order ID -->
                <span 
                    class="order-id" 
                    onclick="goToOrder('${r.orderId}')"
                    title="Click to view this order"
                    style="cursor:pointer; text-decoration:underline; color:#b52a00;">
                    #${r.orderId ? r.orderId.slice(-6).toUpperCase() : 'N/A'}
                </span>

                <span class="review-date">${formatDate(r.createdAt)}</span>
            </div>
        </div>
    `).join('');
}

// --- FILTER REVIEWS ---
window.filterReviews = function(rating, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (rating === 'all') {
        renderReviews(allReviews);
    } else {
        renderReviews(allReviews.filter(r => r.rating === rating));
    }
};

// ✅ Sidebar badge — orders page par bhi dikhay
function updateOrdersBadge() {
    if (!BRANCH_DOC_ID) return;
    db.collection("orders")
        .where("branchId", "==", BRANCH_DOC_ID)
        .onSnapshot(snap => {
            let pendingCount = 0;
            snap.forEach(doc => {
                const status = (doc.data().order_status || doc.data().status || '').toLowerCase();
                if (status === 'pending') pendingCount++;
            });
            const links = document.querySelectorAll('.sidebar nav a');
            links.forEach(link => {
                if (link.textContent.trim().toLowerCase().includes('order')) {
                    let badge = document.getElementById('orders-badge');
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.id = 'orders-badge';
                        badge.style.cssText = 'background:#f9a03f;color:black;font-size:10px;font-weight:bold;padding:2px 7px;border-radius:10px;margin-left:6px;display:none;';
                        link.appendChild(badge);
                    }
                    badge.innerText = pendingCount;
                    badge.style.display = pendingCount > 0 ? 'inline' : 'none';
                }
            });
        });
}
// ✅ Sidebar Reviews Badge — Realtime Updates
function updateReviewsBadge() {
    if (!BRANCH_DOC_ID) return;

    // Step 1: Pehle Branch ke valid order IDs listen karein
    db.collection("orders")
        .where("branchId", "==", BRANCH_DOC_ID)
        .onSnapshot(async ordersSnap => {
            const branchOrderIds = new Set();
            ordersSnap.forEach(doc => branchOrderIds.add(doc.id));

            if (branchOrderIds.size === 0) return;

            // Step 2: Unread reviews listen karein
            db.collection("reviews")
                .where("isRead", "==", false)
                .onSnapshot(reviewsSnap => {
                    let unreadCount = 0;
                    reviewsSnap.forEach(doc => {
                        if (branchOrderIds.has(doc.data().orderId)) {
                            unreadCount++;
                        }
                    });

                    // Sidebar navigation links check karke badge append karein
                    const links = document.querySelectorAll('.sidebar nav a');
                    links.forEach(link => {
                        if (link.textContent.trim().toLowerCase().includes('review')) {
                            let badge = document.getElementById('reviews-badge');
                            if (!badge) {
                                badge = document.createElement('span');
                                badge.id = 'reviews-badge';
                                badge.style.cssText = 'background:#f9a03f;color:black;font-size:10px;font-weight:bold;padding:2px 7px;border-radius:10px;margin-left:6px;display:none;';
                                link.appendChild(badge);
                            }
                            badge.innerText = unreadCount;
                            badge.style.display = unreadCount > 0 ? 'inline' : 'none';
                        }
                    });
                });
        });
}
// ✅ Mark reviews as read
async function markReviewsAsRead(reviewIds) {
    if (reviewIds.length === 0) return;
    const batch = db.batch();
    reviewIds.forEach(id => {
        batch.update(db.collection("reviews").doc(id), { isRead: true });
    });
    await batch.commit();
}

// --- LOAD REVIEWS ---
async function loadReviews() {
    const container = document.getElementById('reviewsList');

    if (!BRANCH_DOC_ID) {
        container.innerHTML = `<p style="padding:30px; text-align:center; color:red;">Session expired. Please login again.</p>`;
        return;
    }

    try {
        // Step 1: Branch ke orders ki IDs nikalo
        const ordersSnap = await db.collection("orders")
            .where("branchId", "==", BRANCH_DOC_ID)
            .get();

        if (ordersSnap.empty) {
            container.innerHTML = `<div class="empty-state"><div style="font-size:48px;">📭</div><p>No orders found for this branch.</p></div>`;
            return;
        }

        // ✅ Orders ka count bhi save karo badge ke liye
        let pendingCount = 0;
        const branchOrderIds = new Set();
        ordersSnap.forEach(doc => {
            branchOrderIds.add(doc.id);
            const status = (doc.data().order_status || doc.data().status || '').toLowerCase();
            if (status === 'pending') pendingCount++;
        });

        // Step 2: Reviews fetch karo
        const reviewsSnap = await db.collection("reviews").get();

       allReviews = [];
const unreadIds = [];
reviewsSnap.forEach(doc => {
    const r = doc.data();
    if (branchOrderIds.has(r.orderId)) {
        allReviews.push({ id: doc.id, ...r });
        if (!r.isRead) unreadIds.push(doc.id); // ✅ unread collect karo
    }
});
await markReviewsAsRead(unreadIds); // ✅ sab read mark karo

        // Sort newest first
        allReviews.sort((a, b) => {
            const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
            const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
            return bTime - aTime;
        });

        // Stats
        document.getElementById('totalReviews').innerText = allReviews.length;
        if (allReviews.length > 0) {
            const avg = allReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / allReviews.length;
            document.getElementById('avgRating').innerText = avg.toFixed(1);
        }

        renderReviews(allReviews);

    } catch (e) {
        console.error("Reviews load error:", e);
        container.innerHTML = `<p style="padding:30px; text-align:center; color:red;">Error loading reviews: ${e.message}</p>`;
    }
}

// --- LOGOUT --- 🟢 async confirm fix
window.confirmLogout = async function() {
    const agreed = await confirm("Are you sure you want to logout?");
    if (agreed) {
        localStorage.clear();
        window.location.href = "login.html";
    }
};

loadReviews();
updateOrdersBadge();
updateReviewsBadge();