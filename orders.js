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
let assignOrderId  = null;
let currentFilter  = 'all';
let allOrdersCache = [];
let timerInterval  = null;

const riderNameCache = {};

async function getRiderName(riderId) {
    if (!riderId) return null;
    if (riderNameCache[riderId]) return riderNameCache[riderId];
    try {
        const doc = await db.collection("users").doc(riderId).get();
        const name = doc.exists ? (doc.data().name || 'Rider') : 'Unknown Rider';
        riderNameCache[riderId] = name;
        return name;
    } catch (e) {
        console.error("Rider name fetch error:", e);
        return 'Rider';
    }
}

const watchedRiderIds = new Set();
function watchRiderDoc(riderId) {
    if (!riderId || watchedRiderIds.has(riderId)) return;
    watchedRiderIds.add(riderId);
    db.collection("users").doc(riderId).onSnapshot(doc => {
        riderNameCache[riderId] = doc.exists ? (doc.data().name || 'Rider') : 'Unknown Rider';
        renderOrders();
    }, error => {
        console.error("Rider doc watch error:", riderId, error);
        watchedRiderIds.delete(riderId);
    });
}

window.setFilter = function(filter) {
    currentFilter = filter;
    ['all', 'scheduled', 'online', 'cod'].forEach(f => {
        const btn = document.getElementById(`filter-${f}`);
        if (btn) btn.classList.toggle('active-tab', f === filter);
    });
    renderOrders();
};

function getOrderStatus(data) {
    return data.orderStatus || 'Pending';
}

function parseDeliveryTime(timeStr) {
    if (!timeStr) return null;
    try {
        const cleaned = timeStr.replace(" at ", " ");
        const parsed  = new Date(cleaned);
        return isNaN(parsed.getTime()) ? null : parsed;
    } catch (e) { return null; }
}

function isWithin1Hour(deliveryTimeStr) {
    const deliveryTime = parseDeliveryTime(deliveryTimeStr);
    if (!deliveryTime) return false;
    const diffMins = (deliveryTime.getTime() - new Date().getTime()) / (1000 * 60);
    return diffMins <= 60 && diffMins > 0;
}

function checkIsScheduled(data) {
    const raw = (data.deliveryTime || '').toString().trim().toLowerCase();
    return raw !== ''
        && raw !== 'now'
        && raw !== 'as soon as possible'
        && raw !== 'asap'
        && parseDeliveryTime(data.deliveryTime) !== null;
}

function isOnlinePayment(paymentMethod) {
    if (!paymentMethod) return false;
    const method = paymentMethod.toString().toLowerCase();
    return method !== 'cod' && method !== 'cash on delivery' && method !== 'cash';
}

function formatOrderPlacedDate(createdAt) {
    if (!createdAt) return null;
    const date = createdAt.toMillis
        ? new Date(createdAt.toMillis())
        : new Date(createdAt);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function updateSidebarBadge(count) {
    const links = document.querySelectorAll('.sidebar nav a');
    links.forEach(link => {
        if (link.innerText.trim().toLowerCase().includes('order')) {
            let badge = document.getElementById('orders-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.id = 'orders-badge';
                badge.style.cssText = 'background:#f9a03f;color:black;font-size:10px;font-weight:bold;padding:2px 7px;border-radius:10px;margin-left:6px;display:none;';
                link.appendChild(badge);
            }
            badge.innerText = count;
            badge.style.display = count > 0 ? 'inline' : 'none';
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const overlay = document.getElementById('orderOverlay');
    if (overlay) overlay.addEventListener('click', () => {
        document.getElementById('orderViewModal').style.display = 'none';
        overlay.style.display = 'none';
    });
    const assignOverlay = document.getElementById('assignRiderOverlay');
    if (assignOverlay) assignOverlay.addEventListener('click', closeAssignModal);
});

function startLiveTimers() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const timerEls = document.querySelectorAll('[data-assigned-at]');
        timerEls.forEach(el => {
            const assignedAt  = parseInt(el.getAttribute('data-assigned-at'));
            const elapsedMins = Math.floor((Date.now() - assignedAt) / (1000 * 60));
            const elapsedSecs = Math.floor((Date.now() - assignedAt) / 1000) % 60;
            const isWarning   = elapsedMins >= 10;
            el.style.background = isWarning ? '#b52a00' : '#fff3cd';
            el.style.color      = isWarning ? 'white'   : '#856404';
            el.style.border     = isWarning ? '1px solid #b52a00' : '1px solid #ffc107';
            el.innerHTML = isWarning
                ? `Assigned ${elapsedMins}m ${elapsedSecs}s ago — Rider not accepted!`
                : `Assigned ${elapsedMins}m ${elapsedSecs}s ago`;
        });
    }, 1000);
}

const SMALL_BTN_STYLE = 'padding:4px 9px;font-size:11px;white-space:nowrap;';

let highlightedOrderId = null;
let highlightTimer     = null;

function renderOrders() {
    const tableBody = document.getElementById('ordersTableBody');
    if (!tableBody) return;

    const filtered = allOrdersCache.filter(({ data }) => {
        const isScheduled  = checkIsScheduled(data);
        const isPaidOnline = isOnlinePayment(data.payment_method || data.paymentMethod || '');
        if (currentFilter === 'scheduled') return isScheduled;
        if (currentFilter === 'online')    return isPaidOnline;
        if (currentFilter === 'cod')       return !isPaidOnline;
        return true;
    });

    const countEl = document.getElementById('orderCount');
    if (countEl) {
        const label = currentFilter === 'all'      ? 'All Orders' :
                      currentFilter === 'scheduled' ? 'Scheduled Orders' :
                      currentFilter === 'online'    ? 'Online Payment Orders' : 'COD Orders';
        countEl.innerText = `Showing ${filtered.length} ${label}`;
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = `<div style="padding:20px;text-align:center;color:#666;font-weight:500;">No orders found for this filter.</div>`;
        return;
    }

    tableBody.innerHTML = '';

    filtered.forEach(({ id, data }) => {
        const customerName  = data.customer_name  || data.customerName  || 'Guest';
        const status        = getOrderStatus(data);
        const paymentMethod = data.payment_method || data.paymentMethod || 'COD';
        const isScheduled   = checkIsScheduled(data);
        const isPaidOnline  = isOnlinePayment(paymentMethod);
        const showAssignBtn = isScheduled ? isWithin1Hour(data.deliveryTime) : true;
        const placedDateStr = formatOrderPlacedDate(data.createdAt);

        let statusColor = '#f5f1f0', statusBg = '#a70000';
        const ns = status.toString().trim().toLowerCase();
        if (ns === 'assigned')                       { statusColor = '#f5f1f0'; statusBg = '#a70000'; }
        if (ns === 'accepted')                       { statusColor = '#f5f1f0'; statusBg = '#a70000'; }
        if (ns === 'picked up')                      { statusColor = '#f5f1f0'; statusBg = '#a70000'; }
        if (ns === 'on the way')                     { statusColor = '#f5f1f0'; statusBg = '#a70000'; }
        if (ns === 'delivered')                      { statusColor = '#f5f1f0'; statusBg = '#a70000'; }
        if (ns === 'cancelled' || ns === 'canceled') { statusColor = '#f5f1f0'; statusBg = '#a70000'; }

        let assignBtnHtml = '';
        if (showAssignBtn) {
            if (ns === 'pending') {
                assignBtnHtml = `<button class="btn-action update-btn" onclick="openAssignModal('${id}')" style="${SMALL_BTN_STYLE}">Assign Rider</button>`;
            } else if (ns === 'assigned') {
                assignBtnHtml = `<button class="btn-action update-btn" onclick="openAssignModal('${id}')" style="${SMALL_BTN_STYLE}background:#e07000;">Reassign</button>`;
            }
        }

        let cancelBtnHtml = '';
        if (isPaidOnline && ns === 'pending') {
            cancelBtnHtml = `<button class="btn-action delete-btn" onclick="cancelOnlineOrder(event, '${id}')" style="${SMALL_BTN_STYLE}background-color:#b52a00;color:white;">Cancel</button>`;
        }

        const scheduledBadge = isScheduled ? `
            <span style="background:#fff3cd;color:#856404;font-size:10px;font-weight:bold;padding:3px 8px;border-radius:20px;display:inline-block;margin-left:5px;border:1px solid #ffc107;">
                Scheduled
            </span>` : '';

        const onlineBadge = isPaidOnline ? `
            <span style="background:#d4edda;color:#155724;font-size:10px;font-weight:bold;padding:3px 8px;border-radius:20px;display:inline-block;margin-left:5px;border:1px solid #28a745;">
                ${paymentMethod}
            </span>` : '';

        const scheduledTimeHtml = isScheduled ? `
            <div style="font-size:11px;color:#856404;margin-top:3px;font-weight:500;">
                Delivery: ${data.deliveryTime}
            </div>` : '';

        const placedDateHtml = placedDateStr ? `
            <div style="font-size:11px;color:#888;margin-top:3px;">
                Ordered: ${placedDateStr}
            </div>` : '';

        const riderLiveName = data.riderId ? (riderNameCache[data.riderId] || '...') : null;
        const riderNameHtml = riderLiveName ? `
            <div style="font-size:11px;color:#1a4a5e;margin-top:3px;font-weight:500;">
                Rider: ${riderLiveName}
            </div>` : '';

        let timerHtml = '';
        if (ns === 'assigned' && data.assignedAt) {
            const assignedAt = typeof data.assignedAt === 'number'
                ? data.assignedAt
                : data.assignedAt.toMillis ? data.assignedAt.toMillis() : Date.now();
            timerHtml = `
                <div data-assigned-at="${assignedAt}"
                     style="font-size:11px;font-weight:bold;margin-top:5px;padding:3px 10px;border-radius:20px;display:inline-block;background:#fff3cd;color:#856404;border:1px solid #ffc107;transition:all 0.3s;">
                    Loading...
                </div>`;
        }

        const isPending     = ns === 'pending';

        // --- Highlight orders
        const isHighlighted = (id === highlightedOrderId);

        let rowStyle = '';
        if (isPending)     rowStyle += 'border-left:3px solid #b52a00;';
        if (isHighlighted) rowStyle += 'background:#fff3cd;border:2px solid #f9a03f;border-radius:10px;transition:all 0.3s;';

        tableBody.innerHTML += `
            <div class="row order-grid" data-order-id="${id}" style="${rowStyle}">
                <span style="font-weight:bold;color:#b52a00;font-size:13px;">#${id.slice(-5).toUpperCase()}</span>
                <div>
                    <span style="font-weight:500;">${customerName}</span>
                    ${scheduledBadge}
                    ${onlineBadge}
                    ${placedDateHtml}
                    ${scheduledTimeHtml}
                    ${riderNameHtml}
                    ${timerHtml}
                </div>
                <span>
                    <span style="background:${statusBg};color:${statusColor};font-weight:bold;font-size:11px;padding:4px 12px;border-radius:20px;display:inline-block;">
                        ${status}
                    </span>
                </span>
                <div style="display:flex;justify-content:flex-end;gap:4px;align-items:center;flex-wrap:nowrap;">
                    <button class="btn-action view-btn" onclick="openOrderDetails('${id}')" style="${SMALL_BTN_STYLE}">View</button>
                    ${assignBtnHtml}
                    ${cancelBtnHtml}
                    <button class="btn-action delete-btn" onclick="removeOrder('${id}')" style="${SMALL_BTN_STYLE}">Delete</button>
                </div>
            </div>`;
    });

    startLiveTimers();
}

async function cancelOnlineOrder(event, orderId) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const userConfirmed = await confirm(
        "Are you sure you want to cancel this online paid order?"
    );
    if (!userConfirmed) return;

    try {
        const orderDoc = await db.collection("orders").doc(orderId).get();
        const orderData = orderDoc.data();

        await db.collection("orders").doc(orderId).update({
            orderStatus:        "Cancelled",
            cancelledBy:        "Manager",
            cancelledAt:        firebase.firestore.FieldValue.serverTimestamp(),
            cancellationReason: "Invalid receipt"
        });

        if (orderData && orderData.customerId) {
            await db.collection("notifications").add({
                userId:    orderData.customerId,
                title:     "Order Cancelled",
                body:      "Your order was cancelled. Reason: Invalid receipt",
                isRead:    false,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        alert("Order cancelled successfully!");
    } catch (e) {
        console.error("Error cancelling order:", e);
        alert("Failed to cancel order: " + e.message);
    }
}

function loadOrders() {
    const tableBody = document.getElementById('ordersTableBody');
    if (!tableBody) return;

    if (!BRANCH_DOC_ID) {
        tableBody.innerHTML = `<div style="padding:20px;text-align:center;color:red;font-weight:bold;">Error: Active Branch ID missing. Please login again.</div>`;
        return;
    }

    db.collection("orders")
        .where("branchId", "==", BRANCH_DOC_ID)
        .onSnapshot(snap => {
            allOrdersCache = [];
            let pendingCount = 0;

            snap.forEach(doc => {
                const data = doc.data();
                allOrdersCache.push({ id: doc.id, data });
                if (data.riderId) watchRiderDoc(data.riderId);
                const st = getOrderStatus(data).toLowerCase();
                if (st === 'pending') pendingCount++;
            });

            const statusOrder = {
                'pending'   : 1,
                'assigned'  : 2,
                'accepted'  : 3,
                'picked up' : 4,
                'on the way': 5,
                'delivered' : 6,
                'cancelled' : 7,
                'completed' : 8
            };

            allOrdersCache.sort((a, b) => {
                const aStatus = getOrderStatus(a.data).toLowerCase();
                const bStatus = getOrderStatus(b.data).toLowerCase();
                const aOrder  = statusOrder[aStatus] || 99;
                const bOrder  = statusOrder[bStatus] || 99;
                if (aOrder !== bOrder) return aOrder - bOrder;
                const aTime = a.data.createdAt?.toMillis?.() || a.data.createdAt || 0;
                const bTime = b.data.createdAt?.toMillis?.() || b.data.createdAt || 0;
                return bTime - aTime;
            });

            updateSidebarBadge(pendingCount);
            renderOrders();
            highlightOrderFromReview();
        }, error => {
            console.error("Firestore Orders Load Error:", error);
        });
}

async function openOrderDetails(id) {
    if (!BRANCH_DOC_ID) return alert("Session expired. Please login again!");
    try {
        const doc = await db.collection("orders").doc(id).get();
        if (!doc.exists) return alert("Order not found!");

        const order = doc.data();
        if (order.branchId !== BRANCH_DOC_ID) {
            alert("Security Error: You do not have permission to view this order.");
            return;
        }

        let itemsHtml = "";
        if (order.items && order.items.length > 0) {
            itemsHtml = order.items.map(item => `
                <li style="margin-bottom:6px;">
                    ${item.name || 'Item'}
                    ${item.quantity ? `x${item.quantity}` : ''}
                    ${item.price ? `— Rs. ${item.price}` : ''}
                </li>`).join('');
        } else {
            itemsHtml = "<li>No items specified</li>";
        }

        const paymentMethod = order.payment_method || order.paymentMethod || 'COD';
        const isPaidOnline  = isOnlinePayment(paymentMethod);
        const receiptUrl    = order.receiptImageUrl || null;
        const placedDateStr = formatOrderPlacedDate(order.createdAt);
        const orderStatusText = getOrderStatus(order);

        const paymentHtml = `
            <p><strong>Payment:</strong>
                <span style="background:${isPaidOnline ? '#d4edda' : '#f8f9fa'};color:${isPaidOnline ? '#155724' : '#333'};padding:2px 10px;border-radius:12px;font-size:12px;font-weight:bold;border:1px solid ${isPaidOnline ? '#28a745' : '#ddd'};">
                    ${isPaidOnline ? '' : ''}${paymentMethod}
                </span>
            </p>
            ${isPaidOnline && receiptUrl ? `
            <div style="margin-top:10px;">
                <p style="font-weight:bold;margin-bottom:6px;">Payment Receipt:</p>
                <img
                    src="${receiptUrl}"
                    alt="Payment Receipt"
                    onclick="window.open('${receiptUrl}', '_blank')"
                    style="width:100%;max-width:320px;border-radius:10px;border:2px solid #28a745;cursor:pointer;display:block;"
                />
                <p style="font-size:11px;color:#888;margin-top:4px;">Click image to view full size</p>
            </div>` : ''}
            ${isPaidOnline && !receiptUrl ? `
            <p style="color:#b52a00;font-size:12px;font-weight:500;">Receipt not uploaded yet.</p>` : ''}`;

        const scheduledHtml = checkIsScheduled(order) ? `
            <p style="background:#fff3cd;padding:8px 12px;border-radius:8px;border-left:4px solid #ffc107;">
                <strong>Scheduled Delivery:</strong> ${order.deliveryTime}
            </p>` : '';

        const placedDateDetailHtml = placedDateStr ? `
            <p><strong>Order Placed:</strong> ${placedDateStr}</p>` : '';

        const liveRiderName = order.riderId ? await getRiderName(order.riderId) : null;
        const riderInfoHtml = order.riderId
            ? `<p><strong>Assigned Rider:</strong> ${liveRiderName || 'Rider Assigned'}</p>` : '';

        const cancelledHtml = (orderStatusText === 'Cancelled') ? `
            <p style="background:#f8d7da;padding:8px 12px;border-radius:8px;border-left:4px solid #dc3545;color:#dc3545;font-weight:600;">
                Order Cancelled by Manager — Reason: ${order.cancellationReason || 'Invalid receipt'}
            </p>` : '';

let customerEmail = '';
const customerId = order.customerId || '';
if (customerId) {
    try {
        const customerDoc = await db.collection("users").doc(customerId).get();
        if (customerDoc.exists) {
            customerEmail = customerDoc.data().email || '';
        }
    } catch (e) {
        console.error("Customer fetch error:", e);
    }
}

document.getElementById('orderInfo').innerHTML = `
    <p><strong>Customer:</strong> ${order.customer_name || order.customerName || 'Guest'}</p>
    <p><strong>Email:</strong> ${customerEmail || 'Not available'}</p>
    <p><strong>Phone:</strong> ${order.phone_number || order.phone || "No Phone"}</p>
    <p><strong>Address:</strong> ${order.deliveryAddress ||  order.address || "No Address"}</p>
            ${placedDateDetailHtml}
            ${scheduledHtml}
            ${cancelledHtml}
            ${riderInfoHtml}
            ${paymentHtml}
            <hr>
            <p><strong>Ordered Items:</strong></p>
            <ul style="padding-left:20px;color:#b52a00;font-weight:500;">${itemsHtml}</ul>
            <hr>
            <p><strong>Total Amount:</strong> Rs. ${order.total_bill || order.totalAmount || 0}</p>
            <p><strong>Status:</strong> ${orderStatusText}</p>`;

        document.getElementById('orderViewModal').style.display = 'block';
        document.getElementById('orderOverlay').style.display   = 'block';
    } catch (e) {
        console.error("View Order Error:", e);
    }
}

// mirrors RiderController.isRiderOnline() on the Flutter side.
const ONLINE_MAX_AGE_MS = 2500;
function isRiderReallyOnline(r) {
    if (r.isAvailable !== true) return false;
    const seen = r.lastSeen;
    const seenMs = seen && seen.toMillis ? seen.toMillis() : null;
    if (!seenMs) return false; // no heartbeat yet -> treat as offline
    return (Date.now() - seenMs) <= ONLINE_MAX_AGE_MS;
}

async function openAssignModal(orderId) {
    if (!BRANCH_DOC_ID) return alert("Session expired. Please login again!");
    assignOrderId = orderId;
    const listContainer = document.getElementById('riderAssignList');
    listContainer.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">Loading available riders...</p>';
    document.getElementById('assignRiderModal').style.display   = 'block';
    document.getElementById('assignRiderOverlay').style.display = 'block';

    try {
       const ridersSnap = await db.collection("users")
    .where("roleId",        "==", "R002")
    .where("branchId",      "==", BRANCH_DOC_ID)
    .where("isAvailable",   "==", true)
    .where("emailVerified", "==", true)
    .get();

        const onlineRiderDocs = ridersSnap.docs.filter(doc => isRiderReallyOnline(doc.data()));

        if (onlineRiderDocs.length === 0) {
            listContainer.innerHTML = '<p style="text-align:center;padding:20px;color:#b52a00;font-weight:bold;">No available riders found in your branch.</p>';
            return;
        }

        let html = '';
        for (const riderDoc of onlineRiderDocs) {
            const r       = riderDoc.data();
            const riderId = riderDoc.id;

            const activeOrdersSnap = await db.collection("orders")
                .where("riderId",       "==", riderId)
                .where("orderStatus",   "in", ["Assigned", "Accepted", "assigned", "accepted"])
                .get();

            const pendingCount = activeOrdersSnap.size;
            const isFull       = pendingCount >= 5;
            const countColor   = isFull ? '#b52a00' : (pendingCount >= 3 ? '#f9a03f' : '#28a745');

            html += `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 15px;border-bottom:1px solid #eee;background:${isFull ? '#fff5f5' : 'white'};">
                    <div>
                        <p style="font-weight:bold;margin:0;color:${isFull ? '#999' : '#222'};font-size:14px;">${r.name || 'Rider'}</p>
                        <p style="font-size:12px;color:#888;margin:3px 0 0 0;">${r.phone || ''}</p>
                        <p style="font-size:12px;margin:4px 0 0 0;font-weight:bold;color:${countColor};">
                            Active Orders: ${pendingCount}/5 ${isFull ? '— Full' : '— Available'}
                        </p>
                    </div>
                    <button
                        onclick="${isFull ? '' : `assignRiderToOrder('${riderId}','${(r.name||'Rider').replace(/'/g,"\\'")}')` }"
                        ${isFull ? 'disabled' : ''}
                        style="padding:7px 18px;font-size:12px;font-weight:bold;border:none;border-radius:6px;cursor:${isFull ? 'not-allowed' : 'pointer'};background:${isFull ? '#ccc' : '#1a4a5e'};color:white;">
                        ${isFull ? 'Full (5/5)' : 'Assign'}
                    </button>
                </div>`;
        }
        listContainer.innerHTML = html;
    } catch (e) {
        listContainer.innerHTML = `<p style="text-align:center;padding:20px;color:red;">Error: ${e.message}</p>`;
    }
}

window.closeAssignModal = function() {
    document.getElementById('assignRiderModal').style.display   = 'none';
    document.getElementById('assignRiderOverlay').style.display = 'none';
    assignOrderId = null;
};

async function assignRiderToOrder(riderId, riderName) {
    if (!assignOrderId) return;
    const orderRef = db.collection("orders").doc(assignOrderId);

    try {
        const activeOrdersSnap = await db.collection("orders")
            .where("riderId",       "==", riderId)
            .where("orderStatus",   "in", ["Assigned", "Accepted", "assigned", "accepted"])
            .get();

        const currentActive = activeOrdersSnap.size;

        if (currentActive >= 5) {
            alert(`${riderName} already has ${currentActive} active orders. Cannot assign more.`);
            return;
        }

        await orderRef.set({
            riderId,
            riderName:    firebase.firestore.FieldValue.delete(),
            orderStatus:  "Assigned",
            assignedAt:   Date.now()
        }, { merge: true });

        alert(`Order assigned to ${riderName} successfully!`);
        closeAssignModal();

    } catch (e) {
        console.error("Error assigning rider:", e);
        alert("Error: " + e.message);
    }
}

async function removeOrder(id) {
    if (!BRANCH_DOC_ID) return alert("Session expired. Please login again!");
    const confirmed = await confirm("Are you sure you want to delete this order?");
    if (!confirmed) return;
    try {
        const doc = await db.collection("orders").doc(id).get();
        if (doc.exists && doc.data().branchId === BRANCH_DOC_ID) {
            await db.collection("orders").doc(id).delete();
            alert("Order deleted successfully!");
        } else {
            alert("Unauthorized action.");
        }
    } catch (e) {
        alert("Error deleting order: " + e.message);
    }
}

window.closeOrderView = function() {
    document.getElementById('orderViewModal').style.display = 'none';
    document.getElementById('orderOverlay').style.display   = 'none';
};

// Highlight order from review page
function highlightOrderFromReview() {
    const highlightId = localStorage.getItem("highlight_order_id");
    if (!highlightId) return;

    localStorage.removeItem("highlight_order_id");

    highlightedOrderId = highlightId;
    renderOrders();

    const row = document.querySelector(`.row.order-grid[data-order-id="${highlightId}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
        highlightedOrderId = null;
        renderOrders();
    }, 8000);
}

function updateReviewsBadge() {
    if (!BRANCH_DOC_ID) return;

    db.collection("orders")
        .where("branchId", "==", BRANCH_DOC_ID)
        .onSnapshot(ordersSnap => {
            const branchOrderIds = new Set();
            ordersSnap.forEach(doc => branchOrderIds.add(doc.id));

            db.collection("reviews")
                .where("isRead", "==", false)
                .onSnapshot(reviewsSnap => {
                    let unreadCount = 0;
                    reviewsSnap.forEach(doc => {
                        if (branchOrderIds.has(doc.data().orderId)) {
                            unreadCount++;
                        }
                    });

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
loadOrders();
updateReviewsBadge();