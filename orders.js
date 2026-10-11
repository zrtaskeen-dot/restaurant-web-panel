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
    ['all', 'scheduled', 'online', 'cod', 'incomplete', 'cancelled', 'undelivered'].forEach(f => {
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

// ---------------------------------------------------------------------
// INCOMPLETE ORDERS
//  1) Har order 45 minute mein deliver hona chahiye. Jo order abhi tak
//     Pending ya Assigned hai aur uski deadline guzar chuki hai:
//       - Scheduled order  => deadline = uska delivery time
//       - Baaki sab orders => deadline = order place hone ke 45 minute baad
//  (Cancelled orders Incomplete mein nahi aate, unka alag "Cancelled" filter hai)
// ---------------------------------------------------------------------
const DELIVERY_WINDOW_MINUTES = 45;

function isCancelledStatus(statusLower) {
    return statusLower === 'cancelled' || statusLower === 'canceled';
}

// Order ki deadline (milliseconds mein), na mile to null
function getDeliveryDeadlineMs(data) {
    if (checkIsScheduled(data)) {
        const t = parseDeliveryTime(data.deliveryTime);
        return t ? t.getTime() : null;
    }
    const c = data.createdAt;
    const createdMs = c ? (c.toMillis ? c.toMillis() : new Date(c).getTime()) : NaN;
    if (isNaN(createdMs)) return null;
    return createdMs + DELIVERY_WINDOW_MINUTES * 60 * 1000;
}

function isOverdueIncomplete(data) {
    const st = getOrderStatus(data).toString().trim().toLowerCase();
    if (st !== 'pending' && st !== 'assigned') return false;
    const deadline = getDeliveryDeadlineMs(data);
    return deadline !== null && deadline < Date.now();
}

// Cancelled order ki wajah (Cancelled filter / row mein dikhane ke liye)
function getCancelReason(data) {
    const by  = data.cancelledBy ? `Cancelled by ${data.cancelledBy}` : 'Order was cancelled';
    const why = data.cancellationReason || 'No reason given';
    return `${by} — ${why}`;
}

// Undelivered order
function isUndeliveredStatus(statusLower) {
    return statusLower === 'undelivered';
}

// Undelivered order ki wajah (rider ne jo reason diya)
function getUndeliveredReason(data) {
    const riderName = data.riderId ? (riderNameCache[data.riderId] || 'Rider') : 'Rider';
    const why = data.undeliveredReason || 'No reason given';
    return `Undelivered by ${riderName} — ${why}`;
}

// Pending/Assigned order ki deadline guzarne ki wajah (text)
// statusOverride: jab order ka status pehle hi "Incomplete" ho chuka ho to
// riderId dekh kar batate hain ke woh pehle Pending tha ya Assigned
function getOverdueReason(data, statusOverride) {
    const st = (statusOverride || getOrderStatus(data)).toString().trim().toLowerCase();
    const missed = checkIsScheduled(data)
        ? `Delivery time (${data.deliveryTime}) has passed.`
        : `Not delivered within ${DELIVERY_WINDOW_MINUTES} minutes of being placed.`;
    if (st === 'assigned') {
        const riderName = data.riderId ? (riderNameCache[data.riderId] || 'the rider') : 'the rider';
        return `${missed} Assigned to ${riderName}, but the rider never accepted the order.`;
    }
    return `${missed} No rider was assigned to this order.`;
}

// null => order incomplete nahi hai, warna { type, reason } wapas aata hai
function getIncompleteInfo(data) {
    const st = getOrderStatus(data).toString().trim().toLowerCase();

    // Firestore mein status "Incomplete" likha ja chuka hai => wahan se wajah parho
    if (st === 'incomplete') {
        return {
            type: 'overdue',
            reason: data.incompleteReason
                || getOverdueReason(data, data.riderId ? 'assigned' : 'pending')
        };
    }

    // Deadline guzar chuki hai, lekin Firestore mein status abhi update hona baqi hai
    if (isOverdueIncomplete(data)) {
        return { type: 'overdue', reason: getOverdueReason(data) };
    }

    return null;
}

// ---------------------------------------------------------------------
// Overdue order ka status Firestore mein "Incomplete" likhna.
// Transaction use hoti hai: agar usi lamhe rider ne order accept kar liya
// ya manager ne cancel kar diya ho to uska status overwrite nahi hota.
// Firestore mein sirf orderStatus aur incompleteReason likhe jate hain.
// ---------------------------------------------------------------------
const incompleteFlagged = new Set();

async function markOrderIncomplete(id) {
    const ref = db.collection("orders").doc(id);

    // Rider ka naam pehle cache mein la lo taake wajah mein naam likha ja sake
    const cached = allOrdersCache.find(o => o.id === id);
    if (cached && cached.data.riderId) await getRiderName(cached.data.riderId);

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const cur = snap.data();
        if (!isOverdueIncomplete(cur)) return;   // beech mein status badal chuka hai
        tx.update(ref, {
            orderStatus:      'Incomplete',
            incompleteReason: getOverdueReason(cur)
        });
    });
}

// Jin orders ka status pehle se "Incomplete" hai (kisi aur jagah se likha gaya)
// lekin Firestore mein incompleteReason nahi hai, unmein reason likhna,
// aur purani previousStatus / incompleteAt fields hata dena.
const incompleteBackfilled = new Set();

async function backfillIncompleteOrder(id, data) {
    if (data.riderId) await getRiderName(data.riderId);

    const update = {};
    if (!data.incompleteReason) {
        update.incompleteReason = getOverdueReason(data, data.riderId ? 'assigned' : 'pending');
    }
    if (data.previousStatus !== undefined) {
        update.previousStatus = firebase.firestore.FieldValue.delete();
    }
    if (data.incompleteAt !== undefined) {
        update.incompleteAt = firebase.firestore.FieldValue.delete();
    }
    if (Object.keys(update).length === 0) return;

    await db.collection("orders").doc(id).update(update);
}

function flagOverdueOrders() {
    allOrdersCache.forEach(({ id, data }) => {
        const st = getOrderStatus(data).toString().trim().toLowerCase();

        // Pehle se Incomplete order: reason missing ho ya previousStatus ho to theek karo
        if (st === 'incomplete') {
            const needsFix = !data.incompleteReason
                || data.previousStatus !== undefined
                || data.incompleteAt !== undefined;
            if (needsFix && !incompleteBackfilled.has(id)) {
                incompleteBackfilled.add(id);
                backfillIncompleteOrder(id, data).catch(err => {
                    console.error("Incomplete backfill error:", id, err);
                    incompleteBackfilled.delete(id);
                });
            }
            return;
        }

        // Naya overdue order: status Incomplete likho
        if (!isOverdueIncomplete(data) || incompleteFlagged.has(id)) return;
        incompleteFlagged.add(id);
        markOrderIncomplete(id).catch(err => {
            console.error("Incomplete mark error:", id, err);
            incompleteFlagged.delete(id);   // agli dafa dobara koshish hogi
        });
    });
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

// --- Sorting (Incomplete orders Pending/Assigned ke upar nahi, neeche jate hain) ---
const statusOrder = {
    'pending'    : 1,
    'assigned'   : 2,
    'accepted'   : 3,
    'undelivered': 4,
    'delivered'  : 5,
    'cancelled'  : 6,
    'incomplete' : 7
};

function getSortRank(data) {
    if (isOverdueIncomplete(data)) return 7;
    return statusOrder[getOrderStatus(data).toLowerCase()] || 99;
}

function sortOrdersCache() {
    allOrdersCache.sort((a, b) => {
        const aOrder = getSortRank(a.data);
        const bOrder = getSortRank(b.data);
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aTime = a.data.createdAt?.toMillis?.() || a.data.createdAt || 0;
        const bTime = b.data.createdAt?.toMillis?.() || b.data.createdAt || 0;
        return bTime - aTime;
    });
}

// Sidebar badge mein sirf woh Pending orders gine jate hain jo Incomplete nahi hain
function getPendingCount() {
    return allOrdersCache.filter(({ data }) =>
        getOrderStatus(data).toLowerCase() === 'pending' && !isOverdueIncomplete(data)
    ).length;
}

// Deadline waqt ke sath guzarti hai (Firestore mein koi change nahi hota),
// isliye har 30 second baad check hota hai ke koi naya order Incomplete to nahi hua,
// aur aisa order mile to uska status Firestore mein "Incomplete" kar diya jata hai.
let lastIncompleteSignature = '';
function computeIncompleteSignature() {
    return allOrdersCache
        .filter(({ data }) => isOverdueIncomplete(data))
        .map(({ id }) => id)
        .sort()
        .join(',');
}

setInterval(() => {
    flagOverdueOrders();
    if (computeIncompleteSignature() !== lastIncompleteSignature) {
        updateSidebarBadge(getPendingCount());
        renderOrders();
    }
}, 30000);

function renderOrders() {
    const tableBody = document.getElementById('ordersTableBody');
    if (!tableBody) return;

    sortOrdersCache();
    lastIncompleteSignature = computeIncompleteSignature();

    const filtered = allOrdersCache.filter(({ data }) => {
        const isScheduled  = checkIsScheduled(data);
        const isPaidOnline = isOnlinePayment(data.payment_method || data.paymentMethod || '');
        if (currentFilter === 'scheduled')   return isScheduled;
        if (currentFilter === 'online')      return isPaidOnline;
        if (currentFilter === 'cod')         return !isPaidOnline;
        if (currentFilter === 'incomplete')  return getIncompleteInfo(data) !== null;
        if (currentFilter === 'cancelled')   return isCancelledStatus(getOrderStatus(data).toString().trim().toLowerCase());
        if (currentFilter === 'undelivered') return isUndeliveredStatus(getOrderStatus(data).toString().trim().toLowerCase());
        return true;
    });

    const countEl = document.getElementById('orderCount');
    if (countEl) {
        const label = currentFilter === 'all'         ? 'All Orders' :
                      currentFilter === 'scheduled'   ? 'Scheduled Orders' :
                      currentFilter === 'online'      ? 'Online Payment Orders' :
                      currentFilter === 'incomplete'  ? 'Incomplete Orders' :
                      currentFilter === 'cancelled'   ? 'Cancelled Orders' :
                      currentFilter === 'undelivered' ? 'Undelivered Orders' : 'COD Orders';
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

        const incompleteInfo = getIncompleteInfo(data);
        const displayStatus  = incompleteInfo ? 'Incomplete' : status;

        let statusColor = '#f5f1f0', statusBg = '#a70000';
        const ns = status.toString().trim().toLowerCase();
        if (ns === 'assigned')                       { statusColor = '#f5f1f0'; statusBg = '#a70000'; }
        if (ns === 'accepted')                       { statusColor = '#f5f1f0'; statusBg = '#a70000'; }
        if (ns === 'picked up')                      { statusColor = '#f5f1f0'; statusBg = '#a70000'; }
        if (ns === 'on the way')                     { statusColor = '#f5f1f0'; statusBg = '#a70000'; }
        if (ns === 'delivered')                      { statusColor = '#f5f1f0'; statusBg = '#a70000'; }
        if (ns === 'cancelled' || ns === 'canceled') { statusColor = '#f5f1f0'; statusBg = '#a70000'; }
        if (ns === 'undelivered')                    { statusColor = '#f5f1f0'; statusBg = '#a70000'; }
        if (incompleteInfo)                          { statusColor = '#ffffff'; statusBg = '#a70000'; }

        let assignBtnHtml = '';
        // Incomplete order par sirf View aur Delete dikhte hain (Assign/Reassign/Cancel nahi)
        if (showAssignBtn && !incompleteInfo) {
            if (ns === 'pending') {
                assignBtnHtml = `<button class="btn-action update-btn" onclick="openAssignModal('${id}')" style="${SMALL_BTN_STYLE}">Assign Rider</button>`;
            } else if (ns === 'assigned') {
                assignBtnHtml = `<button class="btn-action update-btn" onclick="openAssignModal('${id}')" style="${SMALL_BTN_STYLE}background:#e07000;">Reassign</button>`;
            }
        }

        let cancelBtnHtml = '';
        if (isPaidOnline && ns === 'pending' && !incompleteInfo) {
            cancelBtnHtml = `<button class="btn-action delete-btn" onclick="cancelOnlineOrder(event, '${id}')" style="${SMALL_BTN_STYLE}background-color:#b52a00;color:white;">Cancel</button>`;
        }
        // Delete sirf Delivered, Cancelled, Undelivered ya Incomplete orders par dikhao
        let deleteBtnHtml = '';
        if (ns === 'delivered' || ns === 'cancelled' || ns === 'undelivered' || incompleteInfo) {
            deleteBtnHtml = `<button class="btn-action delete-btn" onclick="removeOrder('${id}')" style="${SMALL_BTN_STYLE}">Delete</button>`;
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

        // Incomplete / Cancelled / Undelivered order ki wajah
        const reasonText = incompleteInfo
            ? incompleteInfo.reason
            : (isCancelledStatus(ns) ? getCancelReason(data)
            : (isUndeliveredStatus(ns) ? getUndeliveredReason(data) : null));
        const incompleteReasonHtml = reasonText ? `
            <div style="font-size:11px;color:#b52a00;margin-top:4px;font-weight:600;">
                Reason: ${reasonText}
            </div>` : '';

        // Incomplete order par "Assigned ... ago" timer nahi dikhate (reason mein wajah likhi hoti hai)
        let timerHtml = '';
        if (ns === 'assigned' && data.assignedAt && !incompleteInfo) {
            const assignedAt = typeof data.assignedAt === 'number'
                ? data.assignedAt
                : data.assignedAt.toMillis ? data.assignedAt.toMillis() : Date.now();
            timerHtml = `
                <div data-assigned-at="${assignedAt}"
                     style="font-size:11px;font-weight:bold;margin-top:5px;padding:3px 10px;border-radius:20px;display:inline-block;background:#fff3cd;color:#856404;border:1px solid #ffc107;transition:all 0.3s;">
                    Loading...
                </div>`;
        }

        const isPending     = ns === 'pending' && !incompleteInfo;

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
                    ${incompleteReasonHtml}
                    ${timerHtml}
                </div>
                <span>
                    <span style="background:${statusBg};color:${statusColor};font-weight:bold;font-size:11px;padding:4px 12px;border-radius:20px;display:inline-block;">
                        ${displayStatus}
                    </span>
                </span>
                 <div style="display:flex;justify-content:center;gap:4px;align-items:center;flex-wrap:nowrap;">
                    <button class="btn-action view-btn" onclick="openOrderDetails('${id}')" style="${SMALL_BTN_STYLE}">View</button>
                     ${assignBtnHtml}
                    ${cancelBtnHtml}
                    ${deleteBtnHtml}
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

            snap.forEach(doc => {
                const data = doc.data();
                if (data.deletedByManager === true) return;   // manager ne delete kiya hua order skip
                allOrdersCache.push({ id: doc.id, data });
                if (data.riderId) watchRiderDoc(data.riderId);
            });

            flagOverdueOrders();
            updateSidebarBadge(getPendingCount());
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

        // Delivery time guzarne wale Pending/Assigned orders ki wajah
        const incompleteInfo = getIncompleteInfo(order);
        const incompleteHtml = (incompleteInfo && incompleteInfo.type === 'overdue') ? `
            <p style="background:#e2e3e5;padding:8px 12px;border-radius:8px;border-left:4px solid  #dc3545;color:#dc3545;font-weight:600;">
                Incomplete Order — ${incompleteInfo.reason}
            </p>` : '';

        // Rider ne order undeliver kiya to uski wajah
        const undeliveredHtml = (orderStatusText.toString().toLowerCase() === 'undelivered') ? `
            <p style="background:#f8d7da;padding:8px 12px;border-radius:8px;border-left:4px solid #dc3545;color:#dc3545;font-weight:600;">
                Order Undelivered by ${liveRiderName || 'Rider'} — Reason: ${order.undeliveredReason || 'No reason given'}
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
            ${incompleteHtml}
            ${undeliveredHtml}
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
            const st = getOrderStatus(doc.data()).toString().trim().toLowerCase();
            const isIncomplete = st === 'incomplete' || isOverdueIncomplete(doc.data());
            if (st !== 'delivered' && st !== 'cancelled' && st !== 'canceled' && st !== 'undelivered' && !isIncomplete) {
                alert("Only Delivered, Cancelled, Undelivered or Incomplete orders can be deleted.");
                return;
            }
            // Soft delete: Firestore se nahi mitta, sirf manager se chhup jata hai
            await db.collection("orders").doc(id).update({
                deletedByManager: true,
                deletedByManagerAt: firebase.firestore.FieldValue.serverTimestamp()
            });
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
            ordersSnap.forEach(doc => {
                if (doc.data().deletedByManager === true) return;
                branchOrderIds.add(doc.id);
            });

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