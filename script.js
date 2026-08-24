const LIB_KEY = 'vnroute_library', ACTIVE_KEY = 'vnroute_active_id';
let vnLibrary = [], activeVnId = null, state = { choicePoints: [], scenes: [], routes: [] };
let editingCpId = null, cpOptionsDraft = [], editingSceneId = null, editingRouteId = null, routeStepsDraft = [];
let choiceViewMode = 'card', draggedRouteIndex = null, draggedCpIndex = null, draggedStepIndex = null;
let sceneSort = { key: 'name', dir: 'asc' };

/* --- Utility & State --- */
const uid = (prefix) => prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escapeAttr = escapeHtml;
const findCp = (id) => state.choicePoints.find(c => c.id === id);
const findOption = (cp, optId) => cp?.options.find(o => o.id === optId) || null;
const findScene = (id) => state.scenes.find(s => s.id === id);
const countRoutesUsingCp = (cpId) => state.routes.filter(r => r.steps.some(s => s.choicePointId === cpId)).length;
const countRoutesUsingScene = (sceneId) => state.routes.filter(r => r.ending.sceneId === sceneId || r.steps.some(s => s.sceneId === sceneId)).length;

function saveState() { localStorage.setItem(`vnroute_data_${activeVnId}`, JSON.stringify(state)); }
function saveLibrary() { localStorage.setItem(LIB_KEY, JSON.stringify(vnLibrary)); }
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 2400);
}

async function loadState() {
  try { vnLibrary = JSON.parse(localStorage.getItem(LIB_KEY)) || []; } catch(e) { vnLibrary = []; }
  if (!vnLibrary.length) {
    activeVnId = uid('vn'); vnLibrary = [{ id: activeVnId, title: 'New Visual Novel' }];
    saveLibrary(); localStorage.setItem(ACTIVE_KEY, activeVnId);
  } else {
    activeVnId = localStorage.getItem(ACTIVE_KEY) || vnLibrary[0].id;
    if (!vnLibrary.find(v => v.id === activeVnId)) activeVnId = vnLibrary[0].id;
    localStorage.setItem(ACTIVE_KEY, activeVnId);
  }
  document.getElementById('vnSelector').innerHTML = vnLibrary.map(v => `<option value="${escapeAttr(v.id)}" ${v.id === activeVnId ? 'selected' : ''}>${escapeHtml(v.title)}</option>`).join('');
  try { state = JSON.parse(localStorage.getItem(`vnroute_data_${activeVnId}`)) || { choicePoints: [], scenes: [], routes: [] }; } 
  catch(e) { state = { choicePoints: [], scenes: [], routes: [] }; }
}

function showCustomModal({ title, message, type, defaultValue = '' }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('customModalOverlay'), inp = document.getElementById('customModalInput');
    const btnCancel = document.getElementById('customModalCancel'), btnConfirm = document.getElementById('customModalConfirm');
    document.getElementById('customModalTitle').textContent = title;
    document.getElementById('customModalMessage').textContent = message;
    inp.hidden = (type !== 'prompt'); btnCancel.hidden = (type === 'alert');
    if (type === 'prompt') inp.value = defaultValue;
    overlay.hidden = false; if (type === 'prompt') { inp.focus(); inp.select(); }
    const cleanup = () => { overlay.hidden = true; btnConfirm.onclick = null; btnCancel.onclick = null; inp.onkeydown = null; };
    btnConfirm.onclick = () => { cleanup(); resolve(type === 'prompt' ? inp.value : true); };
    btnCancel.onclick = () => { cleanup(); resolve(type === 'prompt' ? null : false); };
    if (type === 'prompt') inp.onkeydown = (e) => { if (e.key === 'Enter') btnConfirm.click(); };
  });
}

/* --- Choices --- */
function renderChoicePoints() {
  const list = document.getElementById('choicePointsList'), q = document.getElementById('choiceFilter').value.trim().toLowerCase();
  list.classList.toggle('list-view', choiceViewMode === 'list');
  const filtered = state.choicePoints.filter(cp => !q || [cp.label, ...cp.options.map(o => o.text)].join(' ').toLowerCase().includes(q));
  if (!state.choicePoints.length) return list.innerHTML = `<div class="empty-state"><strong>No choice points yet</strong></div>`;
  if (!filtered.length) return list.innerHTML = `<div class="empty-state">No matches found.</div>`;

  list.innerHTML = filtered.map(cp => {
    const idx = state.choicePoints.indexOf(cp), used = countRoutesUsingCp(cp.id);
    return `
      <div class="cp-card" data-idx="${idx}" data-id="${escapeAttr(cp.id)}" ${!q ? 'draggable="true"' : ''}>
        <div class="cp-header-area">
          ${!q ? '<div class="cp-drag-handle" title="Drag to reorder">&#8942;&#8942;</div>' : ''}
          <div class="cp-title-text"><div class="cp-eyebrow">Choice ${String(idx + 1).padStart(2, '0')}</div><div class="cp-label">${escapeHtml(cp.label || `Choice ${idx + 1}`)}</div></div>
        </div>
        <div class="fgo-options-container">${cp.options.map(o => `<div class="fgo-button-wrap"><div class="fgo-button-inner"><span>${escapeHtml(o.text)}</span></div></div>`).join('')}</div>
        <div class="card-meta">${used ? `Used in ${used} route(s)` : 'Not used yet'}</div>
        <div class="footer-actions">
          <button type="button" class="btn-icon" onclick="duplicateChoice('${cp.id}')" title="Duplicate">&#10064;</button>
          <button type="button" class="btn-icon edit" onclick="loadCpIntoForm('${cp.id}')" title="Edit">&#9998;</button>
          <button type="button" class="btn-icon del" onclick="deleteCp('${cp.id}')" title="Delete">&#10005;</button>
        </div>
      </div>`;
  }).join('');

  if (!q) {
    list.querySelectorAll('.cp-card').forEach(card => {
      card.addEventListener('dragstart', (e) => { draggedCpIndex = parseInt(card.dataset.idx); card.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; });
      card.addEventListener('dragend', () => { card.classList.remove('is-dragging'); draggedCpIndex = null; renderChoicePoints(); });
      card.addEventListener('dragover', (e) => { e.preventDefault(); card.style.borderColor = "var(--primary-accent)"; });
      card.addEventListener('dragleave', () => { card.style.borderColor = "var(--border)"; });
      card.addEventListener('drop', (e) => {
        e.preventDefault(); if (draggedCpIndex === null || draggedCpIndex === parseInt(card.dataset.idx)) return;
        const rect = card.getBoundingClientRect();
        let insertIndex = parseInt(card.dataset.idx) + ((choiceViewMode === 'list' ? e.clientY - (rect.y + rect.height/2) : e.clientX - (rect.x + rect.width/2)) > 0 ? 1 : 0);
        if (draggedCpIndex < insertIndex) insertIndex--;
        state.choicePoints.splice(insertIndex, 0, state.choicePoints.splice(draggedCpIndex, 1)[0]);
        saveState(); renderChoicePoints();
      });
    });
  }
}

function renderCpOptionsEditor() {
  const wrap = document.getElementById('cpOptionsEditor');
  wrap.innerHTML = cpOptionsDraft.map((o, i) => `
    <div class="option-row" data-idx="${i}">
      <input type="text" value="${escapeAttr(o.text)}" placeholder="Option text" data-role="opt-text">
      <button type="button" class="row-remove" onclick="cpOptionsDraft.splice(${i}, 1); renderCpOptionsEditor();">&#10005;</button>
    </div>`).join('');
  const inputs = wrap.querySelectorAll('[data-role="opt-text"]');
  inputs.forEach((input, i) => {
    input.addEventListener('input', () => cpOptionsDraft[i].text = input.value);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'PageDown') {
        e.preventDefault();
        if (i < inputs.length - 1) inputs[i + 1].focus();
        else if (e.key === 'Enter') { document.getElementById('cpAddOptionBtn').click(); setTimeout(() => wrap.querySelectorAll('[data-role="opt-text"]')[inputs.length].focus(), 10); }
      } else if (e.key === 'PageUp') { e.preventDefault(); if (i > 0) inputs[i - 1].focus(); }
    });
  });
}

function resetCpForm() {
  editingCpId = null; document.getElementById('cpLabelInput').value = ''; cpOptionsDraft = [{ id: uid('opt'), text: '' }, { id: uid('opt'), text: '' }];
  renderCpOptionsEditor(); document.getElementById('cpSubmitBtn').textContent = '+ Add Choice'; document.getElementById('cpCancelEditBtn').hidden = true;
  document.getElementById('form-choice').classList.remove('is-editing');
}

window.loadCpIntoForm = (id) => {
  const cp = findCp(id); if(!cp) return; editingCpId = id; document.getElementById('cpLabelInput').value = cp.label;
  cpOptionsDraft = cp.options.map(o => ({ ...o })); renderCpOptionsEditor();
  document.getElementById('cpSubmitBtn').textContent = 'Save Changes'; document.getElementById('cpCancelEditBtn').hidden = false;
  document.getElementById('form-choice').classList.add('is-editing'); document.getElementById('form-choice').scrollIntoView({ behavior: 'smooth' }); document.getElementById('cpLabelInput').focus();
};

window.duplicateChoice = (id) => {
  const cp = findCp(id); if(!cp) return; editingCpId = null; document.getElementById('cpLabelInput').value = cp.label + ' (Copy)';
  cpOptionsDraft = cp.options.map(o => ({ id: uid('opt'), text: o.text })); renderCpOptionsEditor();
  document.getElementById('cpSubmitBtn').textContent = '+ Add Choice'; document.getElementById('cpCancelEditBtn').hidden = false;
  document.getElementById('form-choice').classList.add('is-editing'); document.getElementById('form-choice').scrollIntoView({ behavior: 'smooth' }); document.getElementById('cpLabelInput').focus();
  showToast('Choice duplicated!');
};

function submitCpForm(e) {
  e.preventDefault();
  let label = document.getElementById('cpLabelInput').value.trim();
  const options = cpOptionsDraft.map(o => ({ id: o.id, text: o.text.trim() })).filter(o => o.text);
  if (!options.length) return showToast('Add at least one option.');
  if (editingCpId) {
    const cp = findCp(editingCpId); cp.label = label ? label : `Choice ${state.choicePoints.indexOf(cp) + 1}`; cp.options = options; showToast('Choice updated.');
  } else {
    state.choicePoints.push({ id: uid('cp'), label: label || `Choice ${state.choicePoints.length + 1}`, options }); showToast('Choice added.');
  }
  saveState(); resetCpForm(); renderAllUI();
}

window.deleteCp = async (id) => {
  const used = countRoutesUsingCp(id);
  if (used && !await showCustomModal({ title: 'Warning', message: `Used in ${used} route(s). Delete anyway?`, type: 'confirm' })) return;
  state.choicePoints = state.choicePoints.filter(c => c.id !== id); saveState(); if (editingCpId === id) resetCpForm();
  renderAllUI(); showToast('Choice deleted.');
};

/* --- Scenes --- */
function renderScenes() {
  const tbody = document.getElementById('sceneTableBody'), q = document.getElementById('sceneFilter').value.trim().toLowerCase();
  let rows = state.scenes.map(s => ({ scene: s, used: countRoutesUsingScene(s.id) })).filter(r => !q || (r.scene.name + ' ' + (r.scene.note || '')).toLowerCase().includes(q));
  rows.sort((a, b) => { let av = sceneSort.key === 'used' ? a.used : (a.scene[sceneSort.key] || '').toLowerCase(), bv = sceneSort.key === 'used' ? b.used : (b.scene[sceneSort.key] || '').toLowerCase(); return av < bv ? (sceneSort.dir === 'asc' ? -1 : 1) : av > bv ? (sceneSort.dir === 'asc' ? 1 : -1) : 0; });
  document.querySelectorAll('#sceneTable thead th[data-sort]').forEach(th => { th.classList.remove('asc', 'desc'); if (th.dataset.sort === sceneSort.key) th.classList.add(sceneSort.dir); });
  if (!state.scenes.length) return tbody.innerHTML = `<tr class="empty-row"><td colspan="4"><strong>No scenes yet</strong></td></tr>`;
  if (!rows.length) return tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No matches.</td></tr>`;
  
  tbody.innerHTML = rows.map(({ scene: s, used }) => `
    <tr><td>${escapeHtml(s.name)}</td><td class="scene-note-cell">${escapeHtml(s.note || '—')}</td><td class="col-num">${used}</td>
      <td class="col-actions"><div class="footer-actions" style="justify-content:center">
        <button type="button" class="btn-icon" onclick="duplicateScene('${s.id}')" title="Duplicate">&#10064;</button>
        <button type="button" class="btn-icon edit" onclick="loadSceneIntoForm('${s.id}')" title="Edit">&#9998;</button>
        <button type="button" class="btn-icon del" onclick="deleteScene('${s.id}')" title="Delete">&#10005;</button>
      </div></td></tr>`).join('');
}

function resetSceneForm() {
  editingSceneId = null; document.getElementById('sceneNameInput').value = ''; document.getElementById('sceneNoteInput').value = '';
  document.getElementById('sceneSubmitBtn').textContent = '+ Add Scene'; document.getElementById('sceneCancelEditBtn').hidden = true;
}

window.loadSceneIntoForm = (id) => {
  const s = findScene(id); if(!s) return; editingSceneId = id; document.getElementById('sceneNameInput').value = s.name; document.getElementById('sceneNoteInput').value = s.note || '';
  document.getElementById('sceneSubmitBtn').textContent = 'Save Changes'; document.getElementById('sceneCancelEditBtn').hidden = false;
  document.getElementById('form-scene').scrollIntoView({ behavior: 'smooth' }); document.getElementById('sceneNameInput').focus();
};

window.duplicateScene = (id) => {
  const s = findScene(id); if(!s) return; editingSceneId = null; document.getElementById('sceneNameInput').value = s.name + ' (Copy)'; document.getElementById('sceneNoteInput').value = s.note || '';
  document.getElementById('sceneSubmitBtn').textContent = '+ Add Scene'; document.getElementById('sceneCancelEditBtn').hidden = false;
  document.getElementById('form-scene').scrollIntoView({ behavior: 'smooth' }); document.getElementById('sceneNameInput').focus(); showToast('Scene duplicated!');
};

function submitSceneForm(e) {
  e.preventDefault(); const name = document.getElementById('sceneNameInput').value.trim(), note = document.getElementById('sceneNoteInput').value.trim();
  if (!name) return showToast('Give this scene a name first.');
  if (editingSceneId) { const s = findScene(editingSceneId); s.name = name; s.note = note; showToast('Scene updated.'); } 
  else { state.scenes.push({ id: uid('scene'), name, note }); showToast('Scene added.'); }
  saveState(); resetSceneForm(); renderAllUI();
}

window.deleteScene = async (id) => {
  const used = countRoutesUsingScene(id);
  if (used && !await showCustomModal({ title: 'Warning', message: `Used in ${used} route(s). Delete anyway?`, type: 'confirm' })) return;
  state.scenes = state.scenes.filter(s => s.id !== id); saveState(); if (editingSceneId === id) resetSceneForm();
  renderAllUI(); showToast('Scene deleted.');
};

/* --- Routes --- */
const ENDING_LABELS = { good: 'Good End', bad: 'Bad End', normal: 'Normal End', true: 'True End', secret: 'Secret End' };

function renderRoutes() {
  const list = document.getElementById('routesList'), q = document.getElementById('routeFilter').value.trim().toLowerCase();
  const filtered = state.routes.filter(r => !q || [r.name, findScene(r.ending.sceneId)?.name || '', ...r.steps.map(s => [findCp(s.choicePointId)?.label || '', findOption(findCp(s.choicePointId), s.optionId)?.text || '', findScene(s.sceneId)?.name || ''].join(' '))].join(' ').toLowerCase().includes(q));

  if (!state.routes.length) return list.innerHTML = `<div class="empty-state"><strong>The book is empty</strong></div>`;
  if (!filtered.length) return list.innerHTML = `<div class="empty-state">No routes match.</div>`;

  list.innerHTML = filtered.map((r, idx) => {
    const stepsHtml = r.steps.map(s => (s.choicePointId ? `<div class="thread-node is-choice"><span class="node-dot"></span><span class="node-choice-label">${escapeHtml(findCp(s.choicePointId)?.label || 'Deleted')}</span><span class="node-option-text">${escapeHtml(findOption(findCp(s.choicePointId), s.optionId)?.text || 'Deleted')}</span></div>` : '') + (s.sceneId ? `<div class="thread-node is-scene"><span class="node-dot"></span><span class="node-scene-text">${escapeHtml(findScene(s.sceneId)?.name || 'Deleted')}</span></div>` : '')).join('');
    return `
      <div class="route-card ${r.isSimplified ? 'is-simplified' : ''}" data-idx="${idx}" data-id="${escapeAttr(r.id)}" ${!q ? 'draggable="true"' : ''}>
        <div class="route-card-head" title="Double click to minimize/maximize">
          <div class="route-name-wrap">${!q ? '<div class="route-drag-handle" title="Drag to reorder">&#8942;&#8942;</div>' : ''}<span class="route-name">${escapeHtml(r.name)}</span></div>
          <div class="footer-actions">
            <button type="button" class="btn-icon" onclick="event.stopPropagation(); duplicateRoute('${r.id}')" title="Duplicate">&#10064;</button>
            <button type="button" class="btn-icon edit" onclick="event.stopPropagation(); loadRouteIntoForm('${r.id}')" title="Edit">&#9998;</button>
            <button type="button" class="btn-icon del" onclick="event.stopPropagation(); deleteRoute('${r.id}')" title="Delete">&#10005;</button>
          </div>
        </div>
        <div class="thread">${stepsHtml}</div>
        <div class="ending-stamp ending-${r.ending.type}">${escapeHtml(findScene(r.ending.sceneId)?.name || 'Deleted')} &middot; ${ENDING_LABELS[r.ending.type]}</div>
      </div>`;
  }).join('');

  list.querySelectorAll('.route-card-head').forEach(head => {
    head.addEventListener('dblclick', (e) => {
      if(e.target.closest('.footer-actions') || e.target.closest('.route-drag-handle')) return;
      const r = state.routes.find(x => x.id === head.closest('.route-card').dataset.id);
      if (r) { r.isSimplified = !r.isSimplified; saveState(); renderRoutes(); }
    });
  });

  if (!q) {
    list.querySelectorAll('.route-card').forEach(card => {
      card.addEventListener('dragstart', (e) => { draggedRouteIndex = parseInt(card.dataset.idx); card.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; });
      card.addEventListener('dragend', () => { card.classList.remove('is-dragging'); draggedRouteIndex = null; renderRoutes(); });
      card.addEventListener('dragover', (e) => { e.preventDefault(); card.style.borderColor = "var(--primary-accent)"; });
      card.addEventListener('dragleave', () => { card.style.borderColor = "var(--border)"; });
      card.addEventListener('drop', (e) => {
        e.preventDefault(); if (draggedRouteIndex === null || draggedRouteIndex === parseInt(card.dataset.idx)) return;
        const rect = card.getBoundingClientRect(); let insertIndex = parseInt(card.dataset.idx) + (e.clientY - (rect.y + rect.height/2) > 0 ? 1 : 0);
        if (draggedRouteIndex < insertIndex) insertIndex--;
        state.routes.splice(insertIndex, 0, state.routes.splice(draggedRouteIndex, 1)[0]);
        saveState(); renderRoutes();
      });
    });
  }
}

function renderRouteStepsEditor() {
  const wrap = document.getElementById('routeStepsEditor');
  if (!routeStepsDraft.length) return wrap.innerHTML = `<div class="empty-state">No steps added yet.</div>`;
  wrap.innerHTML = routeStepsDraft.map((step, i) => `
    <div class="step-row" data-idx="${i}" draggable="true">
      <div class="drag-handle" title="Drag to reorder">&#8942;&#8942;</div>
      <select onchange="routeStepsDraft[${i}].choicePointId=this.value; routeStepsDraft[${i}].optionId=findCp(this.value)?.options[0]?.id||''; renderRouteStepsEditor();"><option value="">— No Choice —</option>${state.choicePoints.map(c => `<option value="${escapeAttr(c.id)}" ${c.id === step.choicePointId ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}</select>
      <select onchange="routeStepsDraft[${i}].optionId=this.value;" ${!step.choicePointId ? 'disabled' : ''}><option value="">— No Option —</option>${findCp(step.choicePointId) ? findCp(step.choicePointId).options.map(o => `<option value="${escapeAttr(o.id)}" ${o.id === step.optionId ? 'selected' : ''}>${escapeHtml(o.text)}</option>`).join('') : ''}</select>
      <select onchange="routeStepsDraft[${i}].sceneId=this.value;"><option value="">— none —</option>${state.scenes.map(s => `<option value="${escapeAttr(s.id)}" ${s.id === step.sceneId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select>
      <button type="button" class="row-remove" onclick="routeStepsDraft.splice(${i}, 1); renderRouteStepsEditor();">&#10005;</button>
    </div>`).join('');

  wrap.querySelectorAll('.step-row').forEach(row => {
    row.addEventListener('dragstart', (e) => { draggedStepIndex = parseInt(row.dataset.idx); row.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragend', () => { row.classList.remove('is-dragging'); draggedStepIndex = null; renderRouteStepsEditor(); });
    row.addEventListener('dragover', (e) => { e.preventDefault(); const r = row.getBoundingClientRect(); if (e.clientY - (r.y + r.height/2) > 0) { row.style.borderBottom = "2px solid var(--primary-accent)"; row.style.borderTop = "1px solid var(--border)"; } else { row.style.borderTop = "2px solid var(--primary-accent)"; row.style.borderBottom = "1px solid var(--border)"; } });
    row.addEventListener('dragleave', () => { row.style.borderTop = "1px solid var(--border)"; row.style.borderBottom = "1px solid var(--border)"; });
    row.addEventListener('drop', (e) => {
      e.preventDefault(); if (draggedStepIndex === null || draggedStepIndex === parseInt(row.dataset.idx)) return;
      const r = row.getBoundingClientRect(); let insertIndex = parseInt(row.dataset.idx) + (e.clientY - (r.y + r.height/2) > 0 ? 1 : 0);
      if (draggedStepIndex < insertIndex) insertIndex--;
      routeStepsDraft.splice(insertIndex, 0, routeStepsDraft.splice(draggedStepIndex, 1)[0]);
      renderRouteStepsEditor();
    });
  });
}

function resetRouteForm() {
  editingRouteId = null; document.getElementById('routeNameInput').value = ''; routeStepsDraft = [{ choicePointId: '', optionId: '', sceneId: '' }];
  renderRouteStepsEditor(); document.getElementById('routeEndingScene').innerHTML = state.scenes.length ? `<option value="">— none —</option>` + state.scenes.map(s => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)}</option>`).join('') : `<option value="">Add a scene first</option>`; document.getElementById('routeEndingType').value = 'normal';
  document.getElementById('routeSubmitBtn').textContent = '+ Record Route'; document.getElementById('routeCancelEditBtn').hidden = true; document.getElementById('form-route').classList.remove('is-editing');
}

window.loadRouteIntoForm = (id) => {
  const r = state.routes.find(x => x.id === id); if (!r) return; editingRouteId = id; document.getElementById('routeNameInput').value = r.name; routeStepsDraft = r.steps.map(s => ({ ...s }));
  renderRouteStepsEditor(); document.getElementById('routeEndingScene').innerHTML = `<option value="">— none —</option>` + state.scenes.map(s => `<option value="${escapeAttr(s.id)}" ${s.id === r.ending.sceneId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join(''); document.getElementById('routeEndingType').value = r.ending.type;
  document.getElementById('routeSubmitBtn').textContent = 'Save Changes'; document.getElementById('routeCancelEditBtn').hidden = false; document.getElementById('form-route').classList.add('is-editing'); document.getElementById('form-route').scrollIntoView({ behavior: 'smooth' }); document.getElementById('routeNameInput').focus();
};

window.duplicateRoute = (id) => {
  const r = state.routes.find(x => x.id === id); if (!r) return; editingRouteId = null; document.getElementById('routeNameInput').value = r.name + ' (Copy)'; routeStepsDraft = r.steps.map(s => ({ ...s }));
  renderRouteStepsEditor(); document.getElementById('routeEndingScene').innerHTML = `<option value="">— none —</option>` + state.scenes.map(s => `<option value="${escapeAttr(s.id)}" ${s.id === r.ending.sceneId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join(''); document.getElementById('routeEndingType').value = r.ending.type;
  document.getElementById('routeSubmitBtn').textContent = '+ Record Route'; document.getElementById('routeCancelEditBtn').hidden = false; document.getElementById('form-route').classList.add('is-editing'); document.getElementById('form-route').scrollIntoView({ behavior: 'smooth' }); document.getElementById('routeNameInput').focus(); showToast('Route duplicated!');
};

function submitRouteForm(e) {
  e.preventDefault(); const name = document.getElementById('routeNameInput').value.trim(), endingSceneId = document.getElementById('routeEndingScene').value, endingType = document.getElementById('routeEndingType').value;
  if (!name) return showToast('Give this route a name.');
  const validSteps = routeStepsDraft.filter(s => s.choicePointId || s.sceneId).map(s => ({ choicePointId: s.choicePointId || '', optionId: s.optionId || '', sceneId: s.sceneId || '' }));
  if (!validSteps.length) return showToast('Add at least one choice or scene step.'); if (!endingSceneId) return showToast('Pick the scene this route ends on.');
  if (editingRouteId) { const r = state.routes.find(x => x.id === editingRouteId); r.name = name; r.steps = validSteps; r.ending = { sceneId: endingSceneId, type: endingType }; showToast('Route updated.'); } 
  else { state.routes.push({ id: uid('route'), name, steps: validSteps, ending: { sceneId: endingSceneId, type: endingType } }); showToast('Route recorded.'); }
  saveState(); resetRouteForm(); renderAllUI();
}

window.deleteRoute = async (id) => {
  if (!await showCustomModal({ title: 'Delete Route', message: 'Delete this route? This cannot be undone.', type: 'confirm' })) return;
  state.routes = state.routes.filter(r => r.id !== id); saveState(); if (editingRouteId === id) resetRouteForm(); renderAllUI(); showToast('Route deleted.');
};

/* --- Data & Core Rendering --- */
function renderAllUI() { renderChoicePoints(); renderScenes(); renderRoutes(); renderUtilBar(); }
function renderAll() { document.title = 'VNRoute · ' + (vnLibrary.find(v => v.id === activeVnId)?.title || 'Tracker'); document.getElementById('utilCounts').textContent = `${state.choicePoints.length} choices · ${state.scenes.length} scenes · ${state.routes.length} routes`; resetCpForm(); resetSceneForm(); resetRouteForm(); renderAllUI(); }

function initEvents() {
  document.getElementById('form-choice').addEventListener('submit', submitCpForm); document.getElementById('cpAddOptionBtn').addEventListener('click', () => { cpOptionsDraft.push({ id: uid('opt'), text: '' }); renderCpOptionsEditor(); }); document.getElementById('cpCancelEditBtn').addEventListener('click', resetCpForm); document.getElementById('choiceFilter').addEventListener('input', renderChoicePoints);
  document.getElementById('form-scene').addEventListener('submit', submitSceneForm); document.getElementById('sceneCancelEditBtn').addEventListener('click', resetSceneForm); document.getElementById('sceneFilter').addEventListener('input', renderScenes);
  
  const btnChoiceCard = document.getElementById('btnChoiceViewCard'), btnChoiceList = document.getElementById('btnChoiceViewList');
  if (btnChoiceCard && btnChoiceList) {
    btnChoiceCard.addEventListener('click', () => { choiceViewMode = 'card'; btnChoiceCard.classList.add('is-active'); btnChoiceList.classList.remove('is-active'); renderChoicePoints(); });
    btnChoiceList.addEventListener('click', () => { choiceViewMode = 'list'; btnChoiceList.classList.add('is-active'); btnChoiceCard.classList.remove('is-active'); renderChoicePoints(); });
  }
  
  document.querySelectorAll('#sceneTable thead th[data-sort]').forEach(th => th.addEventListener('click', () => { const key = th.dataset.sort; sceneSort.dir = sceneSort.key === key && sceneSort.dir === 'asc' ? 'desc' : 'asc'; sceneSort.key = key; renderScenes(); }));
  document.getElementById('form-route').addEventListener('submit', submitRouteForm); document.getElementById('routeAddStepBtn').addEventListener('click', () => { routeStepsDraft.push({ choicePointId: '', optionId: '', sceneId: '' }); renderRouteStepsEditor(); }); document.getElementById('routeCancelEditBtn').addEventListener('click', resetRouteForm); document.getElementById('routeFilter').addEventListener('input', renderRoutes);

  document.getElementById('exportBtn').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })); a.download = `${(vnLibrary.find(v => v.id === activeVnId)?.title || 'vnroute').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-data.json`; document.body.appendChild(a); a.click(); a.remove(); showToast('Data exported.'); });
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => { if (e.target.files[0]) { const reader = new FileReader(); reader.onload = () => { try { state = normalizeState(JSON.parse(reader.result)); saveState(); renderAll(); showToast('Data imported successfully.'); } catch (err) { showToast('Invalid format'); } }; reader.readAsText(e.target.files[0]); } e.target.value = ''; });
  document.getElementById('clearBtn').addEventListener('click', async () => { if (await showCustomModal({ title: 'Clear Data', message: 'Clear all data for this Visual Novel?', type: 'confirm' })) { state = normalizeState({}); saveState(); renderAll(); showToast('Data cleared.'); } });
}

(async function init() { await loadState(); initNav(); initEvents(); renderAll(); })();
