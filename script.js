/* =====================================================
   Visual Novel Route Tracker
   Vanilla JS, no build step. Data lives in localStorage,
   with data.json as the shipped default / re-import seed.
===================================================== */

const STORAGE_KEY = 'vnRouteTracker.v1';

const FALLBACK_DATA = {
  gameTitle: 'Untitled Visual Novel',
  choicePoints: [
    {
      id: 'cp1', label: 'Choice 1',
      options: [
        { id: 'cp1o1', text: 'Ask her for dinner' },
        { id: 'cp1o2', text: 'Go straight to home' }
      ]
    },
    {
      id: 'cp2', label: 'Choice 2',
      options: [
        { id: 'cp2o1', text: 'Stand for her' },
        { id: 'cp2o2', text: 'Call the Police' },
        { id: 'cp2o3', text: 'Search other route' }
      ]
    }
  ],
  routes: [
    {
      id: 'r1', name: 'Dinner Route',
      steps: [
        { choicePointId: 'cp1', optionId: 'cp1o1', scene: 'Dinner Scene' },
        { choicePointId: 'cp2', optionId: 'cp2o2', scene: 'Bruised Scene' }
      ],
      ending: { name: 'Bruised Scene', type: 'bad' }
    },
    {
      id: 'r2', name: 'Straight Home Route',
      steps: [
        { choicePointId: 'cp1', optionId: 'cp1o2', scene: '' },
        { choicePointId: 'cp2', optionId: 'cp2o2', scene: 'Escape Scene' }
      ],
      ending: { name: 'Escape Scene', type: 'normal' }
    }
  ]
};

let state = null;
let editingCpId = null;      // null => creating new choice point
let editingRouteId = null;   // null => creating new route
let cpOptionsDraft = [];     // [{id, text}]
let routeStepsDraft = [];    // [{choicePointId, optionId, scene}]

/* ---------------- persistence ---------------- */

async function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { /* fall through */ }
  }
  try {
    const res = await fetch('data.json', { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch (e) { /* file:// or no data.json — use fallback */ }
  return structuredClone(FALLBACK_DATA);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------------- toast ---------------- */

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

/* ---------------- tabs ---------------- */

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('is-active'));
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('is-active');
    });
  });
}

/* ---------------- render: choice map ---------------- */

function renderChoicePoints() {
  const list = document.getElementById('choicePointsList');
  if (!state.choicePoints.length) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <strong>No choice points yet</strong>
      Add the first branching moment from the game to start mapping it out.
    </div>`;
    return;
  }
  list.innerHTML = state.choicePoints.map((cp, i) => `
    <div class="cp-card" data-id="${escapeAttr(cp.id)}" tabindex="0" role="button" aria-label="Edit ${escapeAttr(cp.label)}">
      <div class="cp-eyebrow">Choice ${String(i + 1).padStart(2, '0')}</div>
      <div class="cp-label">${escapeHtml(cp.label)}</div>
      <div class="cp-options">
        ${cp.options.map(o => `<span class="cp-option-pill">${escapeHtml(o.text)}</span>`).join('') || '<span class="cp-option-pill">no options yet</span>'}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.cp-card').forEach(card => {
    card.addEventListener('click', () => openCpModal(card.dataset.id));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openCpModal(card.dataset.id); });
  });
}

/* ---------------- render: route book ---------------- */

const ENDING_LABELS = { good: 'Good End', bad: 'Bad End', normal: 'Normal End', true: 'True End', secret: 'Secret End' };

function findCp(id) { return state.choicePoints.find(c => c.id === id); }
function findOption(cp, optId) { return cp ? cp.options.find(o => o.id === optId) : null; }

function renderRouteStats() {
  const el = document.getElementById('routeStats');
  const total = state.routes.length;
  const endings = new Set(state.routes.map(r => r.ending.name.trim().toLowerCase()).filter(Boolean)).size;
  el.innerHTML = `
    <div class="stat"><span class="stat-num">${total}</span><span class="stat-label">Routes logged</span></div>
    <div class="stat"><span class="stat-num">${endings}</span><span class="stat-label">Distinct endings</span></div>
  `;
}

function renderRoutes(filter = '') {
  renderRouteStats();
  const list = document.getElementById('routesList');
  const q = filter.trim().toLowerCase();

  const routes = state.routes.filter(r => {
    if (!q) return true;
    const haystack = [
      r.name, r.ending.name,
      ...r.steps.map(s => {
        const cp = findCp(s.choicePointId);
        const opt = findOption(cp, s.optionId);
        return [cp ? cp.label : '', opt ? opt.text : '', s.scene].join(' ');
      })
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });

  if (!state.routes.length) {
    list.innerHTML = `<div class="empty-state">
      <strong>The book is empty</strong>
      Record your first playthrough to start tracing where each choice leads.
    </div>`;
    return;
  }
  if (!routes.length) {
    list.innerHTML = `<div class="empty-state">No routes match &ldquo;${escapeHtml(filter)}&rdquo;.</div>`;
    return;
  }

  list.innerHTML = routes.map(r => {
    const stepsHtml = r.steps.map(s => {
      const cp = findCp(s.choicePointId);
      const opt = findOption(cp, s.optionId);
      const cpLabel = cp ? cp.label : 'Deleted choice';
      const optText = opt ? opt.text : 'Deleted option';
      let html = `<div class="thread-node is-choice">
        <span class="node-dot"></span>
        <span class="node-choice-label">${escapeHtml(cpLabel)}</span>
        <span class="node-option-text">${escapeHtml(optText)}</span>
      </div>`;
      if (s.scene && s.scene.trim()) {
        html += `<div class="thread-node is-scene">
          <span class="node-dot"></span>
          <span class="node-scene-text">${escapeHtml(s.scene)}</span>
        </div>`;
      }
      return html;
    }).join('');

    const type = ENDING_LABELS[r.ending.type] ? r.ending.type : 'normal';
    return `
      <div class="route-card" data-id="${escapeAttr(r.id)}" tabindex="0" role="button" aria-label="Edit ${escapeAttr(r.name)}">
        <div class="route-card-head">
          <span class="route-name">${escapeHtml(r.name)}</span>
        </div>
        <div class="thread">${stepsHtml}</div>
        <div class="ending-stamp ending-${type}">${escapeHtml(r.ending.name || 'Untitled ending')} &middot; ${ENDING_LABELS[type]}</div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.route-card').forEach(card => {
    card.addEventListener('click', () => openRouteModal(card.dataset.id));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openRouteModal(card.dataset.id); });
  });
}

/* ---------------- choice point modal ---------------- */

function openCpModal(id) {
  editingCpId = id || null;
  const cp = id ? findCp(id) : null;
  document.getElementById('cpModalTitle').textContent = cp ? 'Edit Choice Point' : 'New Choice Point';
  document.getElementById('cpLabelInput').value = cp ? cp.label : `Choice ${state.choicePoints.length + 1}`;
  cpOptionsDraft = cp ? cp.options.map(o => ({ ...o })) : [{ id: uid('opt'), text: '' }, { id: uid('opt'), text: '' }];
  document.getElementById('cpDeleteBtn').hidden = !cp;
  renderCpOptionsEditor();
  document.getElementById('cpModal').hidden = false;
  document.getElementById('cpLabelInput').focus();
}

function closeCpModal() {
  document.getElementById('cpModal').hidden = true;
}

function renderCpOptionsEditor() {
  const wrap = document.getElementById('cpOptionsEditor');
  wrap.innerHTML = cpOptionsDraft.map((o, i) => `
    <div class="option-row" data-idx="${i}">
      <input type="text" value="${escapeAttr(o.text)}" placeholder="Option text" data-role="opt-text">
      <button type="button" class="row-remove" data-role="opt-remove" aria-label="Remove option">&times;</button>
    </div>
  `).join('');
  wrap.querySelectorAll('[data-role="opt-text"]').forEach((input, i) => {
    input.addEventListener('input', () => { cpOptionsDraft[i].text = input.value; });
  });
  wrap.querySelectorAll('[data-role="opt-remove"]').forEach((btn, i) => {
    btn.addEventListener('click', () => { cpOptionsDraft.splice(i, 1); renderCpOptionsEditor(); });
  });
}

function saveCp() {
  const label = document.getElementById('cpLabelInput').value.trim();
  const options = cpOptionsDraft.map(o => ({ id: o.id, text: o.text.trim() })).filter(o => o.text);
  if (!label) { showToast('Give this choice point a label first.'); return; }
  if (!options.length) { showToast('Add at least one option.'); return; }

  if (editingCpId) {
    const cp = findCp(editingCpId);
    cp.label = label;
    cp.options = options;
  } else {
    state.choicePoints.push({ id: uid('cp'), label, options });
  }
  saveState();
  renderChoicePoints();
  renderRoutes(document.getElementById('routeSearch').value);
  closeCpModal();
  showToast('Choice point saved.');
}

function deleteCp() {
  if (!editingCpId) return;
  const usedIn = state.routes.filter(r => r.steps.some(s => s.choicePointId === editingCpId));
  if (usedIn.length && !confirm(`This choice point is used in ${usedIn.length} route(s). Delete it anyway? Those steps will show as "Deleted choice".`)) return;
  state.choicePoints = state.choicePoints.filter(c => c.id !== editingCpId);
  saveState();
  renderChoicePoints();
  renderRoutes(document.getElementById('routeSearch').value);
  closeCpModal();
  showToast('Choice point deleted.');
}

/* ---------------- route modal ---------------- */

function openRouteModal(id) {
  editingRouteId = id || null;
  const r = id ? state.routes.find(x => x.id === id) : null;
  document.getElementById('routeModalTitle').textContent = r ? 'Edit Route' : 'Record Route';
  document.getElementById('routeNameInput').value = r ? r.name : '';
  document.getElementById('routeEndingInput').value = r ? r.ending.name : '';
  document.getElementById('routeEndingType').value = r ? r.ending.type : 'normal';
  routeStepsDraft = r ? r.steps.map(s => ({ ...s })) : (state.choicePoints[0] ? [{ choicePointId: state.choicePoints[0].id, optionId: state.choicePoints[0].options[0] ? state.choicePoints[0].options[0].id : '', scene: '' }] : []);
  document.getElementById('routeDeleteBtn').hidden = !r;
  renderRouteStepsEditor();
  document.getElementById('routeModal').hidden = false;
  document.getElementById('routeNameInput').focus();
}

function closeRouteModal() {
  document.getElementById('routeModal').hidden = true;
}

function renderRouteStepsEditor() {
  const wrap = document.getElementById('routeStepsEditor');
  if (!state.choicePoints.length) {
    wrap.innerHTML = `<div class="empty-state">Add a choice point on the Choice Map tab first.</div>`;
    return;
  }
  wrap.innerHTML = routeStepsDraft.map((step, i) => {
    const cp = findCp(step.choicePointId) || state.choicePoints[0];
    const optionsHtml = cp.options.map(o => `<option value="${escapeAttr(o.id)}" ${o.id === step.optionId ? 'selected' : ''}>${escapeHtml(o.text)}</option>`).join('');
    const cpOptionsHtml = state.choicePoints.map(c => `<option value="${escapeAttr(c.id)}" ${c.id === cp.id ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('');
    return `
      <div class="step-row" data-idx="${i}">
        <select data-role="step-cp">${cpOptionsHtml}</select>
        <select data-role="step-opt">${optionsHtml}</select>
        <input type="text" class="scene-input" data-role="step-scene" placeholder="Resulting scene (optional)" value="${escapeAttr(step.scene || '')}">
        <button type="button" class="row-remove" data-role="step-remove" aria-label="Remove step">&times;</button>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('[data-role="step-cp"]').forEach((sel, i) => {
    sel.addEventListener('change', () => {
      const cp = findCp(sel.value);
      routeStepsDraft[i].choicePointId = sel.value;
      routeStepsDraft[i].optionId = cp && cp.options[0] ? cp.options[0].id : '';
      renderRouteStepsEditor();
    });
  });
  wrap.querySelectorAll('[data-role="step-opt"]').forEach((sel, i) => {
    sel.addEventListener('change', () => { routeStepsDraft[i].optionId = sel.value; });
  });
  wrap.querySelectorAll('[data-role="step-scene"]').forEach((input, i) => {
    input.addEventListener('input', () => { routeStepsDraft[i].scene = input.value; });
  });
  wrap.querySelectorAll('[data-role="step-remove"]').forEach((btn, i) => {
    btn.addEventListener('click', () => { routeStepsDraft.splice(i, 1); renderRouteStepsEditor(); });
  });
}

function addRouteStep() {
  if (!state.choicePoints.length) { showToast('Add a choice point first.'); return; }
  const cp = state.choicePoints[0];
  routeStepsDraft.push({ choicePointId: cp.id, optionId: cp.options[0] ? cp.options[0].id : '', scene: '' });
  renderRouteStepsEditor();
}

function saveRoute() {
  const name = document.getElementById('routeNameInput').value.trim();
  const endingName = document.getElementById('routeEndingInput').value.trim();
  const endingType = document.getElementById('routeEndingType').value;
  if (!name) { showToast('Give this route a name.'); return; }
  if (!routeStepsDraft.length) { showToast('Add at least one step.'); return; }
  if (!endingName) { showToast('Note down the ending this route reaches.'); return; }

  const steps = routeStepsDraft.map(s => ({ choicePointId: s.choicePointId, optionId: s.optionId, scene: (s.scene || '').trim() }));

  if (editingRouteId) {
    const r = state.routes.find(x => x.id === editingRouteId);
    r.name = name; r.steps = steps; r.ending = { name: endingName, type: endingType };
  } else {
    state.routes.push({ id: uid('route'), name, steps, ending: { name: endingName, type: endingType } });
  }
  saveState();
  renderRoutes(document.getElementById('routeSearch').value);
  closeRouteModal();
  showToast('Route saved.');
}

function deleteRoute() {
  if (!editingRouteId) return;
  if (!confirm('Delete this route? This cannot be undone.')) return;
  state.routes = state.routes.filter(r => r.id !== editingRouteId);
  saveState();
  renderRoutes(document.getElementById('routeSearch').value);
  closeRouteModal();
  showToast('Route deleted.');
}

/* ---------------- import / export ---------------- */

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = (state.gameTitle || 'route-log').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'route-log';
  a.href = url;
  a.download = `${slug}-data.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Exported. Commit this file as data.json to keep it as your site default.');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.choicePoints) || !Array.isArray(parsed.routes)) {
        throw new Error('shape mismatch');
      }
      state = {
        gameTitle: typeof parsed.gameTitle === 'string' ? parsed.gameTitle : 'Untitled Visual Novel',
        choicePoints: parsed.choicePoints,
        routes: parsed.routes
      };
      saveState();
      renderAll();
      showToast('Imported successfully.');
    } catch (e) {
      showToast('That file doesn\u2019t look like a route log export.');
    }
  };
  reader.readAsText(file);
}

/* ---------------- misc ---------------- */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

function renderAll() {
  document.getElementById('gameTitleInput').value = state.gameTitle || 'Untitled Visual Novel';
  document.title = (state.gameTitle || 'Untitled Visual Novel') + ' \u00b7 Route Log';
  renderChoicePoints();
  renderRoutes(document.getElementById('routeSearch').value);
}

/* ---------------- wire up ---------------- */

function initEvents() {
  document.getElementById('gameTitleInput').addEventListener('input', e => {
    state.gameTitle = e.target.value;
    document.title = (state.gameTitle || 'Untitled Visual Novel') + ' \u00b7 Route Log';
    saveState();
  });

  document.getElementById('addChoicePointBtn').addEventListener('click', () => openCpModal(null));
  document.getElementById('cpAddOptionBtn').addEventListener('click', () => { cpOptionsDraft.push({ id: uid('opt'), text: '' }); renderCpOptionsEditor(); });
  document.getElementById('cpSaveBtn').addEventListener('click', saveCp);
  document.getElementById('cpCancelBtn').addEventListener('click', closeCpModal);
  document.getElementById('cpDeleteBtn').addEventListener('click', deleteCp);

  document.getElementById('newRouteBtn').addEventListener('click', () => openRouteModal(null));
  document.getElementById('routeAddStepBtn').addEventListener('click', addRouteStep);
  document.getElementById('routeSaveBtn').addEventListener('click', saveRoute);
  document.getElementById('routeCancelBtn').addEventListener('click', closeRouteModal);
  document.getElementById('routeDeleteBtn').addEventListener('click', deleteRoute);

  document.getElementById('routeSearch').addEventListener('input', e => renderRoutes(e.target.value));

  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  [document.getElementById('cpModal'), document.getElementById('routeModal')].forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.hidden = true; });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('cpModal').hidden = true;
      document.getElementById('routeModal').hidden = true;
    }
  });
}

(async function init() {
  state = await loadState();
  initTabs();
  initEvents();
  renderAll();
})();
