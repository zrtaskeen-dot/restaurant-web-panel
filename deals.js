// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: 'AIzaSyCwstpeM4MkOs9aNkh9faJQm-1jggbMZZE',
    appId: '1:848662087857:web:0c1349bc37248181a0fa90',
    messagingSenderId: '848662087857',
    projectId: 'resturant-e0389',
    authDomain: 'resturant-e0389.firebaseapp.com',
};

// Initialize Firebase
if (!firebase.apps.length) { 
    firebase.initializeApp(firebaseConfig); 
}
const db = firebase.firestore();

// FIXED LOGIC: Logged-in manager ki real branch ID local storage se fetch karna
const BRANCH_DOC_ID = localStorage.getItem("active_branch_id");
console.log("Deals/Combo Management Active Branch ID:", BRANCH_DOC_ID);

// Global States
let selectedItems = [];
let allDownloadedMenuItems = []; 
let currentActiveCategory = 'ALL';

// --- CHECKBOX CLICK FUNCTION (Handles auto-textarea numbering smoothly - UNTOUCHED) ---
window.toggleSizeSelection = function(checkbox) {
    const fullName = checkbox.getAttribute('data-fullname');

    if (checkbox.checked) {
        if (!selectedItems.includes(fullName)) {
            selectedItems.push(fullName);
        }
    } else {
        selectedItems = selectedItems.filter(item => item !== fullName);
    }

    // Textarea (Description) automatic update
    const descTextarea = document.getElementById('dealDesc');
    if (descTextarea) {
        if (selectedItems.length === 0) {
            descTextarea.value = '';
        } else {
            let formattedText = selectedItems.map((item, index) => `${index + 1}. ${item}`).join('\n');
            descTextarea.value = formattedText;
        }
    }
};

// --- REAL-TIME MENU FETCHER (Fetches items belonging to THIS active branch to create packages) ---
function loadMenuItems() {
    if (!BRANCH_DOC_ID) {
        console.error("Missing Branch ID in Deals Context");
        return;
    }

    db.collection("menu")
      .where("branchId", "==", BRANCH_DOC_ID)
      .onSnapshot((snapshot) => {
        allDownloadedMenuItems = []; 
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            
            // Hum DEALS aur COMBO ko yahan grid mein load nahi karenge taake manager deal ke andar deal select na kar sake
            const itemCat = data.category ? data.category.toUpperCase().trim() : 'GENERAL';
            if (itemCat !== 'DEALS' && itemCat !== 'COMBO') {
                allDownloadedMenuItems.push({
                    id: doc.id,
                    name: data.name || 'Unnamed Item',
                    category: itemCat, 
                    prices: data.prices || {} 
                });
            }
        });
        
        renderMenuGridFiltered();
    }, (error) => {
        console.error("Error fetching menu items: ", error);
    });
}

// --- Dynamic Memory Category Filtering (UNTOUCHED) ---
window.filterDealMenu = function(category) {
    currentActiveCategory = category.toUpperCase().trim();
    
    // Changing Active CSS Tab State
    const tabs = document.querySelectorAll('.cat-tab');
    tabs.forEach(tab => {
        if(tab.innerText.toUpperCase().trim() === category.toUpperCase().trim()) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    renderMenuGridFiltered();
};

// --- GRID RENDERING LOGIC WITH CORRECT STRUCTURE (UNTOUCHED) ---
function renderMenuGridFiltered() {
    const menuGridList = document.getElementById('menu-items-list');
    if (!menuGridList) return;

    menuGridList.innerHTML = '';

    let filteredItems = allDownloadedMenuItems;
    if (currentActiveCategory !== 'ALL') {
        filteredItems = allDownloadedMenuItems.filter(item => item.category === currentActiveCategory);
    }

    if (filteredItems.length === 0) {
        menuGridList.innerHTML = `<p style="text-align:center; padding:20px; font-weight:600; color:#666;">No items found under "${currentActiveCategory}".</p>`;
        return;
    }

    filteredItems.forEach((item) => {
        let sizesHTML = '';
        const p = item.prices || {}; 
        let hasAnySize = false;

        // Visual mapping rules matching menu.js types
        const isSmallChecked = selectedItems.includes(`${item.name} (Small)`) ? 'checked' : '';
        const isMediumChecked = selectedItems.includes(`${item.name} (Medium)`) ? 'checked' : '';
        const isLargeChecked = selectedItems.includes(`${item.name} (Large)`) ? 'checked' : '';
        const isXLargeChecked = selectedItems.includes(`${item.name} (X-Large)`) ? 'checked' : '';
        const is6PcsChecked = selectedItems.includes(`${item.name} (6 Pcs)`) ? 'checked' : '';
        const is12PcsChecked = selectedItems.includes(`${item.name} (12 Pcs)`) ? 'checked' : '';
        const is05LChecked = selectedItems.includes(`${item.name} (0.5L)`) ? 'checked' : '';
        const is1LChecked = selectedItems.includes(`${item.name} (1L)`) ? 'checked' : '';
        const is15LChecked = selectedItems.includes(`${item.name} (1.5L)`) ? 'checked' : '';
        const is2LChecked = selectedItems.includes(`${item.name} (2L)`) ? 'checked' : '';
        const isSimpleChecked = selectedItems.includes(item.name) ? 'checked' : '';

        // 1. Standard Sizes
        if (p.small) {
            sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (Small)" ${isSmallChecked} onchange="toggleSizeSelection(this)"><span>Small - Rs. ${p.small}</span></div>`;
            hasAnySize = true;
        }
        if (p.medium) {
            sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (Medium)" ${isMediumChecked} onchange="toggleSizeSelection(this)"><span>Medium - Rs. ${p.medium}</span></div>`;
            hasAnySize = true;
        }
        if (p.large) {
            sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (Large)" ${isLargeChecked} onchange="toggleSizeSelection(this)"><span>Large - Rs. ${p.large}</span></div>`;
            hasAnySize = true;
        }
        if (p.xlarge) {
            sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (X-Large)" ${isXLargeChecked} onchange="toggleSizeSelection(this)"><span>X-Large - Rs. ${p.xlarge}</span></div>`;
            hasAnySize = true;
        }

        // 2. Wings Sizes
        if (p['6pcs']) {
            sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (6 Pcs)" ${is6PcsChecked} onchange="toggleSizeSelection(this)"><span>6 Pieces - Rs. ${p['6pcs']}</span></div>`;
            hasAnySize = true;
        }
        if (p['12pcs']) {
            sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (12 Pcs)" ${is12PcsChecked} onchange="toggleSizeSelection(this)"><span>12 Pieces - Rs. ${p['12pcs']}</span></div>`;
            hasAnySize = true;
        }

        // 3. Soft Drink Sizes
        if (p['05l']) {
            sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (0.5L)" ${is05LChecked} onchange="toggleSizeSelection(this)"><span>0.5L - Rs. ${p['05l']}</span></div>`;
            hasAnySize = true;
        }
        if (p['1l']) {
            sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (1L)" ${is1LChecked} onchange="toggleSizeSelection(this)"><span>1L - Rs. ${p['1l']}</span></div>`;
            hasAnySize = true;
        }
        if (p['15l']) {
            sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (1.5L)" ${is15LChecked} onchange="toggleSizeSelection(this)"><span>1.5L - Rs. ${p['15l']}</span></div>`;
            hasAnySize = true;
        }
        if (p['2l']) {
            sizesHTML += `<div class="size-row"><input type="checkbox" data-fullname="${item.name} (2L)" ${is2LChecked} onchange="toggleSizeSelection(this)"><span>2L - Rs. ${p['2l']}</span></div>`;
            hasAnySize = true;
        }

        // 4. Simple Price Items
        if (!hasAnySize && (p.simple || data?.price)) {
            const finalPrice = p.simple || data?.price || 0;
            sizesHTML += `
                <div class="size-row">
                    <input type="checkbox" data-fullname="${item.name}" ${isSimpleChecked} onchange="toggleSizeSelection(this)">
                    <span>Standard - Rs. ${finalPrice}</span>
                </div>`;
        }

        menuGridList.innerHTML += `
            <div class="menu-item-block">
                <div class="deal-item-category">${item.category}</div>
                <div class="main-item-title">${item.name}</div>
                <div class="sizes-container" style="display: block !important; width: 100%;">
                    ${sizesHTML}
                </div>
            </div>
        `;
    });
}

// --- CREATE & SAVE NEW DEAL/COMBO (REDIRECTED TO MENU COLLECTION) ---
document.getElementById('dealForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const dealName = document.getElementById('dealName').value.trim();
    const dealPrice = document.getElementById('dealPrice').value;
    const dealDesc = document.getElementById('dealDesc').value.trim();
    
    // HTML Dropdown se 'DEALS' ya 'COMBO' ki value fetch karna (Agar HTML me select element na ho to default 'DEALS' rahega)
    const dealCategorySelector = document.getElementById('dealCategory');
    const selectedCategory = dealCategorySelector ? dealCategorySelector.value : 'DEALS';

    // Strict Validations
    if (!dealName) {
        alert("Please enter a name for this package!");
        return;
    }
    if (!dealPrice || Number(dealPrice) <= 0) {
        alert("Please enter a valid price!");
        return;
    }
    if (selectedItems.length === 0) {
        alert("Please select at least one item from the grid!");
        return;
    }
    if (!BRANCH_DOC_ID) {
        alert("Active branch token missing. Please login again!");
        return;
    }

    // NEW APPROACH: Data structure ko Menu schema ke mutabiq build kiya hai
    const menuPackageData = {
        name: dealName,
        description: dealDesc,                   // Auto-numbered items textarea se yahan save honge
        category: selectedCategory.toUpperCase(), // 'DEALS' ya 'COMBO'
        prices: {
            simple: Number(dealPrice)            // Fixed Single price standard layout ke liye
        },
        imageUrl: "https://via.placeholder.com/150", // Packages ke liye static layout image
        branchId: BRANCH_DOC_ID,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    try {
        // SAVING DIRECTLY TO MENU: Ab yeh seedha menu table me save hoga
        await db.collection("menu").add(menuPackageData);
        alert(`${selectedCategory} Created and Added to Menu Successfully!`);
        
        // Reset Form and Global Array
        document.getElementById('dealForm').reset();
        selectedItems = [];
        
        renderMenuGridFiltered();
        
    } catch (error) {
        alert("Error saving package to menu: " + error.message);
    }
});

// --- BOTTOM SECTION: DISPLAY ACTIVE PACKAGES (LOADS DIRECTLY FROM MENU VIA FILTERS) ---
function loadActiveDeals() {
    const dealsContainer = document.getElementById('active-deals-list');
    if (!dealsContainer) return;
    
    if (!BRANCH_DOC_ID) return;

    // Ab niche active list load karte waqt hum menu collection se 'DEALS' aur 'COMBO' dono ko live query karenge
    db.collection("menu")
      .where("branchId", "==", BRANCH_DOC_ID)
      .onSnapshot((snapshot) => {
        dealsContainer.innerHTML = '';
        
        let hasPackages = false;

        snapshot.forEach((doc) => {
            const data = doc.data();
            const id = doc.id;
            const itemCat = data.category ? data.category.toUpperCase().trim() : '';

            // Sirf DEALS aur COMBO wale items ko is bottom table list me render karna hai
            if (itemCat === 'DEALS' || itemCat === 'COMBO') {
                hasPackages = true;
                const priceDisplay = data.prices && data.prices.simple ? data.prices.simple : 0;

                dealsContainer.innerHTML += `
                    <div class="deals-row">
                        <span style="font-weight: bold; color: #b52a00;">${data.name} <small style="color:#555;">(${itemCat})</small></span>
                        <span>Rs. ${priceDisplay}</span>
                        <span style="font-size: 13px; color: #555; white-space: pre-line;">${data.description}</span>
                        <div>
                            <button class="btn-delete-deal" onclick="deleteDeal('${id}')">Delete</button>
                        </div>
                    </div>
                `;
            }
        });

        if (!hasPackages) {
            dealsContainer.innerHTML = '<p style="padding: 20px; text-align: center; color: #666; font-weight: 500;">No active deals or combos available for this branch.</p>';
        }
    }, (error) => {
        console.error("Firestore Packages Loader Error: ", error);
    });
}

// Delete Function (Deletes directly from menu collection)
window.deleteDeal = async (id) => {
    if (confirm("Are you sure you want to delete this package from the menu?")) {
        try {
            await db.collection("menu").doc(id).delete();
            alert("Package Deleted from Menu!");
        } catch (error) {
            alert("Error: " + error.message);
        }
    }
};

// Start Loaders on DOM load
document.addEventListener("DOMContentLoaded", () => {
    loadMenuItems();
    loadActiveDeals();
});