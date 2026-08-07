// State awal berdasarkan referensi gambar
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

// Merender UI berdasarkan data
function renderChoices() {
    const container = document.getElementById('choices-container');
    container.innerHTML = '';

    vnData.forEach((group, groupIndex) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'choice-group';

        // Header/Title
        const titleBar = document.createElement('div');
        titleBar.className = 'choice-title-bar';
        titleBar.innerHTML = `
            <input type="text" class="edit-title" value="${group.title}" 
                   onchange="updateGroupTitle(${groupIndex}, this.value)">
            <button class="btn-delete" onclick="deleteGroup(${groupIndex})" title="Hapus Grup">×</button>
        `;
        groupDiv.appendChild(titleBar);

        // List Pilihan
        group.options.forEach((opt, optIndex) => {
            const btn = document.createElement('button');
            btn.className = 'choice-option';
            btn.innerHTML = `<span>${opt.text}</span> <span class="scene-badge">${opt.scene}</span>`;
            // Saat diklik, tambahkan ke rute
            btn.onclick = () => recordStep(opt.text, opt.scene);
            groupDiv.appendChild(btn);
        });

        // Form Tambah Pilihan Baru
        const addForm = document.createElement('div');
        addForm.className = 'add-option-form';
        addForm.innerHTML = `
            <input type="text" id="opt-text-${groupIndex}" placeholder="Teks (ex: 1 Lari)">
            <input type="text" id="opt-scene-${groupIndex}" placeholder="Scene (ex: Bad End)">
            <button onclick="addOption(${groupIndex})">Tambah</button>
        `;
        groupDiv.appendChild(addForm);

        container.appendChild(groupDiv);
    });
}

// Logika untuk mengatur rute
function recordStep(optionText, sceneText) {
    // Ambil kata pertama (biasanya angka) dari teks pilihan
    const identifier = optionText.split(' ')[0]; 
    const step = `${identifier}->${sceneText}`;
    
    currentRoute.push(step);
    updateRouteDisplay();
}

function updateRouteDisplay() {
    const activeRouteEl = document.getElementById('current-route-text');
    activeRouteEl.innerText = currentRoute.join('->');
}

function saveRouteLine() {
    if (currentRoute.length === 0) return;
    
    savedRoutes.push(currentRoute.join('->'));
    currentRoute = []; // Reset rute aktif
    
    const logEl = document.getElementById('route-log');
    logEl.innerHTML = savedRoutes.map(route => `<p>${route}</p>`).join('');
    updateRouteDisplay();
}

function clearCurrentRoute() {
    currentRoute = [];
    updateRouteDisplay();
}

// Logika Edit Data (Builder)
function addChoiceGroup() {
    vnData.push({
        title: `Choice ${vnData.length + 1}`,
        options: []
    });
    renderChoices();
}

function deleteGroup(index) {
    if(confirm("Yakin ingin menghapus Choice Group ini?")) {
        vnData.splice(index, 1);
        renderChoices();
    }
}

function updateGroupTitle(index, newTitle) {
    vnData[index].title = newTitle;
}

function addOption(groupIndex) {
    const textInput = document.getElementById(`opt-text-${groupIndex}`);
    const sceneInput = document.getElementById(`opt-scene-${groupIndex}`);
    
    if (textInput.value.trim() === '') {
        alert("Teks pilihan tidak boleh kosong!");
        return;
    }

    const sceneValue = sceneInput.value.trim() || 'Unknown Scene';

    vnData[groupIndex].options.push({
        text: textInput.value,
        scene: sceneValue
    });
    renderChoices();
}

// Inisialisasi saat web pertama dimuat
document.addEventListener('DOMContentLoaded', () => {
    renderChoices();
});
