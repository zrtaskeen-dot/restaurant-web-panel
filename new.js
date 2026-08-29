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

const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dqjqkwwwh/image/upload"; 
const UPLOAD_PRESET = "menuitem"; 

let currentCategory = 'PIZZA'; 
let editDocId = null;
let editToppingId = null; 
let unsubscribe = null; 
let toppingsUnsubscribe = null;

// --- Modal Functions ---
window.closeModal = function() {
    document.getElementById('addModal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById('itemName').value = "";
    document.getElementById('itemDesc').value = "";
    if(document.getElementById('itemImage')) document.getElementById('itemImage').value = ""; 
    document.getElementById('imagePreviewContainer').style.display = 'none';
    editDocId = null;
}

window.closeToppingModal = function() {
    document.getElementById('toppingModal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById('toppingName').value = "";
    document.getElementById('toppingPrice').value = "";
    editToppingId = null;
}

window.previewImage = function(event) {
    const reader = new FileReader();
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImg = document.getElementById('imagePreview');
    reader.onload = function() {
        if (reader.readyState === 2) {
            previewImg.src = reader.result;
            previewContainer.style.display = 'block';
        }
    }
    if (event.target.files[0]) reader.readAsDataURL(event.target.files[0]);
};

window.openModal = function(isEdit, docId = null, data = null) {
    document.getElementById('addModal').style.display = 'block';
    document.getElementById('modalOverlay').style.display = 'block';
    editDocId = docId;

    const sections = ['standardSizesSection', 'wingsPiecesSection', 'simplePriceSection', 'softDrinksSection'];
    sections.forEach(id => {
        const s = document.getElementById(id);
        if(s) s.style.display = 'none';
    });
    
    const ingredientsLabel = document.getElementById('ingredientsLabel'); 
    const ingredientsInput = document.getElementById('itemDesc'); 

    if (currentCategory === 'SOFT DRINK') {
        if(document.getElementById('softDrinksSection')) document.getElementById('softDrinksSection').style.display = 'block';
        if(ingredientsLabel) ingredientsLabel.style.display = 'none';
        if(ingredientsInput) ingredientsInput.style.display = 'none';
    } else {
        if(ingredientsLabel) ingredientsLabel.style.display = 'block';
        if(ingredientsInput) ingredientsInput.style.display = 'block';

        if (currentCategory === 'WINGS') {
            if(document.getElementById('wingsPiecesSection')) document.getElementById('wingsPiecesSection').style.display = 'block';
        } else if (currentCategory === 'PIZZA') {
            if(document.getElementById('standardSizesSection')) document.getElementById('standardSizesSection').style.display = 'block';
        } else {
            if(document.getElementById('simplePriceSection')) document.getElementById('simplePriceSection').style.display = 'block';
        }
    }

    ['small', 'medium', 'large', 'xlarge', '6pcs', '12pcs', '05l', '1l', '15l', '2l'].forEach(s => {
        const cb = document.getElementById(`size-${s}`);
        const pr = document.getElementById(`price-${s}`);
        if(cb) cb.checked = false;
        if(pr) pr.value = "";
    });

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
                const cb = document.getElementById(`size-${s}`);
                const pr = document.getElementById(`price-${s}`);
                if (cb) { cb.checked = true; if(pr) pr.value = data.prices[s]; }
            });
        }
    } else {
        document.getElementById('modalTitle').innerText = "Add Item";
    }
}

// --- Save Menu Item ---
window.saveItem = async function() {
    const name = document.getElementById('itemName').value.trim();
    const description = document.getElementById('itemDesc').value.trim();
    const fileInput = document.getElementById('itemImage');
    const file = fileInput.files[0];
    const prices = {};
    let priceSelected = false;

    const isSoftDrink = (currentCategory === 'SOFT DRINK');

    const checkSizes = (list) => {
        list.forEach(s => {
            const cb = document.getElementById(`size-${s}`);
            const pr = document.getElementById(`price-${s}`);
            if(cb && cb.checked && pr.value) { prices[s] = parseFloat(pr.value); priceSelected = true; }
        });
    };

    if (currentCategory === 'WINGS') checkSizes(['6pcs', '12pcs']);
    else if (currentCategory === 'PIZZA') checkSizes(['small', 'medium', 'large', 'xlarge']);
    else if (isSoftDrink) checkSizes(['05l', '1l', '15l', '2l']);
    else {
        const prSimple = document.getElementById('price-simple').value;
        if(prSimple) { prices['simple'] = parseFloat(prSimple); priceSelected = true; }
    }

    if(!name || !priceSelected || (!isSoftDrink && !description)) return alert("Fill all fields!");

    const sBtn = document.getElementById('saveBtn');
    sBtn.innerText = "Saving..."; sBtn.disabled = true;

    try {
        let imageUrl = "";
        if(file) {
            const formData = new FormData();
            formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET);
            const res = await fetch(CLOUDINARY_URL, {method: "POST", body: formData});
            const d = await res.json(); imageUrl = d.secure_url;
        }
        const itemData = { name, description: isSoftDrink ? "" : description, category: currentCategory, prices, updatedAt: Date.now() };
        if(imageUrl) itemData.imageUrl = imageUrl;
        if(editDocId) await db.collection("menu").doc(editDocId).update(itemData);
        else { itemData.createdAt = Date.now(); await db.collection("menu").add(itemData); }
        window.closeModal(); 
    } catch(e) { alert("Error!"); } finally { sBtn.innerText = "Save"; sBtn.disabled = false; }
}

// --- Load Menu Items ---
window.loadMenuItems = function(category) {
    currentCategory = category.toUpperCase();
    const menuTable = document.getElementById('menuTable');
    const toppingsSection = document.getElementById('toppingsSection');
    
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
            tableHeader.innerHTML = `<span>Image</span><span>Name</span><span style="display:none"></span><span>Price</span><span style="text-align:right">Actions</span>`;
            tableHeader.style.gridTemplateColumns = "80px 1fr 0px 1fr 100px";
        } else {
            tableHeader.innerHTML = `<span>Image</span><span>Name</span><span>Ingredients</span><span>Price</span><span style="text-align:right">Actions</span>`;
            tableHeader.style.gridTemplateColumns = "80px 1fr 1fr 1fr 100px";
        }
    }

    if (unsubscribe) unsubscribe();
    unsubscribe = db.collection("menu").where("category", "==", currentCategory).onSnapshot(snap => {
        menuTable.innerHTML = "";
        snap.forEach(doc => {
            const d = doc.data();
            const p = d.prices || {};
            let priceHtml = "";

            if (currentCategory === 'WINGS') {
                if(p['6pcs']) priceHtml += `<div>Rs. ${p['6pcs']} (6pcs)</div>`;
                if(p['12pcs']) priceHtml += `<div>Rs. ${p['12pcs']} (12pcs)</div>`;
            } else if (currentCategory === 'PIZZA') {
                ['small', 'medium', 'large', 'xlarge'].forEach(s => { if(p[s]) priceHtml += `<div>Rs. ${p[s]} (${s.charAt(0).toUpperCase()})</div>`; });
            } else if (isSoftDrink) {
                ['05l', '1l', '15l', '2l'].forEach(s => { if(p[s]) priceHtml += `<div>Rs. ${p[s]} (${s.replace('05l','0.5L').replace('l','L')})</div>`; });
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

// --- FIXED Topping Functions (Matched with your HTML IDs) ---

window.openToppingModal = function(isEdit = false, id = null, data = null) {
    document.getElementById('toppingModal').style.display = 'block';
    document.getElementById('modalOverlay').style.display = 'block';
    
    // Aapke HTML mein IDs 'topName' aur 'topPrice' hain
    const nameInput = document.getElementById('topName');
    const priceInput = document.getElementById('topPrice');
    
    editToppingId = id;

    if (isEdit && data) {
        // Edit mode: Purana data (e.g. Extra Cheese) box mein dikhao
        nameInput.value = data.name || "";
        priceInput.value = data.price || "";
    } else {
        // Add mode: Boxes khali rakho
        nameInput.value = "";
        priceInput.value = "";
    }
};

window.saveTopping = async function() {
    // HTML se matching IDs: topName aur topPrice
    const nameInput = document.getElementById('topName');
    const priceInput = document.getElementById('topPrice');
    
    const name = nameInput.value.trim();
    const price = priceInput.value.trim();

    if (!name || !price) {
        alert("Naam aur Price likhna zaroori hai!");
        return;
    }

    try {
        const toppingData = {
            name: name,
            price: parseFloat(price),
            category: currentCategory, 
            updatedAt: Date.now()
        };

        if (editToppingId) {
            // Agar purani topping edit ho rahi hai
            await db.collection("toppings").doc(editToppingId).update(toppingData);
            alert("Topping Update Ho Gayi!");
        } else {
            // Agar nayi topping add ho rahi hai
            toppingData.createdAt = Date.now();
            await db.collection("toppings").add(toppingData);
            alert("Nayi Topping Save Ho Gayi!");
        }
        window.closeToppingModal();
    } catch (e) {
        console.error("Firebase Error:", e);
        alert("Save nahi ho saka: " + e.message);
    }
};

window.closeToppingModal = function() {
    document.getElementById('toppingModal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'none';
    
    // Inputs ko clear karna zaroori hai
    if(document.getElementById('topName')) document.getElementById('topName').value = "";
    if(document.getElementById('topPrice')) document.getElementById('topPrice').value = "";
    
    editToppingId = null;
};

// Yeh function purana data fetch karke Modal mein bharta hai
window.requestToppingEdit = async (id) => {
    try {
        const doc = await db.collection("toppings").doc(id).get();
        if (doc.exists) {
            window.openToppingModal(true, id, doc.data());
        }
    } catch (e) {
        console.error("Edit Error:", e);
    }
};

function loadToppings() {
    const toppingsTable = document.getElementById('toppingsTable');
    if (toppingsUnsubscribe) toppingsUnsubscribe();
    // Only fetch toppings for the current active category
    toppingsUnsubscribe = db.collection("toppings").where("category", "==", currentCategory).onSnapshot(snap => {
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


window.deleteTopping = function(id) {
    if(confirm("Delete Topping?")) db.collection("toppings").doc(id).delete();
}

// --- Common Handlers ---
window.filterCategory = function(e, cat) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if(e && e.target) e.target.classList.add('active');
    window.loadMenuItems(cat);
}

window.requestEdit = async id => { 
    const doc = await db.collection("menu").doc(id).get(); 
    window.openModal(true, id, doc.data()); 
};

window.requestDelete = id => { if(confirm("Sure?")) db.collection("menu").doc(id).delete(); };

// Initial Load
window.loadMenuItems('PIZZA');