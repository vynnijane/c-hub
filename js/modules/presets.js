/* ── PRESETS MODULE ────────────────────────────────────────────────────────
 * Prompt templates reusable across character cards.
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const DB      = () => App.DB;
  const UI      = () => App.UI;
  const Tokens  = () => App.Tokens;
  const Diff    = () => App.Diff;
  const Factory = () => App.Factory;

  let presets  = [];
  let activeId = null;
  let activeTab = 'edit';

  function active() { return presets.find(p => p.id === activeId) || null; }

  async function loadAll() {
    presets = await DB().getAll('presets');
    presets.sort((a, b) => b.updatedAt - a.updatedAt);
    renderList();
    updateCount();
  }

  async function persist(p) {
    p.updatedAt = Date.now();
    await DB().put('presets', p);
  }

  async function newEntity() {
    const p = Factory().blankPreset();
    presets.unshift(p);
    await persist(p);
    selectEntity(p.id);
    UI().toast('New preset created', 'success');
  }

  function selectEntity(id) {
    activeId  = id;
    activeTab = 'edit';
    renderList();
    App.openEditor('presets');
    renderEditor();
    renderRightPanel();
    App.updateStats();
  }

  async function deleteEntity(id) {
    const p = presets.find(x => x.id === id);
    if (!p) return;
    const ok = await UI().confirm(`Delete preset "${p.name}"?`, 'Delete');
    if (!ok) return;
    await DB().del('presets', id);
    presets = presets.filter(x => x.id !== id);
    if (activeId === id) { activeId = null; App.showWelcome(); }
    renderList(); updateCount(); App.updateStats();
    UI().toast('Preset deleted');
  }

  function renderList() {
    const el = document.getElementById('list-presets');
    if (!el) return;
    if (!presets.length) {
      el.innerHTML = `<div class="empty-state" style="padding:20px 12px;">
        <div class="empty-icon">📋</div><div class="empty-text">No presets yet</div></div>`;
      return;
    }
    el.innerHTML = presets.map(p => `
      <div class="entity-item${p.id === activeId ? ' active' : ''}"
           onclick="App.Modules.Presets.selectEntity('${p.id}')">
        <div class="entity-avatar">📋</div>
        <div style="min-width:0;flex:1">
          <div class="entity-name">${UI().esc(p.name)}</div>
          <div class="entity-meta">${p.versions?.length || 0}v</div>
        </div>
      </div>`).join('');
  }

  function updateCount() {
    const el = document.getElementById('count-presets');
    if (el) el.textContent = presets.length;
  }

  function renderEditor() {
    const p = active();
    if (!p) return;

    document.getElementById('editorTabsBar').innerHTML = `
      <button class="editor-tab${activeTab === 'edit' ? ' active' : ''}"
        onclick="App.Modules.Presets.switchTab('edit')">Edit</button>
      <button class="editor-tab${activeTab === 'apply' ? ' active' : ''}"
        onclick="App.Modules.Presets.switchTab('apply')">Apply to Character</button>
    `;
    document.getElementById('editorActionsBar').innerHTML = `
      <span class="editor-panel-title">${UI().esc(p.name)}</span>
      <button class="btn btn-ghost btn-sm" onclick="App.Modules.Presets.saveVersion()">+ Version</button>
      <button class="btn btn-ghost btn-sm" onclick="App.Modules.Presets.exportPreset()">⬇ Export</button>
      <button class="btn btn-ember btn-sm" onclick="App.Modules.Presets.savePreset()">Save</button>
    `;

    renderTabContent();
  }

  function switchTab(tab) { activeTab = tab; renderEditor(); }

  function renderTabContent() {
    const p = active();
    if (!p) return;
    const el = document.getElementById('editorContent');
    if (!el) return;
    const { esc } = UI();

    if (activeTab === 'edit') {
      el.innerHTML = `
      <div class="field-group">
        <div class="field-label">Preset Name</div>
        <input class="field-input" value="${esc(p.name)}" placeholder="Preset name"
          oninput="App.Modules.Presets.nameChange(this.value)">
      </div>
      <div class="field-group">
        <div class="field-label">Description <span class="field-hint">internal note about this preset</span></div>
        <textarea class="field-textarea" rows="2"
          oninput="App.Modules.Presets.fieldChange('description', this.value)"
          placeholder="What this preset is for…">${esc(p.description)}</textarea>
      </div>
      <div class="field-group">
        <div class="field-label">System Prompt</div>
        <textarea class="field-textarea mono" rows="10"
          oninput="App.Modules.Presets.fieldChange('systemPrompt', this.value)"
          placeholder="You are {{char}}. Always respond in character…">${esc(p.systemPrompt)}</textarea>
        ${Tokens().fieldTokenHTML(p.systemPrompt)}
      </div>
      <div class="field-group">
        <div class="field-label">Post-History Instructions <span class="field-hint">injected after chat history</span></div>
        <textarea class="field-textarea mono" rows="5"
          oninput="App.Modules.Presets.fieldChange('postHistoryInstructions', this.value)"
          placeholder="[Always stay in character…]">${esc(p.postHistoryInstructions)}</textarea>
        ${Tokens().fieldTokenHTML(p.postHistoryInstructions)}
      </div>
      <div class="field-group">
        <div class="field-label">Internal Notes <span class="field-hint">not exported</span></div>
        <textarea class="field-textarea" rows="3"
          oninput="App.Modules.Presets.fieldChange('notes', this.value)"
          placeholder="Notes on when to use this preset, known limitations…">${esc(p.notes)}</textarea>
      </div>`;
    }

    if (activeTab === 'apply') {
      const cards = App.Modules.Characters.getCards();
      if (!cards.length) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎭</div>
          <div class="empty-text">No characters to apply to yet.</div></div>`;
        return;
      }
      const cardsHTML = cards.map(c => `
        <div class="preset-apply-btn" onclick="App.Modules.Presets.applyTo('${c.id}')">
          <div>
            <div class="preset-apply-name">${esc(c.data.name || 'Unnamed')}</div>
            <div class="preset-apply-meta">
              sys: ${Tokens().count(c.data.system_prompt)}t
              phi: ${Tokens().count(c.data.post_history_instructions)}t
            </div>
          </div>
          <span style="font-size:13px;color:var(--ember)">Apply →</span>
        </div>`).join('');
      el.innerHTML = `
        <p style="font-size:12.5px;color:var(--text3);margin-bottom:14px;line-height:1.6;">
          Applying this preset will <strong style="color:var(--text)">overwrite</strong>
          the system prompt and post-history instructions on the selected character.
          The character is not auto-saved — review and save manually.
        </p>
        ${cardsHTML}`;
    }
  }

  /* ── Right panel: versions ── */
  function renderRightPanel() {
    const el = document.getElementById('rightPanelContent');
    if (!el) return;
    const p = active();
    el.innerHTML = `
      <div class="right-panel-section flex-1">
        <div class="right-panel-header">
          <span class="right-panel-title">Versions</span>
          <button class="btn btn-ghost btn-icon btn-xs"
            onclick="App.Modules.Presets.saveVersion()">+</button>
        </div>
        <div class="right-panel-list" id="presetVersionList"></div>
      </div>
      <div class="right-panel-footer">
        <button class="btn btn-ghost btn-sm btn-full" style="color:var(--danger);border-color:var(--danger)"
          onclick="App.Modules.Presets.deleteEntity('${p?.id || ''}')">Delete preset</button>
      </div>`;
    renderVersionList(p);
  }

  function renderVersionList(p) {
    const el = document.getElementById('presetVersionList');
    if (!el) return;
    const vers = p?._jai?.versions || p?.versions || [];
    if (!vers.length) {
      el.innerHTML = `<div class="empty-state" style="padding:16px 8px;"><div class="empty-text">No versions yet.</div></div>`;
      return;
    }
    el.innerHTML = [...vers].reverse().map(v => `
      <div class="version-item">
        <div class="version-name">${UI().esc(v.name)}</div>
        <div class="version-date">${UI().fmtDateShort(v.ts)}</div>
        <div class="version-actions-row">
          <button class="btn btn-ghost btn-xs" style="flex:1"
            onclick="App.Modules.Presets.restoreVersion('${v.id}')">Restore</button>
        </div>
      </div>`).join('');
  }

  /* ── Handlers ── */
  function nameChange(val)       { const p = active(); if (!p) return; p.name = val; renderList(); }
  function fieldChange(key, val) { const p = active(); if (!p) return; p[key] = val; }

  async function saveVersion() {
    const name = await UI().prompt('Version name', 'e.g. v1, after revisions…', '');
    const p = active(); if (!p) return;
    const label = (name || `v${(p.versions?.length || 0) + 1}`).trim();
    if (!p.versions) p.versions = [];
    const snap = { systemPrompt: p.systemPrompt, postHistoryInstructions: p.postHistoryInstructions };
    p.versions.push({ id: UI().uid(), name: label, ts: Date.now(), snapshot: snap });
    await persist(p);
    renderVersionList(p);
    UI().toast(`Version "${label}" saved`, 'success');
  }

  async function restoreVersion(vid) {
    const p = active(); if (!p) return;
    const v = (p.versions || []).find(x => x.id === vid); if (!v) return;
    const ok = await UI().confirm(`Restore "${v.name}"?`, 'Restore');
    if (!ok) return;
    p.systemPrompt            = v.snapshot.systemPrompt;
    p.postHistoryInstructions = v.snapshot.postHistoryInstructions;
    await persist(p);
    renderTabContent();
    UI().toast(`Restored "${v.name}"`, 'success');
  }

  async function applyTo(cardId) {
    const p = active(); if (!p) return;
    const cards = App.Modules.Characters.getCards();
    const card  = cards.find(c => c.id === cardId); if (!card) return;
    const ok = await UI().confirm(
      `Apply preset "${p.name}" to "${card.data.name}"?\nThis will overwrite the system prompt and post-history instructions.`,
      'Apply'
    );
    if (!ok) return;
    card.data.system_prompt            = p.systemPrompt || '';
    card.data.post_history_instructions = p.postHistoryInstructions || '';
    card.updatedAt = Date.now();
    await DB().put('cards', card);
    UI().toast(`Preset applied to "${card.data.name}"`, 'success');
  }

  async function savePreset() {
    const p = active(); if (!p) return;
    await persist(p);
    renderList(); renderRightPanel();
    App.updateStats();
    UI().toast('Saved', 'success');
  }

  function exportPreset() {
    const p = active(); if (!p) return;
    UI().downloadJSON({
      name:                    p.name,
      systemPrompt:            p.systemPrompt,
      postHistoryInstructions: p.postHistoryInstructions,
    }, UI().safeFilename(p.name) + '_preset.json');
    UI().toast('Preset exported');
  }

  window.App = window.App || {};
  window.App.Modules = window.App.Modules || {};
  window.App.Modules.Presets = {
    loadAll, renderList, renderEditor, renderRightPanel,
    newEntity, selectEntity, deleteEntity, switchTab,
    nameChange, fieldChange,
    saveVersion, restoreVersion,
    applyTo, savePreset, exportPreset,
    isDirty: () => false,
  };
})();
