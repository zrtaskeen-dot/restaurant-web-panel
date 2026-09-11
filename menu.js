// --- Firebase Config ---
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
console.log("Menu Management Active Branch ID:", BRANCH_DOC_ID);

const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dqjqkwwwh/image/upload";
const UPLOAD_PRESET = "menuitem";

let currentCategory = 'PIZZA';
let editDocId = null;
let editPackageId = null;
let editToppingId = null;
let unsubscribe = null;
let toppingsUnsubscribe = null;
let packagesListUnsubscribe = null;

let packageSelectedItems = [];
let packageAllItems = [];
let currentPackageMiniCategory = 'PIZZA';

// 🟢 NEW: Stores the base64 string of the selected deal image for preview
let dealBase64Image = "";

// --- ACTIVITY LOG HELPER ---
// This page is branch/manager scoped (via active_branch_id), so role defaults to
// "Manager". NOTE: performedBy is picked from localStorage first (adjust the key
// name below to whatever your login flow actually stores, e.g. 'manager_name' /
// 'user_name'), falling back to the signed-in auth email, then a generic label.
function logActivity(action, details) {
    try {
        const performedBy = localStorage.getItem('manager_name')
            || localStorage.getItem('user_name')
            || (firebase.auth().currentUser ? firebase.auth().currentUser.email : null)
            || 'Manager';
        const role   = localStorage.getItem('user_role')        || 'Manager';
        const branch = localStorage.getItem('managerBranchName') || '';

       db.collection("system_log").add({
    action,
    performed_by: performedBy,
    role,                    // ✅ role add karo
    branch,
    details,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
}).catch((err) => console.error("System log write failed:", err));
    } catch (err) {
        console.error("System log error:", err);
    }
}

function formatPricesForLog(prices) {
    if (!prices) return '';
    return Object.entries(prices).map(([k, v]) => `${k}: Rs.${v}`).join(', ');
}

// --- IN-APP CUSTOMER NOTIFICATION (no Cloud Functions) ---
// Writes straight to the same `notifications` collection the Flutter app's
// NotificationService.broadcastToAllCustomers() writes to (userId: 'ALL',
// isRead: false, serverTimestamp). NotificationScreen already listens to
// this collection live, so every customer sees it instantly — no backend
// function needed.
function broadcastToAllCustomers(title, body) {
    db.collection("notifications").add({
        userId: "ALL",
        title,
        body,
        isRead: false,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error("Broadcast notification failed:", err));
}

// ─────────────────────────────────────────────
//  DEAL IMAGE: Preview on file select
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

    // Wire up deal image file input preview
    const dealImageInput = document.getElementById('dealImageInput');
    if (dealImageInput) {
        dealImageInput.addEventListener('change', function () {
            const file = this.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                dealBase64Image = e.target.result; // save base64 for reference
                const preview = document.getElementById('dealImagePreview');
                if (preview) {
                    preview.src = e.target.result;
                    preview.style.border = "2px solid #b52a00";
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // Load default category
    window.loadMenuItems('PIZZA');

    // Package form submit handler
    const pForm = document.getElementById('menuPackageForm');
    if (pForm) {
        pForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('menuPackageName').value.trim();
            const price = document.getElementById('menuPackagePrice').value;
            const desc = document.getElementById('menuPackageDesc').value.trim();
            const dealFileInput = document.getElementById('dealImageInput');
            const dealFile = dealFileInput ? dealFileInput.files[0] : null;

            if (!desc) {
                alert("Please add description details manually or tick items from grid!");
                return;
            }
            if (!BRANCH_DOC_ID) {
                alert("Session expired, please login again.");
                return;
            }

            // 🟢 NEW: Require image on CREATE, allow skip on EDIT
            if (!editPackageId && !dealFile) {
                alert("Please upload an image for this package!");
                return;
            }

            const saveBtn = document.getElementById('savePackageBtn');
            if (saveBtn) { saveBtn.innerText = "Saving..."; saveBtn.disabled = true; }

            const isEditingPackage = !!editPackageId;

            try {
                let imageUrl = "";

                // 🟢 NEW: Upload deal image to Cloudinary if a file was selected
                if (dealFile) {
                    const formData = new FormData();
                    formData.append("file", dealFile);
                    formData.append("upload_preset", UPLOAD_PRESET);
                    const res = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
                    const d = await res.json();
                    imageUrl = d.secure_url;
                }

                const packageData = {
                    name: name,
                    description: desc,
                    category: currentCategory,
                    prices: { simple: Number(price) },
                    updatedAt: Date.now()
                };

                // Only set imageUrl if we got one (don't overwrite existing on edit if no new file)
                if (imageUrl) {
                    packageData.imageUrl = imageUrl;
                }

                if (isEditingPackage) {
                    await db.collection("menu").doc(editPackageId).update(packageData);
                    alert(`${currentCategory} Updated Successfully inside Menu!`);
                    logActivity(`${currentCategory} Updated`, `Updated "${name}" - Rs. ${price}`);
                } else {
                    packageData.imageUrl = imageUrl || "https://via.placeholder.com/150";
                    packageData.branchId = BRANCH_DOC_ID;
                    packageData.createdAt = Date.now();
                    await db.collection("menu").add(packageData);
                    alert(`${currentCategory} Created Successfully inside Menu!`);
                    logActivity(`${currentCategory} Added`, `Created "${name}" - Rs. ${price}`);

                    // Let every customer know about the new combo/deal.
                    broadcastToAllCustomers(
                        `New ${currentCategory} Alert! 🎉`,
                        `${name} is now available for Rs. ${price}. Order now!`
                    );
                }

                resetPackageFormState();
                renderPackageSelectionGrid();

            } catch (err) {
                alert("Error saving layout: " + err.message);
            } finally {
                if (saveBtn) { saveBtn.innerText = isEditingPackage ? "Update & Save Package" : "Create & Save Package"; saveBtn.disabled = false; }
            }
        });
    }
});

// --- Modal Functions ---
window.closeModal = function () {
    document.getElementById('addModal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById('itemName').value = "";
    document.getElementById('itemDesc').value = "";

    const fileInput = document.getElementById('itemImage');
    if (fileInput) fileInput.value = "";

    document.getElementById('imagePreviewContainer').style.display = 'none';
    editDocId = null;
}

window.previewImage = function (event) {
    const reader = new FileReader();
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImg = document.getElementById('imagePreview');
    reader.onload = function () {
        if (reader.readyState === 2) {
            previewImg.src = reader.result;
            previewContainer.style.display = 'block';
        }
    }
    if (event.target.files[0]) reader.readAsDataURL(event.target.files[0]);
};

window.openModal = function (isEdit, docId = null, data = null) {
    document.getElementById('addModal').style.display = 'block';
    document.getElementById('modalOverlay').style.display = 'block';
    editDocId = docId;

    const sections = ['standardSizesSection', 'wingsPiecesSection', 'simplePriceSection', 'softDrinksSection'];
    sections.forEach(id => {
        const s = document.getElementById(id);
        if (s) s.style.display = 'none';
    });

    const ingredientsLabel = document.getElementById('ingredientsLabel');
    const ingredientsInput = document.getElementById('itemDesc');

    if (currentCategory === 'SOFT DRINK') {
        if (document.getElementById('softDrinksSection')) document.getElementById('softDrinksSection').style.display = 'block';
        if (ingredientsLabel) ingredientsLabel.style.display = 'none';
        if (ingredientsInput) ingredientsInput.style.display = 'none';
    } else {
        if (ingredientsLabel) ingredientsLabel.style.display = 'block';
        if (ingredientsInput) ingredientsInput.style.display = 'block';

        if (currentCategory === 'WINGS') {
            if (document.getElementById('wingsPiecesSection')) document.getElementById('wingsPiecesSection').style.display = 'block';
        } else if (currentCategory === 'PIZZA') {
            if (document.getElementById('standardSizesSection')) document.getElementById('standardSizesSection').style.display = 'block';
        } else {
            if (document.getElementById('simplePriceSection')) document.getElementById('simplePriceSection').style.display = 'block';
        }
    }

    ['small', 'medium', 'large', 'xlarge', '6pcs', '12pcs', '05l', '1l', '15l', '2l'].forEach(s => {
        const cb = document.getElementById(`size-${s}`);
        const pr = document.getElementById(`price-${s}`);
        if (cb) cb.checked = false;
        if (pr) pr.value = "";
    });

    const simplePriceInput = document.getElementById('price-simple');
    if (simplePriceInput) simplePriceInput.value = "";

    if (isEdit && data) {
        document.getElementById('modalTitle').innerText = "Edit Item";
        document.getElementById('itemName').value = data.name || "";
        document.getElementById('itemDesc').value = data.description || "";
        if (data.imageUrl) {
            document.getElementById('imagePreview').src = data.imageUrl;
            document.getElementById('imagePreviewContainer').style.display = 'block';
        }
        if (data.prices) {
            Object.keys(data.prices).forEach(s => {
                if (s === 'simple') {
                    if (simplePriceInput) simplePriceInput.value = data.prices[s];
                } else {
                    const cb = document.getElementById(`size-${s}`);
                    const pr = document.getElementById(`price-${s}`);
                    if (cb) { cb.checked = true; if (pr) pr.value = data.prices[s]; }
                }
            });
        }
    } else {
        document.getElementById('modalTitle').innerText = "Add Item";
    }
}

// --- SAVE MENU ITEM ---
window.saveItem = async function () {
    const name = document.getElementById('itemName').value.trim();
    const description = document.getElementById('itemDesc').value.trim();
    const fileInput = document.getElementById('itemImage');
    const file = fileInput ? fileInput.files[0] : null;
    const prices = {};
    let priceSelected = false;

    const isSoftDrink = (currentCategory === 'SOFT DRINK');

    if (!name) { alert("Please enter the item name!"); return; }
    if (!isSoftDrink && !description) { alert("Please enter the item ingredients/description!"); return; }
    if (!editDocId && !file) { alert("Please upload an image for the menu item!"); return; }

    const checkSizes = (list) => {
        list.forEach(s => {
            const cb = document.getElementById(`size-${s}`);
            const pr = document.getElementById(`price-${s}`);
            if (cb && cb.checked) {
                const val = parseFloat(pr.value);
                if (!pr.value || isNaN(val) || val <= 0) {
                    alert(`Please enter a valid price for size: ${s.toUpperCase()}`);
                    priceSelected = "INVALID";
                } else {
                    if (priceSelected !== "INVALID") { prices[s] = val; priceSelected = true; }
                }
            }
        });
    };

    if (currentCategory === 'WINGS') { checkSizes(['6pcs', '12pcs']); }
    else if (currentCategory === 'PIZZA') { checkSizes(['small', 'medium', 'large', 'xlarge']); }
    else if (isSoftDrink) { checkSizes(['05l', '1l', '15l', '2l']); }
    else {
        const prSimple = document.getElementById('price-simple').value;
        const valSimple = parseFloat(prSimple);
        if (prSimple && !isNaN(valSimple) && valSimple > 0) { prices['simple'] = valSimple; priceSelected = true; }
    }

    if (priceSelected === "INVALID" || !priceSelected) {
        alert("Please select at least one size/option and enter a valid price!");
        return;
    }
    if (!BRANCH_DOC_ID) { alert("Error: No active branch ID found. Please login again!"); return; }

    const sBtn = document.getElementById('saveBtn');
    sBtn.innerText = "Saving..."; sBtn.disabled = true;

    const isEditingItem = !!editDocId;

    try {
        let imageUrl = "";
        if (file) {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("upload_preset", UPLOAD_PRESET);
            const res = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
            const d = await res.json();
            imageUrl = d.secure_url;
        }

        const itemData = {
            name,
            description: isSoftDrink ? "" : description,
            category: currentCategory,
            prices,
            branchId: BRANCH_DOC_ID,
            updatedAt: Date.now()
        };

        if (imageUrl) itemData.imageUrl = imageUrl;

        if (isEditingItem) {
            await db.collection("menu").doc(editDocId).update(itemData);
            alert("Item Updated Successfully!");
            logActivity("Menu Item Updated", `Updated "${name}" in ${currentCategory} (${formatPricesForLog(prices)})`);
        } else {
            if (!imageUrl) itemData.imageUrl = "https://via.placeholder.com/150";
            itemData.createdAt = Date.now();
            await db.collection("menu").add(itemData);
            alert("Item Added Successfully!");
            logActivity("Menu Item Added", `Added "${name}" to ${currentCategory} (${formatPricesForLog(prices)})`);

            // Let every customer know about the new menu item.
            broadcastToAllCustomers(
                "New Item Added! 🍽️",
                `${name} is now available in ${currentCategory}. Order now!`
            );
        }
        window.closeModal();
    } catch (e) {
        console.error(e);
        alert("Error: Could not save item!");
    } finally {
        sBtn.innerText = "Save";
        sBtn.disabled = false;
    }
}

// --- LOAD MENU ITEMS ---
window.loadMenuItems = function (category) {
    currentCategory = category.toUpperCase();
    const menuTable = document.getElementById('menuTable');
    const toppingsSection = document.getElementById('toppingsSection');
    const tableSection = document.getElementById('standardMenuTableSection');
    const packageSection = document.getElementById('packageCreationSection');
    const addItemBtn = document.querySelector('.btn-add-item') || document.getElementById('addItemBtn');

    resetPackageFormState();

    if (currentCategory === 'DEALS' || currentCategory === 'COMBO') {
        if (tableSection) tableSection.style.display = 'none';
        if (toppingsSection) toppingsSection.style.display = 'none';
        if (addItemBtn) addItemBtn.style.display = 'none';
        if (packageSection) packageSection.style.display = 'block';

        const pTitle = document.getElementById('packagePageTitle');
        if (pTitle) pTitle.innerText = `Create New ${currentCategory}`;

        const pHeading = document.getElementById('savedPackagesHeading');
        if (pHeading) pHeading.innerText = `Active Created ${currentCategory}s`;

        packageSelectedItems = [];
        const pForm = document.getElementById('menuPackageForm');
        if (pForm) pForm.reset();
        const pDesc = document.getElementById('menuPackageDesc');
        if (pDesc) pDesc.value = '';

        // 🟢 Reset deal image preview
        dealBase64Image = "";
        const dealImagePreview = document.getElementById('dealImagePreview');
        if (dealImagePreview) {
            dealImagePreview.src = "https://via.placeholder.com/120";
            dealImagePreview.style.border = "2px dashed #b52a00";
        }
        const dealImageInput = document.getElementById('dealImageInput');
        if (dealImageInput) dealImageInput.value = "";

        loadPackageItemsFromFirestore();
        fetchSavedPackagesLive();
        return;
    }

    if (tableSection) tableSection.style.display = 'block';
    if (addItemBtn) addItemBtn.style.display = 'block';
    if (packageSection) packageSection.style.display = 'none';
    if (packagesListUnsubscribe) { packagesListUnsubscribe(); packagesListUnsubscribe = null; }

    const showToppingsFor = ['PIZZA', 'BURGER', 'PARATHA ROLL', 'FRIES'];
    if (showToppingsFor.includes(currentCategory)) {
        if (toppingsSection) { toppingsSection.style.display = 'block'; loadToppings(); }
    } else {
        if (toppingsSection) toppingsSection.style.display = 'none';
        if (toppingsUnsubscribe) { toppingsUnsubscribe(); toppingsUnsubscribe = null; }
    }

    const tableHeader = document.querySelector('.table-header');
    const isSoftDrink = (currentCategory === 'SOFT DRINK');

    if (tableHeader) {
        if (isSoftDrink) {
           tableHeader.innerHTML = `<span>Image</span><span>Name</span><span style="padding-left: 425px;">Price</span><span style="text-align:right">Actions</span>`;
tableHeader.style.gridTemplateColumns = "80px 1px 1fr 100px";
        } else {
tableHeader.innerHTML = `<span>Image</span><span>Name</span><span>Ingredients</span><span style="padding-left: 40px;">Price</span><span style="text-align:right">Actions</span>`;
           tableHeader.style.gridTemplateColumns = "80px 150px 1fr 120px 150px";
        }
    }

    if (unsubscribe) unsubscribe();

    unsubscribe = db.collection("menu")
        .where("category", "==", currentCategory)
        .where("branchId", "==", BRANCH_DOC_ID)
        .onSnapshot(snap => {
            if (!menuTable) return;
            menuTable.innerHTML = "";
            if (snap.empty) {
                menuTable.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding:20px; color:#666;">No items found in ${currentCategory} for this branch.</p>`;
                return;
            }
            snap.forEach(doc => {
                const d = doc.data();
                const p = d.prices || {};
                let priceHtml = "";

                if (currentCategory === 'WINGS') {
                    if (p['6pcs']) priceHtml += `<div>Rs. ${p['6pcs']} (6pcs)</div>`;
                    if (p['12pcs']) priceHtml += `<div>Rs. ${p['12pcs']} (12pcs)</div>`;
                } else if (currentCategory === 'PIZZA') {
                    ['small', 'medium', 'large', 'xlarge'].forEach(s => { if (p[s]) priceHtml += `<div>Rs. ${p[s]} (${s.charAt(0).toUpperCase()})</div>`; });
                } else if (isSoftDrink) {
                    ['05l', '1l', '15l', '2l'].forEach(s => { if (p[s]) priceHtml += `<div>Rs. ${p[s]} (${s.replace('05l', '0.5L').replace('15l', '1.5L').replace('1l', '1L').replace('2l', '2L')})</div>`; });
                } else {
                    priceHtml = `Rs. ${p.simple || 0}`;
                }

                const rowStyle = isSoftDrink ? 'style="grid-template-columns: 80px 1fr 0px 1fr 100px;"' : '';
                menuTable.innerHTML += `
                    <div class="row" ${rowStyle}>
                        <img src="${d.imageUrl || 'https://via.placeholder.com/45'}">
                        <span style="font-weight:bold;">${d.name}</span>
                        <span>${isSoftDrink ? "" : (d.description || "")}</span>
                        <div style="color:#b52a00; font-weight:bold;">${priceHtml}</div>
                        <div class="col-actions">
                            <button onclick="requestEdit('${doc.id}')" class="btn-edit">Edit</button>
                            <button onclick="requestDelete('${doc.id}')" class="btn-delete">Delete</button>
                        </div>
                    </div>`;
            });
        });
};

// --- PACKAGE ITEMS FROM FIRESTORE ---
function loadPackageItemsFromFirestore() {
    if (!BRANCH_DOC_ID) return;

    db.collection("menu")
        .where("branchId", "==", BRANCH_DOC_ID)
        .onSnapshot((snapshot) => {
            packageAllItems = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                const itemCat = data.category ? data.category.toUpperCase().trim() : 'GENERAL';
                if (itemCat !== 'DEALS' && itemCat !== 'COMBO') {
                    packageAllItems.push({ name: data.name, category: itemCat, prices: data.prices || {} });
                }
            });
            renderPackageSelectionGrid();
        });
}

window.filterPackageGrid = function (event, miniCat) {
    if (event && event.preventDefault) event.preventDefault();
    currentPackageMiniCategory = miniCat.toUpperCase().trim();

    const subTabs = document.querySelectorAll('.mini-tabs .mini-tab');
    subTabs.forEach(tab => {
        tab.classList.toggle('active', tab.innerText.toUpperCase().trim() === currentPackageMiniCategory);
    });

    renderPackageSelectionGrid();
};

function renderPackageSelectionGrid() {
    const gridContainer = document.getElementById('package-items-selection-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';
    const filtered = packageAllItems.filter(item => item.category === currentPackageMiniCategory);

    if (filtered.length === 0) {
        gridContainer.innerHTML = `<p style="padding:15px; color:#666; font-weight:500; text-align:center; font-size:13px;">No items found under ${currentPackageMiniCategory}.</p>`;
        return;
    }

    filtered.forEach(item => {
        let sizesHTML = '';
        const p = item.prices || {};

        const makeCheck = (sizeKey, label) => {
    const fullName = `${item.name} (${label})`;
    // Check existing quantity
    const existingEntry = packageSelectedItems.find(i => i.startsWith(fullName));
    const existingQty   = existingEntry
        ? parseInt(existingEntry.replace(fullName, '').replace('x', '').trim()) || 1
        : 0;
    const isChecked = existingQty > 0;

    return `<div class="size-row" style="margin:6px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <input type="checkbox"
            data-packageitem="${fullName}"
            ${isChecked ? 'checked' : ''}
            onchange="togglePackageItemSelection(this)"
            style="cursor:pointer;transform:scale(1.1);">
        <span style="color:#333;font-size:13px;flex:1;">${label} - Rs. ${p[sizeKey]}</span>
        <div style="display:${isChecked ? 'flex' : 'none'};align-items:center;gap:6px;" id="qty-wrap-${fullName.replace(/[^a-zA-Z0-9]/g,'_')}">
            <button type="button"
                onclick="changeQty('${fullName}', -1)"
                style="background:#b52a00;color:white;border:none;width:24px;height:24px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1;font-weight:bold;">−</button>
            <span id="qty-display-${fullName.replace(/[^a-zA-Z0-9]/g,'_')}"
                style="font-weight:bold;font-size:14px;min-width:20px;text-align:center;color:#b52a00;">
                ${isChecked ? existingQty : 1}
            </span>
            <button type="button"
                onclick="changeQty('${fullName}', 1)"
                style="background:#b52a00;color:white;border:none;width:24px;height:24px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1;font-weight:bold;">+</button>
        </div>
    </div>`;
};

        if (p.small) sizesHTML += makeCheck('small', 'Small');
        if (p.medium) sizesHTML += makeCheck('medium', 'Medium');
        if (p.large) sizesHTML += makeCheck('large', 'Large');
        if (p.xlarge) sizesHTML += makeCheck('xlarge', 'X-Large');
        if (p['6pcs']) sizesHTML += makeCheck('6pcs', '6 Pcs');
        if (p['12pcs']) sizesHTML += makeCheck('12pcs', '12 Pcs');
        if (p['05l']) sizesHTML += makeCheck('05l', '0.5L');
        if (p['1l']) sizesHTML += makeCheck('1l', '1L');
        if (p['15l']) sizesHTML += makeCheck('15l', '1.5L');
        if (p['2l']) sizesHTML += makeCheck('2l', '2L');
                if (!sizesHTML && p.simple) {
            const fullName    = item.name;
            const existingEntry = packageSelectedItems.find(i => i === fullName || i.startsWith(fullName + ' x'));
            const existingQty   = existingEntry
                ? parseInt(existingEntry.replace(fullName, '').replace(' x', '').trim()) || 1
                : 0;
            const isChecked = existingQty > 0;
            const safeId    = fullName.replace(/[^a-zA-Z0-9]/g, '_');

            sizesHTML += `
                <div class="size-row" style="margin:6px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <input type="checkbox"
                        data-packageitem="${fullName}"
                        ${isChecked ? 'checked' : ''}
                        onchange="togglePackageItemSelection(this)"
                        style="cursor:pointer;transform:scale(1.1);">
                    <span style="color:#333;font-size:13px;flex:1;">Standard - Rs. ${p.simple}</span>
                    <div style="display:${isChecked ? 'flex' : 'none'};align-items:center;gap:6px;" id="qty-wrap-${safeId}">
                        <button type="button"
                            onclick="changeQty('${fullName}', -1)"
                            style="background:#b52a00;color:white;border:none;width:24px;height:24px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1;font-weight:bold;">−</button>
                        <span id="qty-display-${safeId}"
                            style="font-weight:bold;font-size:14px;min-width:20px;text-align:center;color:#b52a00;">
                            ${isChecked ? existingQty : 1}
                        </span>
                        <button type="button"
                            onclick="changeQty('${fullName}', 1)"
                            style="background:#b52a00;color:white;border:none;width:24px;height:24px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1;font-weight:bold;">+</button>
                    </div>
                </div>`;
        }
        gridContainer.innerHTML += `
            <div class="selection-item-card" style="background:#fff8ee; padding:10px; margin-bottom:10px; border-radius:8px; border-left:4px solid #b52a00; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                <div style="font-size:10px; background:#b52a00; color:#fff; display:inline-block; padding:1px 5px; border-radius:4px; font-weight:bold; margin-bottom:4px;">${item.category}</div>
                <div style="font-weight:700; color:#222; margin-bottom:4px; font-size:14px;">${item.name}</div>
                <div class="sizes-box" style="padding-left:3px;">${sizesHTML}</div>
            </div>`;
    });
}

window.togglePackageItemSelection = function (checkbox) {
    const name    = checkbox.getAttribute('data-packageitem');
    const safeId  = name.replace(/[^a-zA-Z0-9]/g, '_');
    const qtyWrap = document.getElementById(`qty-wrap-${safeId}`);

    if (checkbox.checked) {
        if (qtyWrap) qtyWrap.style.display = 'flex';
        // Exact match ya x-wala entry nahi hai to add karo
        const alreadyExists = packageSelectedItems.some(i => i === name || i === `${name} x1` || i.match(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} x\\d+$`)));
        if (!alreadyExists) {
            packageSelectedItems.push(`${name} x1`);
        }
    } else {
        if (qtyWrap) qtyWrap.style.display = 'none';
        // Exact match remove karo
        packageSelectedItems = packageSelectedItems.filter(i => {
            return !(i === name || i === `${name} x1` || i.match(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} x\\d+$`)));
        });
    }
    updateDescTextarea();
};

window.changeQty = function(name, delta) {
    const safeId     = name.replace(/[^a-zA-Z0-9]/g, '_');
    const qtyDisplay = document.getElementById(`qty-display-${safeId}`);
    const checkbox   = document.querySelector(`[data-packageitem="${name}"]`);
    const regex      = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} x(\\d+)$`);

    const existingIndex = packageSelectedItems.findIndex(i => i === name || regex.test(i));
    let currentQty = 1;

    if (existingIndex !== -1) {
        const match = packageSelectedItems[existingIndex].match(/x(\d+)$/);
        currentQty  = match ? parseInt(match[1]) : 1;
    }

    const newQty = Math.max(1, currentQty + delta);

    if (existingIndex !== -1) {
        packageSelectedItems[existingIndex] = `${name} x${newQty}`;
    } else {
        packageSelectedItems.push(`${name} x${newQty}`);
        if (checkbox) checkbox.checked = true;
    }

    if (qtyDisplay) qtyDisplay.innerText = newQty;
    updateDescTextarea();
};

// 🟢 Textarea update
function updateDescTextarea() {
    const txt = document.getElementById('menuPackageDesc');
    if (!txt) return;

    txt.value = packageSelectedItems.length === 0
        ? ''
        : packageSelectedItems.map((item, index) => {
            // x1 ho to number nahi dikhana
            const display = item.replace(/ x1$/, '');
            return `${index + 1}. ${display}`;
        }).join('\n');
}

// --- EDIT PACKAGE ---
window.editPackage = async function (id) {
    try {
        const doc = await db.collection("menu").doc(id).get();
        if (!doc.exists) { alert("Package data not found!"); return; }

        const data = doc.data();
        editPackageId = id;

        document.getElementById('menuPackageName').value = data.name || '';
        document.getElementById('menuPackagePrice').value = data.prices ? (data.prices.simple || '') : '';
        document.getElementById('menuPackageDesc').value = data.description || '';

        // 🟢 Show existing image in preview when editing
        const dealImagePreview = document.getElementById('dealImagePreview');
        if (dealImagePreview && data.imageUrl) {
            dealImagePreview.src = data.imageUrl;
            dealImagePreview.style.border = "2px solid #b52a00";
        }

        const pTitle = document.getElementById('packagePageTitle');
        if (pTitle) pTitle.innerText = `Edit Existing ${currentCategory}`;

        const saveBtn = document.getElementById('savePackageBtn');
        if (saveBtn) saveBtn.innerText = "Update & Save Package";

        packageSelectedItems = [];
        if (data.description) {
            packageSelectedItems = data.description.split('\n')
                .map(line => line.replace(/^\d+\.\s*/, '').trim())
                .filter(line => line.length > 0);
        }

        renderPackageSelectionGrid();
        document.getElementById('packagePageTitle').scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        console.error("Error fetching package details for edit:", err);
        alert("Failed to load package details.");
    }
};

// --- RESET PACKAGE FORM ---
function resetPackageFormState() {
    editPackageId = null;
    packageSelectedItems = [];

    const pForm = document.getElementById('menuPackageForm');
    if (pForm) pForm.reset();

    const pTitle = document.getElementById('packagePageTitle');
    if (pTitle) pTitle.innerText = `Create New ${currentCategory}`;

    const saveBtn = document.getElementById('savePackageBtn');
    if (saveBtn) saveBtn.innerText = "Create & Save Package";

    const pDescField = document.getElementById('menuPackageDesc');
    if (pDescField) pDescField.value = '';

    // 🟢 Reset deal image fields
    dealBase64Image = "";
    const dealImagePreview = document.getElementById('dealImagePreview');
    if (dealImagePreview) {
        dealImagePreview.src = "https://via.placeholder.com/120";
        dealImagePreview.style.border = "2px dashed #b52a00";
    }
    const dealImageInput = document.getElementById('dealImageInput');
    if (dealImageInput) dealImageInput.value = "";
}

// --- SAVED PACKAGES LIVE TABLE ---
function fetchSavedPackagesLive() {
    const tableBody = document.getElementById('savedPackagesTableBody');
    if (!tableBody) return;

    if (packagesListUnsubscribe) packagesListUnsubscribe();

    tableBody.innerHTML = '<p style="text-align:center; padding:15px; color:#999; font-size:13px;">Updating records summary view...</p>';

    packagesListUnsubscribe = db.collection("menu")
        .where("category", "==", currentCategory)
        .where("branchId", "==", BRANCH_DOC_ID)
        .onSnapshot((querySnapshot) => {
            tableBody.innerHTML = '';
            if (querySnapshot.empty) {
                tableBody.innerHTML = `<p style="text-align:center; padding:15px; color:#999; font-size:13px; grid-column: 1/-1;">No ${currentCategory.toLowerCase()}s built under this branch yet.</p>`;
                return;
            }

            querySnapshot.forEach((doc) => {
                const pkg = doc.data();
                const pkgId = doc.id;
                const priceVal = pkg.prices ? (pkg.prices.simple || 0) : 0;

                // 🟢 Show package image in the table row
                const imgSrc = pkg.imageUrl || 'https://via.placeholder.com/50';

                const row = document.createElement('div');
                row.className = 'saved-pkg-row';
                row.style.cssText = 'display:grid; grid-template-columns: 60px 2fr 3fr 1.5fr 1.5fr; padding:12px; border-bottom:1px solid #eee; align-items:center; background:#fff;';

                row.innerHTML = `
                    <img src="${imgSrc}" alt="${pkg.name}" style="width:50px; height:50px; object-fit:cover; border-radius:8px; border:1px solid #eee;">
                    <span style="font-weight:bold; color:#333; font-size:13px;">${pkg.name}</span>
                    <span style="color:#666; font-size:12px; white-space:pre-line; line-height:1.3;">${pkg.description || ''}</span>
                    <span style="font-weight:bold; color:#b52a00; font-size:13px;">Rs. ${priceVal}</span>
                    <div style="display:flex; gap:8px; justify-content:center; align-items:center;">
                        <button onclick="editPackage('${pkgId}')" style="background:#004d61; color:#fff; border:none; padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">Edit</button>
                        <button onclick="requestDelete('${pkgId}')" style="background:#b52a00; color:#fff; border:none; padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">Delete</button>
                    </div>
                `;
                tableBody.appendChild(row);
            });
        }, err => {
            console.error("Error reading packages stream:", err);
            tableBody.innerHTML = '<p style="text-align:center; padding:15px; color:red; font-size:13px; grid-column:1/-1;">Error sync data records.</p>';
        });
}

// --- Topping Functions ---
window.openToppingModal = function (isEdit = false, id = null, data = null) {
    document.getElementById('toppingModal').style.display = 'block';
    document.getElementById('modalOverlay').style.display = 'block';

    const nameInput = document.getElementById('topName');
    const priceInput = document.getElementById('topPrice');
    editToppingId = id;

    if (isEdit && data) {
        nameInput.value = data.name || "";
        priceInput.value = data.price || "";
    } else {
        nameInput.value = "";
        priceInput.value = "";
    }
};

window.closeToppingModal = function () {
    document.getElementById('toppingModal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'none';
    if (document.getElementById('topName')) document.getElementById('topName').value = "";
    if (document.getElementById('topPrice')) document.getElementById('topPrice').value = "";
    editToppingId = null;
};

window.saveTopping = async function () {
    const nameInput = document.getElementById('topName');
    const priceInput = document.getElementById('topPrice');
    if (!nameInput || !priceInput) return;

    const name = nameInput.value.trim();
    const price = priceInput.value.trim();

    if (!name || !price) { alert("Fill all Fields!"); return; }
    if (!BRANCH_DOC_ID) return alert("No active branch ID found!");

    const isEditingTopping = !!editToppingId;

    try {
        const toppingData = {
            name,
            price: parseFloat(price),
            category: currentCategory,
            branchId: BRANCH_DOC_ID,
            updatedAt: Date.now()
        };
        if (isEditingTopping) {
            await db.collection("toppings").doc(editToppingId).update(toppingData);
            alert("Topping Updated Successfully!");
            logActivity("Topping Updated", `Updated topping "${name}" (${currentCategory}) - Rs. ${price}`);
        } else {
            toppingData.createdAt = Date.now();
            await db.collection("toppings").add(toppingData);
            alert("Topping Added Successfully!");
            logActivity("Topping Added", `Added topping "${name}" (${currentCategory}) - Rs. ${price}`);
        }
        window.closeToppingModal();
    } catch (e) {
        console.error("Firebase Error:", e);
        alert("Error: Could not save topping " + e.message);
    }
};

window.requestToppingEdit = async (id) => {
    try {
        const doc = await db.collection("toppings").doc(id).get();
        if (doc.exists) window.openToppingModal(true, id, doc.data());
    } catch (e) {
        console.error("Edit Error:", e);
    }
};

function loadToppings() {
    const toppingsTable = document.getElementById('toppingsTable');
    if (!toppingsTable) return;
    if (toppingsUnsubscribe) toppingsUnsubscribe();

    toppingsUnsubscribe = db.collection("toppings")
        .where("category", "==", currentCategory)
        .where("branchId", "==", BRANCH_DOC_ID)
        .onSnapshot(snap => {
            toppingsTable.innerHTML = "";
            snap.forEach(doc => {
                const t = doc.data();
                toppingsTable.innerHTML += `
                    <div class="row" style="grid-template-columns: 1fr 1fr 120px; background-color: #fff9eb; margin-bottom: 5px; padding: 10px; align-items:center; border-radius:8px;">
                        <span style="font-weight:500; color: black;">${t.name}</span>
                        <span style="font-weight:bold; color:#b52a00;">Rs. ${t.price}</span>
                        <div class="col-actions">
                            <button onclick="requestToppingEdit('${doc.id}')" class="btn-edit" style="font-size:11px; padding: 4px 8px;">Edit</button>
                            <button onclick="deleteTopping('${doc.id}')" class="btn-delete" style="font-size:11px; padding: 4px 8px;">Delete</button>
                        </div>
                    </div>`;
            });
        });
}

window.deleteTopping = async function (id) {
    const agreed = await confirm("Are you sure you want to delete this topping?");
    if (agreed) {
        try {
            const doc = await db.collection("toppings").doc(id).get();
            const tData = doc.exists ? doc.data() : {};
            await db.collection("toppings").doc(id).delete();
            alert("Topping Deleted Successfully!");
            logActivity("Topping Removed", `Removed topping "${tData.name || id}" (${tData.category || currentCategory})`);
        } catch (e) {
            alert("Error: Could not delete topping.");
        }
    }
}

// --- Common Handlers ---
window.filterCategory = function (e, cat) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (e && e.target) e.target.classList.add('active');
    currentCategory = cat.toUpperCase();
    window.loadMenuItems(cat);
}

window.requestEdit = async id => {
    const doc = await db.collection("menu").doc(id).get();
    window.openModal(true, id, doc.data());
};

window.requestDelete = async (id) => {
    const agreed = await confirm("Are you sure you want to delete this item?");
    if (agreed) {
        try {
            const doc = await db.collection("menu").doc(id).get();
            const itemData = doc.exists ? doc.data() : {};
            const itemName = itemData.name || id;
            const itemCat = itemData.category || currentCategory;

            await db.collection("menu").doc(id).delete();
            alert("Item Action Processed Successfully!");
            logActivity("Menu Item Removed", `Removed "${itemName}" from ${itemCat}`);
        } catch (e) {
            alert("Error: Could not delete item.");
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
// 🟢 Sidebar Reviews Badge
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

document.addEventListener('DOMContentLoaded', () => {
    updateOrdersBadge();
    updateReviewsBadge();
});