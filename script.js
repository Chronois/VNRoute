// Initial Default Data
let vnData = [
    {
        title: "Choice 1",
        options: [
            { text: "1 Ask her for dinner", scene: "Dinner Scene" },
            { text: "2 Go straight to home", scene: "Home Scene" }
        ]
    },
    {
        title: "Choice 2",
        options: [
            { text: "1 Stand for her", scene: "Bruised Scene" },
            { text: "2 Call the Police", scene: "Escape Scene" },
            { text: "3 Search other route", scene: "Safe Route" }
        ]
    }
];

let currentRoute = [];
let savedRoutes = [];

// Core Render Function
function renderApp() {
    const container = document.getElementById('choices-container');
    container.innerHTML = '';

    vnData.forEach((group, groupIndex) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'choice-group';

        // Group Header
        let htmlContent = `
            <div class="group-header">
                <input type="text" class="input-title" value="${group.title}" 
                       onchange="updateDataTitle(${groupIndex}, this.value)" placeholder="Nama Grup (ex: Choice 1)">
                <button class="btn-icon" onclick="deleteGroup(${groupIndex})" title="Hapus Grup">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="options-container">
        `;

        // Options List
        group.options.forEach((opt, optIndex) => {
            htmlContent += `
                <div class="option-item">
                    <input type="text" class="input-opt-text" value="${opt.text}" 
                           onchange="updateDataOptText(${groupIndex}, ${optIndex}, this.value)" placeholder="Teks Pilihan">
                    <input type="text" class="input-opt-scene" value="${opt.scene}" 
                           onchange="updateDataOptScene(${groupIndex}, ${optIndex}, this.value)" placeholder="Scene Tujuan">
                    
                    <button class="btn-record" onclick="recordStep(${groupIndex}, ${optIndex})" title="Catat rute ini">
                        <i class="fa-solid fa-play"></i> Rekam
                    </button>
                    <button class="btn-icon" onclick="deleteOption(${groupIndex}, ${optIndex})" title="Hapus Pilihan">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        });

        // Add Option Button
        htmlContent += `
            </div>
            <div class="add-option-row">
                <button class="btn-add-opt" onclick="addOption(${groupIndex})">
                    <i class="fa-solid fa-plus"></i> Tambah Pilihan Baru
                </button>
            </div>
        `;
        
        groupDiv.innerHTML = htmlContent;
        container.appendChild(groupDiv);
    });
}

// --- DATA UPDATERS (No Re-render needed to avoid losing focus) ---
window.updateDataTitle = function(gIndex, val) { vnData[gIndex].title = val; }
window.updateDataOptText = function(gIndex, oIndex, val) { vnData[gIndex].options[oIndex].text = val; }
window.updateDataOptScene = function(gIndex, oIndex, val) { vnData[gIndex].options[oIndex].scene = val; }


// --- DATA MODIFIERS (Requires Re-render) ---
window.addChoiceGroup = function() {
    vnData.push({ title: `Choice ${vnData.length + 1}`, options: [] });
    renderApp();
    scrollToBottom('choices-container');
}

window.deleteGroup = function(index) {
    if(confirm("Hapus seluruh grup pilihan ini?")) {
        vnData.splice(index, 1);
        renderApp();
    }
}

window.addOption = function(groupIndex) {
    vnData[groupIndex].options.push({ text: "", scene: "" });
    renderApp();
}

window.deleteOption = function(groupIndex, optIndex) {
    vnData[groupIndex].options.splice(optIndex, 1);
    renderApp();
}


// --- ROUTE TRACKING LOGIC ---
window.recordStep = function(groupIndex, optIndex) {
    const opt = vnData[groupIndex].options[optIndex];
    
    // Extract choice number/identifier (e.g., "1" from "1 Ask her")
    let identifier = opt.text.trim().split(' ')[0] || "[X]";
    let scene = opt.scene.trim() || "[Unknown Scene]";
    
    // Format: "1->Dinner Scene"
    const stepString = `${identifier}->${scene}`;
    currentRoute.push(stepString);
    
    updateRouteDisplay();
}

function updateRouteDisplay() {
    const currentRouteEl = document.getElementById('current-route');
    if (currentRoute.length === 0) {
        currentRouteEl.innerHTML = '<span class="typing-text">Silakan klik tombol "Rekam" pada pilihan...</span>';
    } else {
        // Gabungkan dengan panah (->) layaknya gambar referensi
        currentRouteEl.innerText = currentRoute.join('->');
    }
}

window.saveRouteLine = function() {
    if (currentRoute.length === 0) return;
    
    savedRoutes.push(currentRoute.join('->'));
    currentRoute = []; // Reset current route
    
    const historyEl = document.getElementById('route-history');
    historyEl.innerHTML = savedRoutes.map(route => `<p>${route}</p>`).join('');
    
    updateRouteDisplay();
    
    // Flash effect on dialogue box
    const box = document.querySelector('.vn-dialogue-box');
    box.style.borderColor = 'var(--vn-primary)';
    setTimeout(() => { box.style.borderColor = 'rgba(255, 255, 255, 0.8)'; }, 300);
}

window.clearCurrentRoute = function() {
    currentRoute = [];
    updateRouteDisplay();
}

// Utilities
function scrollToBottom(id) {
    const el = document.getElementById(id);
    setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
}

// Initial render
document.addEventListener('DOMContentLoaded', () => {
    renderApp();
});
