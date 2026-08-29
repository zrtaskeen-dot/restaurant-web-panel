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
console.log("Special Offers Active Branch ID:", BRANCH_DOC_ID);

let selectedItems = [];
let allDownloadedMenuItems = []; 
let currentActiveCategory = 'ALL';
let editDealId = null;

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(d)} ${months[parseInt(m)-1]}`;
}

// --- CHECKBOX TOGGLE ---
window.toggleSizeSelection = function(checkbox) {
    const fullName = checkbox.getAttribute('data-fullname');
    if (checkbox.checked) {
        if (!selectedItems.includes(fullName)) selectedItems.push(fullName);
    } else {
        selectedItems = selectedItems.filter(item => item !== fullName);
    }
    const descTextarea = document.getElementById('dealDesc');
    if (descTextarea) {
        descTextarea.value = selectedItems.length === 0 
            ? '' 
            : selectedItems.map((item, index) => `${index + 1}. ${item}`).join('\n');
    }
};

// --- LOAD MENU ITEMS ---
function loadMenuItems() {
    if (!BRANCH_DOC_ID) return;
    db.collection("menu").where("branchId", "==", BRANCH_DOC_ID).onSnapshot((snapshot) => {
        allDownloadedMenuItems = []; 
        snapshot.forEach((doc) => {
            const data = doc.data();
            const itemCat = data.category ? data.category.toUpperCase().trim() : 'GENERAL';
            if (itemCat !== 'DEALS' && itemCat !== 'COMBO') {
                allDownloadedMenuItems.push({ id: doc.id, name: data.name || 'Unnamed Item', category: itemCat, prices: data.prices || {} });
            }
        });
        renderMenuGridFiltered();
    });
}

// --- CATEGORY FILTER ---
window.filterDealMenu = function(category) {
    currentActiveCategory = category.toUpperCase().trim();
    document.querySelectorAll('.cat-tab').forEach(tab => {
        tab.classList.toggle('active', tab.innerText.toUpperCase().trim() === currentActiveCategory);
    });
    renderMenuGridFiltered();
};

// --- RENDER MENU GRID ---
function renderMenuGridFiltered() {
    const menuGridList = document.getElementById('menu-items-list');
    if (!menuGridList) return;
    menuGridList.innerHTML = '';
    let filteredItems = allDownloadedMenuItems;
    if (currentActiveCategory !== 'ALL') {
        filteredItems = allDownloadedMenuItems.filter(item => item.category === currentActiveCategory);
    }
    if (filteredItems.length === 0) {
        menuGridList.innerHTML = `<p style="text-align:center; padding:20px; color:#666;">No items found under "${currentActiveCategory}".</p>`;
        return;
    }
    filteredItems.forEach((item) => {
        const p = item.prices || {};
        let sizesHTML = '';
        let hasAnySize = false;
        const chk = (name) => selectedItems.includes(name) ? 'checked' : '';
        if (p.small)    { sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (Small)" ${chk(item.name+' (Small)')} onchange="toggleSizeSelection(this)"><span>Small - Rs. ${p.small}</span></div>`; hasAnySize = true; }
        if (p.medium)   { sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (Medium)" ${chk(item.name+' (Medium)')} onchange="toggleSizeSelection(this)"><span>Medium - Rs. ${p.medium}</span></div>`; hasAnySize = true; }
        if (p.large)    { sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (Large)" ${chk(item.name+' (Large)')} onchange="toggleSizeSelection(this)"><span>Large - Rs. ${p.large}</span></div>`; hasAnySize = true; }
        if (p.xlarge)   { sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (X-Large)" ${chk(item.name+' (X-Large)')} onchange="toggleSizeSelection(this)"><span>X-Large - Rs. ${p.xlarge}</span></div>`; hasAnySize = true; }
        if (p['6pcs'])  { sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (6 Pcs)" ${chk(item.name+' (6 Pcs)')} onchange="toggleSizeSelection(this)"><span>6 Pieces - Rs. ${p['6pcs']}</span></div>`; hasAnySize = true; }
        if (p['12pcs']) { sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (12 Pcs)" ${chk(item.name+' (12 Pcs)')} onchange="toggleSizeSelection(this)"><span>12 Pieces - Rs. ${p['12pcs']}</span></div>`; hasAnySize = true; }
        if (p['05l'])   { sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (0.5L)" ${chk(item.name+' (0.5L)')} onchange="toggleSizeSelection(this)"><span>0.5L - Rs. ${p['05l']}</span></div>`; hasAnySize = true; }
        if (p['1l'])    { sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (1L)" ${chk(item.name+' (1L)')} onchange="toggleSizeSelection(this)"><span>1L - Rs. ${p['1l']}</span></div>`; hasAnySize = true; }
        if (p['15l'])   { sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (1.5L)" ${chk(item.name+' (1.5L)')} onchange="toggleSizeSelection(this)"><span>1.5L - Rs. ${p['15l']}</span></div>`; hasAnySize = true; }
        if (p['2l'])    { sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (2L)" ${chk(item.name+' (2L)')} onchange="toggleSizeSelection(this)"><span>2L - Rs. ${p['2l']}</span></div>`; hasAnySize = true; }
        if (!hasAnySize && p.simple) {
            sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name}" ${chk(item.name)} onchange="toggleSizeSelection(this)"><span>Standard - Rs. ${p.simple}</span></div>`;
        }
        menuGridList.innerHTML += `
            <div class="menu-item-block">
                <div class="deal-item-category">${item.category}</div>
                <div class="main-item-title">${item.name}</div>
                <div class="sizes-container" style="display:block; width:100%;">${sizesHTML}</div>
            </div>`;
    });
}

// --- SAVE SPECIAL OFFER ---
document.getElementById('dealForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const eventName = document.getElementById('eventName').value.trim();
    const dealName  = document.getElementById('dealName').value.trim();
    const dealPrice = document.getElementById('dealPrice').value;
    const startDate = document.getElementById('startDate').value;
    const endDate   = document.getElementById('endDate').value;
    const dealDesc  = document.getElementById('dealDesc').value.trim();
    if (!eventName)                           { alert("Please enter event name!"); return; }
    if (!dealName)                            { alert("Please enter deal name!"); return; }
    if (!dealPrice || Number(dealPrice) <= 0) { alert("Please enter a valid price!"); return; }
    if (!startDate)                           { alert("Please select start date!"); return; }
    if (!endDate)                             { alert("Please select end date!"); return; }
    if (startDate > endDate)                  { alert("End date must be after start date!"); return; }
    if (selectedItems.length === 0)           { alert("Please select at least one item!"); return; }
    if (!BRANCH_DOC_ID)                       { alert("Branch ID missing. Please login again!"); return; }
    const offerData = { eventName, name: dealName, prices: { simple: Number(dealPrice) }, startDate, endDate, description: dealDesc, branchId: BRANCH_DOC_ID, isActive: true, createdAt: Date.now(), updatedAt: Date.now() };
    try {
        if (editDealId) {
            await db.collection("special_offers").doc(editDealId).update({ ...offerData, updatedAt: Date.now() });
            alert("Special Offer Updated Successfully!");
            editDealId = null;
            document.querySelector('.btn-create-deal').innerText = "Create & Save Offer";
        } else {
            await db.collection("special_offers").add(offerData);
            alert(`"${eventName}" Offer Created Successfully!`);
        }
        document.getElementById('dealForm').reset();
        selectedItems = [];
        renderMenuGridFiltered();
    } catch (error) {
        alert("Error saving offer: " + error.message);
    }
});

// --- LOAD ACTIVE SPECIAL OFFERS ---
function loadActiveDeals() {
    const dealsContainer = document.getElementById('active-deals-list');
    if (!dealsContainer || !BRANCH_DOC_ID) return;
    db.collection("special_offers").where("branchId", "==", BRANCH_DOC_ID).onSnapshot((snapshot) => {
        dealsContainer.innerHTML = '';
        if (snapshot.empty) {
            dealsContainer.innerHTML = '<p style="padding:20px; text-align:center; color:#666;">No special offers created yet.</p>';
            return;
        }
        snapshot.forEach((doc) => {
            const data = doc.data();
            const id = doc.id;
            const priceDisplay = data.prices?.simple || 0;
            dealsContainer.innerHTML += `
                <div class="deals-row">
                    <span style="font-weight:bold; color:#b52a00;">
                        <span style="background:#f9a03f; color:black; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold;">${data.eventName}</span><br>
                        ${data.name}<br>
                        <span style="font-size:11px; color:#666;">📅 ${formatDate(data.startDate)} — ${formatDate(data.endDate)}</span>
                    </span>
                    <span>Rs. ${priceDisplay}</span>
                    <span style="font-size:13px; color:#555; white-space:pre-line;">${data.description || ''}</span>
                                       <div style="display:flex; flex-direction:column; gap:6px; align-items:center;">
                        <button class="btn-delete-deal" style="background:#1a4a5e; width:80px;" onclick="editDeal('${id}')">Edit</button>
                        <button class="btn-delete-deal" style="width:80px;" onclick="deleteDeal('${id}')">Delete</button>
                    </div>
                </div>`;
        });
    });
}

// --- EDIT OFFER ---
window.editDeal = async (id) => {
    try {
        const doc = await db.collection("special_offers").doc(id).get();
        if (!doc.exists) return;
        const data = doc.data();
        editDealId = id;
        document.getElementById('eventName').value = data.eventName || '';
        document.getElementById('dealName').value  = data.name || '';
        document.getElementById('dealPrice').value = data.prices?.simple || '';
        document.getElementById('startDate').value = data.startDate || '';
        document.getElementById('endDate').value   = data.endDate || '';
        document.getElementById('dealDesc').value  = data.description || '';
        selectedItems = data.description ? data.description.split('\n').map(line => line.replace(/^\d+\.\s*/, '').trim()).filter(Boolean) : [];
        document.querySelector('.btn-create-deal').innerText = "Update Offer";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
        alert("Error loading offer: " + e.message);
    }
};

// --- DELETE OFFER ---
window.deleteDeal = async (id) => {
    const agreed = await confirm("Delete this special offer?");
    if (agreed) {
        try {
            await db.collection("special_offers").doc(id).delete();
            alert("Special Offer Deleted!");
        } catch (error) {
            alert("Error: " + error.message);
        }
    }
};

// 🟢 Sidebar Badge
function updateOrdersBadge() {
    if (!BRANCH_DOC_ID) return;
    db.collection("orders").where("branchId", "==", BRANCH_DOC_ID).where("order_status", "==", "pending").onSnapshot(snap => {
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
                badge.innerText = snap.size;
                badge.style.display = snap.size > 0 ? 'inline' : 'none';
            }
        });
    });
}

// --- START ---
document.addEventListener("DOMContentLoaded", () => {
    loadMenuItems();
    loadActiveDeals();
    updateOrdersBadge();
});