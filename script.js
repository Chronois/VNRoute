/* =====================================================
   VNRoute — Visual Novel Route Tracker
   Vanilla JS. Data lives in localStorage, with data.json
   shipped as the default / re-import seed.
===================================================== */

const STORAGE_KEY = 'vnroute.v2';

const FALLBACK_DATA = {
  gameTitle: 'Untitled Visual Novel',
  choicePoints: [
    { id: 'cp1', label: 'Choice 1', options: [
      { id: 'cp1o1', text: 'Join the Oda Bakufu.' },
      { id: 'cp1o2', text: 'Join the Shinsengumi.' }
    ]},
    { id: 'cp2', label: 'Choice 2', options: [
      { id: 'cp2o1', text: 'Stand for her' },
      { id: 'cp2o2', text: 'Call the Police' },
      { id: 'cp2o3', text: 'Search other route' }
    ]}
  ],
  scenes: [
    { id: 's1', name: 'Dinner Scene', note: 'A quiet dinner before things go wrong.' },
    { id: 's2', name: 'Bruised Scene', note: 'The confrontation turns physical.' },
    { id: 's3', name: 'Escape Scene', note: 'A narrow way out, taken in time.' }
  ],
  routes: [
    {
      id: 'r1', name: 'Dinner Route',
      steps: [
        { choicePointId: 'cp1', optionId: 'cp1o1', sceneId: 's1' },
        { choicePointId: 'cp2', optionId: 'cp2o2', sceneId: 's2' }
      ],
      ending: { sceneId: 's2', type: 'bad' }
    },
    {
      id: 'r2', name: 'Straight Home Route',
      steps: [
        { choicePointId: 'cp1', optionId: 'cp1o2', sceneId: '' },
        { choicePointId: 'cp2', optionId: 'cp2o2', sceneId: 's3' }
      ],
      ending: { sceneId: 's3', type: 'normal' }
    }
  ]
};

let state = null;

let editingCpId = null;
let cpOptionsDraft = [];

let editingSceneId = null;

let editingRouteId = null;
let routeStepsDraft = [];

let sceneSort = { key: 'name', dir: 'asc' };

/* ---------------- persistence ---------------- */

async function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { return normalizeState(JSON.parse(saved)); } catch (e) { /* fall through */ }
  }
  try {
    const res = await fetch('data.json', { cache: 'no-store' });
    if (res.ok) return normalizeState(await res.json());
  } catch (e) { /* file:// or no data.json */ }
  return normalizeState(structuredClone(FALLBACK_DATA));
}

function normalizeState(raw) {
  return {
    gameTitle: typeof raw.gameTitle === 'string' ? raw.gameTitle : 'Untitled Visual Novel',
    choicePoints: Array.isArray(raw.choicePoints) ? raw.choicePoints : [],
    scenes: Array.isArray(raw.scenes) ? raw.scenes : [],
    routes: Array.isArray(raw.routes) ? raw.routes : []
  };
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function uid(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ---------------- toast ---------------- */

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

/* ---------------- nav ---------------- */

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('is-active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      document.getElementById('page-' + btn.dataset.page).classList.add('is-active');
    });
  });
}

function renderUtilBar() {
  document.getElementById('utilCounts').textContent =
    `${state.choicePoints.length} choice${state.choicePoints.length === 1 ? '' : 's'} · ${state.scenes.length} scene${state.scenes.length === 1 ? '' : 's'} · ${state.routes.length} route${state.routes.length === 1 ? '' : 's'}`;
}

/* ---------------- lookups ---------------- */

function findCp(id) { return state.choicePoints.find(c => c.id === id); }
function findOption(cp, optId) { return cp ? cp.options.find(o => o.id === optId) : null; }
function findScene(id) { return state.scenes.find(s => s.id === id); }

function countRoutesUsingCp(cpId) {
  return state.routes.filter(r => r.steps.some(s => s.choicePointId === cpId)).length;
}
function countRoutesUsingScene(sceneId) {
  return state.routes.filter(r =>
    r.ending.sceneId === sceneId || r.steps.some(s => s.sceneId === sceneId)
  ).length;
}

/* ======================================================
   CHOICES
====================================================== */

function renderChoicePoints() {
  const list = document.getElementById('choicePointsList');
  const q = document.getElementById('choiceFilter').value.trim().toLowerCase();

  const filtered = state.choicePoints.filter(cp => {
    if (!q) return true;
    const hay = [cp.label, ...cp.options.map(o => o.text)].join(' ').toLowerCase();
    return hay.includes(q);
  });

  if (!state.choicePoints.length) {
    list.innerHTML = `<div class="empty-state"><strong>No choice points yet</strong>Add the first branching moment from the game using the form above.</div>`;
    return;
  }
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">No choice points match &ldquo;${escapeHtml(q)}&rdquo;.</div>`;
    return;
  }

  list.innerHTML = filtered.map(cp => {
    const idx = state.choicePoints.indexOf(cp);
    const used = countRoutesUsingCp(cp.id);
    return `
      <div class="cp-card" data-id="${escapeAttr(cp.id)}">
        <div class="cp-eyebrow">Choice ${String(idx + 1).padStart(2, '0')}</div>
        <div class="cp-label">${escapeHtml(cp.label)}</div>
        
        <!-- Implementasi tombol pilihan ala FGO -->
        <div class="fgo-options-container">
          ${cp.options.map(o => `
            <div class="fgo-button-wrap">
              <div class="fgo-button-inner">
                <span>${escapeHtml(o.text)}</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="card-meta">${used ? `Used in ${used} route${used === 1 ? '' : 's'}` : 'Not used in any route yet'}</div>
        <div class="footer-actions">
          <button type="button" class="btn-icon edit" data-role="cp-edit" title="Edit">&#9998;</button>
          <button type="button" class="btn-icon del" data-role="cp-del" title="Delete">&#10005;</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-role="cp-edit"]').forEach(btn => {
    btn.addEventListener('click', () => loadCpIntoForm(btn.closest('.cp-card').dataset.id));
  });
  list.querySelectorAll('[data-role="cp-del"]').forEach(btn => {
    btn.addEventListener('click', () => deleteCp(btn.closest('.cp-card').dataset.id));
  });
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

function resetCpForm() {
  editingCpId = null;
  document.getElementById('cpLabelInput').value = `Choice ${state.choicePoints.length + 1}`;
  cpOptionsDraft = [{ id: uid('opt'), text: '' }, { id: uid('opt'), text: '' }];
  renderCpOptionsEditor();
  document.getElementById('cpSubmitBtn').textContent = '+ Add Choice';
  document.getElementById('cpCancelEditBtn').hidden = true;
  document.getElementById('form-choice').classList.remove('is-editing');
}

function loadCpIntoForm(id) {
  const cp = findCp(id);
  if (!cp) return;
  editingCpId = id;
  document.getElementById('cpLabelInput').value = cp.label;
  cpOptionsDraft = cp.options.map(o => ({ ...o }));
  renderCpOptionsEditor();
  document.getElementById('cpSubmitBtn').textContent = 'Save Changes';
  document.getElementById('cpCancelEditBtn').hidden = false;
  document.getElementById('form-choice').classList.add('is-editing');
  document.getElementById('form-choice').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('cpLabelInput').focus();
}

function submitCpForm(e) {
  e.preventDefault();
  const label = document.getElementById('cpLabelInput').value.trim();
  const options = cpOptionsDraft.map(o => ({ id: o.id, text: o.text.trim() })).filter(o => o.text);
  if (!label) { showToast('Give this choice point a label first.'); return; }
  if (!options.length) { showToast('Add at least one option.'); return; }

  if (editingCpId) {
    const cp = findCp(editingCpId);
    cp.label = label;
    cp.options = options;
    showToast('Choice point updated.');
  } else {
    state.choicePoints.push({ id: uid('cp'), label, options });
    showToast('Choice point added.');
  }
  saveState();
  resetCpForm();
  renderChoicePoints();
  renderUtilBar();
  refreshRouteFormChoicePointRefs();
}

function deleteCp(id) {
  const used = countRoutesUsingCp(id);
  if (used && !confirm(`This choice point is used in ${used} route(s). Delete it anyway? Those steps will show as "Deleted choice".`)) return;
  state.choicePoints = state.choicePoints.filter(c => c.id !== id);
  saveState();
  if (editingCpId === id) resetCpForm();
  renderChoicePoints();
  renderUtilBar();
  refreshRouteFormChoicePointRefs();
  showToast('Choice point deleted.');
}

/* ======================================================
   SCENES
====================================================== */

function renderScenes() {
  const q = document.getElementById('sceneFilter').value.trim().toLowerCase();
  const tbody = document.getElementById('sceneTableBody');

  let rows = state.scenes.map(s => ({ scene: s, used: countRoutesUsingScene(s.id) }));
  if (q) rows = rows.filter(r => (r.scene.name + ' ' + (r.scene.note || '')).toLowerCase().includes(q));

  rows.sort((a, b) => {
    let av, bv;
    if (sceneSort.key === 'used') { av = a.used; bv = b.used; }
    else { av = (a.scene[sceneSort.key] || '').toLowerCase(); bv = (b.scene[sceneSort.key] || '').toLowerCase(); }
    if (av < bv) return sceneSort.dir === 'asc' ? -1 : 1;
    if (av > bv) return sceneSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  document.querySelectorAll('#sceneTable thead th[data-sort]').forEach(th => {
    th.classList.remove('asc', 'desc');
    if (th.dataset.sort === sceneSort.key) th.classList.add(sceneSort.dir);
  });

  if (!state.scenes.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4"><strong style="display:block;color:var(--text-dim);font-family:var(--font-display);font-size:15px;margin-bottom:2px;">No scenes yet</strong>Add scenes above, then reuse them when building routes.</td></tr>`;
    return;
  }
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No scenes match &ldquo;${escapeHtml(q)}&rdquo;.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(({ scene: s, used }) => `
    <tr data-id="${escapeAttr(s.id)}">
      <td>${escapeHtml(s.name)}</td>
      <td class="scene-note-cell">${escapeHtml(s.note || '—')}</td>
      <td class="col-num">${used}</td>
      <td class="col-actions">
        <div class="footer-actions" style="justify-content:center">
          <button type="button" class="btn-icon edit" data-role="scene-edit" title="Edit">&#9998;</button>
          <button type="button" class="btn-icon del" data-role="scene-del" title="Delete">&#10005;</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-role="scene-edit"]').forEach(btn => {
    btn.addEventListener('click', () => loadSceneIntoForm(btn.closest('tr').dataset.id));
  });
  tbody.querySelectorAll('[data-role="scene-del"]').forEach(btn => {
    btn.addEventListener('click', () => deleteScene(btn.closest('tr').dataset.id));
  });
}

function initSceneSort() {
  document.querySelectorAll('#sceneTable thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sceneSort.key === key) sceneSort.dir = sceneSort.dir === 'asc' ? 'desc' : 'asc';
      else { sceneSort.key = key; sceneSort.dir = 'asc'; }
      renderScenes();
    });
  });
}

function resetSceneForm() {
  editingSceneId = null;
  document.getElementById('sceneNameInput').value = '';
  document.getElementById('sceneNoteInput').value = '';
  document.getElementById('sceneSubmitBtn').textContent = '+ Add Scene';
  document.getElementById('sceneCancelEditBtn').hidden = true;
  document.getElementById('form-scene').classList.remove('is-editing');
}

function loadSceneIntoForm(id) {
  const s = findScene(id);
  if (!s) return;
  editingSceneId = id;
  document.getElementById('sceneNameInput').value = s.name;
  document.getElementById('sceneNoteInput').value = s.note || '';
  document.getElementById('sceneSubmitBtn').textContent = 'Save Changes';
  document.getElementById('sceneCancelEditBtn').hidden = false;
  document.getElementById('form-scene').classList.add('is-editing');
  document.getElementById('form-scene').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('sceneNameInput').focus();
}

function submitSceneForm(e) {
  e.preventDefault();
  const name = document.getElementById('sceneNameInput').value.trim();
  const note = document.getElementById('sceneNoteInput').value.trim();
  if (!name) { showToast('Give this scene a name first.'); return; }

  if (editingSceneId) {
    const s = findScene(editingSceneId);
    s.name = name; s.note = note;
    showToast('Scene updated.');
  } else {
    state.scenes.push({ id: uid('scene'), name, note });
    showToast('Scene added.');
  }
  saveState();
  resetSceneForm();
  renderScenes();
  renderUtilBar();
  refreshRouteFormSceneRefs();
}

function deleteScene(id) {
  const used = countRoutesUsingScene(id);
  if (used && !confirm(`This scene is used in ${used} route(s). Delete it anyway? Those spots will show as "Deleted scene".`)) return;
  state.scenes = state.scenes.filter(s => s.id !== id);
  saveState();
  if (editingSceneId === id) resetSceneForm();
  renderScenes();
  renderUtilBar();
  refreshRouteFormSceneRefs();
  showToast('Scene deleted.');
}

/* ======================================================
   ROUTES
====================================================== */

const ENDING_LABELS = { good: 'Good End', bad: 'Bad End', normal: 'Normal End', true: 'True End', secret: 'Secret End' };

function renderRoutes() {
  const list = document.getElementById('routesList');
  const q = document.getElementById('routeFilter').value.trim().toLowerCase();

  const filtered = state.routes.filter(r => {
    if (!q) return true;
    const endingScene = findScene(r.ending.sceneId);
    const hay = [
      r.name,
      endingScene ? endingScene.name : '',
      ...r.steps.map(s => {
        const cp = findCp(s.choicePointId);
        const opt = findOption(cp, s.optionId);
        const scene = findScene(s.sceneId);
        return [cp ? cp.label : '', opt ? opt.text : '', scene ? scene.name : ''].join(' ');
      })
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });

  if (!state.routes.length) {
    list.innerHTML = `<div class="empty-state"><strong>The book is empty</strong>Record your first playthrough using the form above.</div>`;
    return;
  }
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">No routes match &ldquo;${escapeHtml(q)}&rdquo;.</div>`;
    return;
  }

  list.innerHTML = filtered.map(r => {
    const stepsHtml = r.steps.map(s => {
      const cp = findCp(s.choicePointId);
      const opt = findOption(cp, s.optionId);
      const scene = findScene(s.sceneId);
      let html = `<div class="thread-node is-choice">
        <span class="node-dot"></span>
        <span class="node-choice-label">${escapeHtml(cp ? cp.label : 'Deleted choice')}</span>
        <span class="node-option-text">${escapeHtml(opt ? opt.text : 'Deleted option')}</span>
      </div>`;
      if (s.sceneId) {
        html += `<div class="thread-node is-scene">
          <span class="node-dot"></span>
          <span class="node-scene-text">${escapeHtml(scene ? scene.name : 'Deleted scene')}</span>
        </div>`;
      }
      return html;
    }).join('');

    const endingScene = findScene(r.ending.sceneId);
    const type = ENDING_LABELS[r.ending.type] ? r.ending.type : 'normal';

    return `
      <div class="route-card" data-id="${escapeAttr(r.id)}">
        <div class="route-card-head">
          <span class="route-name">${escapeHtml(r.name)}</span>
          <div class="footer-actions">
            <button type="button" class="btn-icon edit" data-role="route-edit" title="Edit">&#9998;</button>
            <button type="button" class="btn-icon del" data-role="route-del" title="Delete">&#10005;</button>
          </div>
        </div>
        <div class="thread">${stepsHtml}</div>
        <div class="ending-stamp ending-${type}">${escapeHtml(endingScene ? endingScene.name : 'Deleted scene')} &middot; ${ENDING_LABELS[type]}</div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-role="route-edit"]').forEach(btn => {
    btn.addEventListener('click', () => loadRouteIntoForm(btn.closest('.route-card').dataset.id));
  });
  list.querySelectorAll('[data-role="route-del"]').forEach(btn => {
    btn.addEventListener('click', () => deleteRoute(btn.closest('.route-card').dataset.id));
  });
}

function sceneSelectOptions(selectedId, includeNone) {
  let html = includeNone ? `<option value="">— none —</option>` : '';
  html += state.scenes.map(s => `<option value="${escapeAttr(s.id)}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
  return html;
}

function renderRouteStepsEditor() {
  const wrap = document.getElementById('routeStepsEditor');
  if (!state.choicePoints.length) {
    wrap.innerHTML = `<div class="empty-state" style="grid-column:auto">Add a choice point on the Choices tab first.</div>`;
    return;
  }
  wrap.innerHTML = routeStepsDraft.map((step, i) => {
    const cp = findCp(step.choicePointId) || state.choicePoints[0];
    const cpOptionsHtml = state.choicePoints.map(c => `<option value="${escapeAttr(c.id)}" ${c.id === cp.id ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('');
    const optOptionsHtml = cp.options.map(o => `<option value="${escapeAttr(o.id)}" ${o.id === step.optionId ? 'selected' : ''}>${escapeHtml(o.text)}</option>`).join('');
    return `
      <div class="step-row" data-idx="${i}">
        <select data-role="step-cp">${cpOptionsHtml}</select>
        <select data-role="step-opt">${optOptionsHtml}</select>
        <select data-role="step-scene">${sceneSelectOptions(step.sceneId, true)}</select>
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
  wrap.querySelectorAll('[data-role="step-scene"]').forEach((sel, i) => {
    sel.addEventListener('change', () => { routeStepsDraft[i].sceneId = sel.value; });
  });
  wrap.querySelectorAll('[data-role="step-remove"]').forEach((btn, i) => {
    btn.addEventListener('click', () => { routeStepsDraft.splice(i, 1); renderRouteStepsEditor(); });
  });
}

function addRouteStep() {
  if (!state.choicePoints.length) { showToast('Add a choice point first.'); return; }
  const cp = state.choicePoints[0];
  routeStepsDraft.push({ choicePointId: cp.id, optionId: cp.options[0] ? cp.options[0].id : '', sceneId: '' });
  renderRouteStepsEditor();
}

function refreshRouteEndingSceneSelect(selectedId) {
  document.getElementById('routeEndingScene').innerHTML = state.scenes.length
    ? sceneSelectOptions(selectedId, false)
    : `<option value="">Add a scene first</option>`;
}

function refreshRouteFormChoicePointRefs() {
  // called after choice points change, so the steps editor reflects current choice points
  if (!document.getElementById('page-routes')) return;
  renderRouteStepsEditor();
}
function refreshRouteFormSceneRefs() {
  renderRouteStepsEditor();
  refreshRouteEndingSceneSelect(document.getElementById('routeEndingScene').value);
}

function resetRouteForm() {
  editingRouteId = null;
  document.getElementById('routeNameInput').value = '';
  routeStepsDraft = state.choicePoints.length
    ? [{ choicePointId: state.choicePoints[0].id, optionId: state.choicePoints[0].options[0] ? state.choicePoints[0].options[0].id : '', sceneId: '' }]
    : [];
  renderRouteStepsEditor();
  refreshRouteEndingSceneSelect('');
  document.getElementById('routeEndingType').value = 'normal';
  document.getElementById('routeSubmitBtn').textContent = '+ Record Route';
  document.getElementById('routeCancelEditBtn').hidden = true;
  document.getElementById('form-route').classList.remove('is-editing');
}

function loadRouteIntoForm(id) {
  const r = state.routes.find(x => x.id === id);
  if (!r) return;
  editingRouteId = id;
  document.getElementById('routeNameInput').value = r.name;
  routeStepsDraft = r.steps.map(s => ({ ...s }));
  renderRouteStepsEditor();
  refreshRouteEndingSceneSelect(r.ending.sceneId);
  document.getElementById('routeEndingType').value = r.ending.type;
  document.getElementById('routeSubmitBtn').textContent = 'Save Changes';
  document.getElementById('routeCancelEditBtn').hidden = false;
  document.getElementById('form-route').classList.add('is-editing');
  document.getElementById('form-route').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('routeNameInput').focus();
}

function submitRouteForm(e) {
  e.preventDefault();
  const name = document.getElementById('routeNameInput').value.trim();
  const endingSceneId = document.getElementById('routeEndingScene').value;
  const endingType = document.getElementById('routeEndingType').value;

  if (!name) { showToast('Give this route a name.'); return; }
  if (!routeStepsDraft.length) { showToast('Add at least one step.'); return; }
  if (!endingSceneId) { showToast('Pick the scene this route ends on.'); return; }

  const steps = routeStepsDraft.map(s => ({ choicePointId: s.choicePointId, optionId: s.optionId, sceneId: s.sceneId || '' }));

  if (editingRouteId) {
    const r = state.routes.find(x => x.id === editingRouteId);
    r.name = name; r.steps = steps; r.ending = { sceneId: endingSceneId, type: endingType };
    showToast('Route updated.');
  } else {
    state.routes.push({ id: uid('route'), name, steps, ending: { sceneId: endingSceneId, type: endingType } });
    showToast('Route recorded.');
  }
  saveState();
  resetRouteForm();
  renderRoutes();
  renderUtilBar();
  renderScenes();
  renderChoicePoints();
}

function deleteRoute(id) {
  if (!confirm('Delete this route? This cannot be undone.')) return;
  state.routes = state.routes.filter(r => r.id !== id);
  saveState();
  if (editingRouteId === id) resetRouteForm();
  renderRoutes();
  renderUtilBar();
  renderScenes();
  renderChoicePoints();
  showToast('Route deleted.');
}

/* ======================================================
   DATA (import / export / clear)
====================================================== */

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = (state.gameTitle || 'vnroute').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'vnroute';
  a.href = url;
  a.download = `${slug}-data.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Saved. Commit this file as data.json to make it the site default.');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.choicePoints) || !Array.isArray(parsed.routes)) throw new Error('shape mismatch');
      state = normalizeState(parsed);
      saveState();
      renderAll();
      showToast('Imported successfully.');
    } catch (e) {
      showToast('That file doesn\u2019t look like a VNRoute backup.');
    }
  };
  reader.readAsText(file);
}

function clearData() {
  if (!confirm('Clear all data on this device? This cannot be undone unless you have a backup file.')) return;
  state = structuredClone(FALLBACK_DATA);
  saveState();
  renderAll();
  showToast('Data cleared.');
}

/* ---------------- misc ---------------- */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

function renderAll() {
  document.getElementById('gameTitleInput').value = state.gameTitle || 'Untitled Visual Novel';
  document.title = 'VNRoute \u00b7 ' + (state.gameTitle || 'Untitled Visual Novel');
  renderUtilBar();
  resetCpForm();
  resetSceneForm();
  resetRouteForm();
  renderChoicePoints();
  renderScenes();
  renderRoutes();
}

/* ---------------- wire up ---------------- */

function initEvents() {
  document.getElementById('gameTitleInput').addEventListener('input', e => {
    state.gameTitle = e.target.value;
    document.title = 'VNRoute \u00b7 ' + (state.gameTitle || 'Untitled Visual Novel');
    saveState();
  });

  document.getElementById('form-choice').addEventListener('submit', submitCpForm);
  document.getElementById('cpAddOptionBtn').addEventListener('click', () => { cpOptionsDraft.push({ id: uid('opt'), text: '' }); renderCpOptionsEditor(); });
  document.getElementById('cpCancelEditBtn').addEventListener('click', resetCpForm);
  document.getElementById('choiceFilter').addEventListener('input', renderChoicePoints);

  document.getElementById('form-scene').addEventListener('submit', submitSceneForm);
  document.getElementById('sceneCancelEditBtn').addEventListener('click', resetSceneForm);
  document.getElementById('sceneFilter').addEventListener('input', renderScenes);
  initSceneSort();

  document.getElementById('form-route').addEventListener('submit', submitRouteForm);
  document.getElementById('routeAddStepBtn').addEventListener('click', addRouteStep);
  document.getElementById('routeCancelEditBtn').addEventListener('click', resetRouteForm);
  document.getElementById('routeFilter').addEventListener('input', renderRoutes);

  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('clearBtn').addEventListener('click', clearData);
}

(async function init() {
  state = await loadState();
  initNav();
  initEvents();
  renderAll();
})();
