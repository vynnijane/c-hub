/* ── LOREBOOKS MODULE ──────────────────────────────────────────────────────
 * Standalone lorebook management. Can be attached to character cards.
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const DB      = () => App.DB;
  const UI      = () => App.UI;
  const Factory = () => App.Factory;

  let lorebooks = [];
  let activeId  = null;
  let activeLoreTab = 'entries';

  function active() { return lorebooks.find(l => l.id === activeId) || null; }

  async function loadAll() {
    lorebooks = await DB().getAll('lorebooks');
    lorebooks.sort((a, b) => b.updatedAt - a.updatedAt);
    renderList();
    updateCount();
  }

  async function persist(lb) {
    lb.updatedAt = Date.now();
    await DB().put('lorebooks', lb);
  }

  async function newEntity() {
    const lb = Factory().blankLorebook();
    lorebooks.unshift(lb);
    await persist(lb);
    selectEntity(lb.id);
    UI().toast('New lorebook created', 'success');
  }

  function selectEntity(id) {
    activeId = id;
    activeLoreTab = 'entries';
    renderList();
    App.openEditor('lorebooks');
    renderEditor();
    renderRightPanel();
    App.updateStats();
  }

  async function deleteEntity(id) {
    const lb = lorebooks.find(l => l.id === id);
    if (!lb) return;
    const ok = await UI().confirm(`Delete "${lb.name}"?`, 'Delete');
    if (!ok) return;
    await DB().del('lorebooks', id);
    lorebooks = lorebooks.filter(l => l.id !== id);
    if (activeId === id) { activeId = null; App.showWelcome(); }
    renderList(); updateCount(); App.updateStats();
    UI().toast('Lorebook deleted');
  }

  function renderList() {
    const el = document.getElementById('list-lorebooks');
    if (!el) return;
    if (!lorebooks.length) {
      el.innerHTML = `<div class="empty-state" style="padding:20px 12px;">
        <div class="empty-icon">📚</div><div class="empty-text">No lorebooks yet</div></div>`;
      return;
    }
    el.innerHTML = lorebooks.map(lb => `
      <div class="entity-item${lb.id === activeId ? ' active' : ''}"
           onclick="App.Modules.Lorebooks.selectEntity('${lb.id}')">
        <div class="entity-avatar">📚</div>
        <div style="min-width:0;flex:1">
          <div class="entity-name">${UI().esc(lb.name)}</div>
          <div class="entity-meta">${lb.entries?.length || 0}e</div>
        </div>
      </div>`).join('');
  }

  function updateCount() {
    const el = document.getElementById('count-lorebooks');
    if (el) el.textContent = lorebooks.length;
  }

  function renderEditor() {
    const lb = active();
    if (!lb) return;

    document.getElementById('editorTabsBar').innerHTML = `
      <button class="editor-tab${activeLoreTab === 'entries' ? ' active' : ''}"
        onclick="App.Modules.Lorebooks.switchTab('entries')">
        Entries <span class="tab-badge" id="lbEntryCount">${lb.entries?.length || 0}</span>
      </button>
      <button class="editor-tab${activeLoreTab === 'attach' ? ' active' : ''}"
        onclick="App.Modules.Lorebooks.switchTab('attach')">Attach to Characters</button>
      <button class="editor-tab${activeLoreTab === 'json' ? ' active' : ''}"
        onclick="App.Modules.Lorebooks.switchTab('json')">Export JSON</button>
    `;

    document.getElementById('editorActionsBar').innerHTML = `
      <span class="editor-panel-title">${UI().esc(lb.name)}</span>
      <button class="btn btn-ghost btn-sm" onclick="App.Modules.Lorebooks.exportLorebook()">⬇ Export</button>
      <button class="btn btn-ember btn-sm" onclick="App.Modules.Lorebooks.saveLorebook()">Save</button>
    `;

    renderTabContent();
  }

  function switchTab(tab) { activeLoreTab = tab; renderEditor(); }

  function renderTabContent() {
    const lb = active();
    if (!lb) return;
    const el = document.getElementById('editorContent');
    if (!el) return;

    if (activeLoreTab === 'entries') el.innerHTML = renderEntriesTab(lb);
    if (activeLoreTab === 'attach')  el.innerHTML = renderAttachTab(lb);
    if (activeLoreTab === 'json')    el.innerHTML = renderJsonTab(lb);
  }

  function renderEntriesTab(lb) {
    const { esc } = UI();
    const entries = lb.entries || [];

    const enHTML = entries.map((e, i) => `
      <div class="lore-entry${e._open ? ' open' : ''}" id="lbLore-${i}">
        <div class="lore-entry-header" onclick="App.Modules.Lorebooks.toggleEntry(${i})">
          <span class="lore-chevron">›</span>
          <div class="lore-enabled-dot${e.enabled === false ? ' off' : ''}"></div>
          <span class="lore-entry-title">${esc(e.keys?.[0] || 'Untitled entry')}</span>
          <span class="lore-entry-meta">pos:${e.insertion_order ?? i} pri:${e.priority ?? 10}</span>
          <button class="btn btn-ghost btn-icon btn-xs"
            onclick="event.stopPropagation(); App.Modules.Lorebooks.removeEntry(${i})">✕</button>
        </div>
        <div class="lore-entry-body">
          <div class="field-group">
            <div class="field-label">Keys <span class="field-hint">comma-separated trigger words</span></div>
            <input class="field-input" value="${esc((e.keys || []).join(', '))}"
              placeholder="keyword1, keyword2…"
              oninput="App.Modules.Lorebooks.updateEntry(${i}, 'keys', this.value.split(',').map(s=>s.trim()).filter(Boolean))">
          </div>
          <div class="field-group">
            <div class="field-label">Content</div>
            <textarea class="field-textarea mono" rows="5"
              oninput="App.Modules.Lorebooks.updateEntry(${i}, 'content', this.value)">${esc(e.content || '')}</textarea>
          </div>
          <div class="field-group">
            <div class="field-label">Comment <span class="field-hint">internal note, not injected</span></div>
            <input class="field-input" value="${esc(e.comment || '')}" placeholder="Notes about this entry…"
              oninput="App.Modules.Lorebooks.updateEntry(${i}, 'comment', this.value)">
          </div>
          <div class="field-row-3">
            <div class="field-group">
              <div class="field-label">Enabled</div>
              <select class="field-select"
                onchange="App.Modules.Lorebooks.updateEntry(${i}, 'enabled', this.value === 'true')">
                <option${e.enabled !== false ? ' selected' : ''} value="true">Yes</option>
                <option${e.enabled === false ? ' selected' : ''} value="false">No</option>
              </select>
            </div>
            <div class="field-group">
              <div class="field-label">Position</div>
              <input class="field-input" type="number" value="${e.insertion_order ?? i}"
                oninput="App.Modules.Lorebooks.updateEntry(${i}, 'insertion_order', parseInt(this.value)||0)">
            </div>
            <div class="field-group">
              <div class="field-label">Priority</div>
              <input class="field-input" type="number" value="${e.priority ?? 10}"
                oninput="App.Modules.Lorebooks.updateEntry(${i}, 'priority', parseInt(this.value)||10)">
            </div>
          </div>
        </div>
      </div>`).join('');

    return `
    <div class="field-group">
      <div class="field-label">Lorebook Name</div>
      <input class="field-input" value="${esc(lb.name)}" placeholder="Lorebook name"
        oninput="App.Modules.Lorebooks.nameChange(this.value)">
    </div>
    <div class="field-group">
      <div class="field-label">Description</div>
      <textarea class="field-textarea" rows="2" placeholder="What this lorebook covers…"
        oninput="App.Modules.Lorebooks.descChange(this.value)">${esc(lb.description || '')}</textarea>
    </div>
    <div class="section-divider">
      <div class="section-divider-line"></div>
      <div class="section-divider-label">World info entries</div>
      <div class="section-divider-line"></div>
    </div>
    <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:12.5px;color:var(--text3);">
        ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}
      </span>
      <button class="btn btn-ghost btn-sm" onclick="App.Modules.Lorebooks.addEntry()">+ Add entry</button>
    </div>
    ${enHTML || '<div class="empty-state"><div class="empty-icon">📖</div><div class="empty-text">No entries yet.</div></div>'}`;
  }

  function renderAttachTab(lb) {
    const { esc } = UI();
    // Get all cards and show which ones have this lorebook attached
    const cards = App.Modules.Characters.getCards();
    if (!cards.length) {
      return `<div class="empty-state"><div class="empty-icon">🎭</div>
        <div class="empty-text">No character cards yet.</div></div>`;
    }
    const rowsHTML = cards.map(c => {
      const attached = (c._jai?.lorebookRefs || []).includes(lb.id);
      return `<div class="lorebook-attach-item">
        <input type="checkbox" ${attached ? 'checked' : ''}
          onchange="App.Modules.Lorebooks.toggleAttach('${lb.id}', '${c.id}', this.checked)"
          style="accent-color:var(--ember)">
        <span class="lorebook-attach-name">${esc(c.data.name || 'Unnamed')}</span>
        <span class="lorebook-attach-count">${c.data.character_book?.entries?.length || 0}e inline</span>
      </div>`;
    }).join('');

    return `
    <p style="font-size:12.5px;color:var(--text3);margin-bottom:14px;line-height:1.6;">
      Tick the characters that should reference this lorebook.<br>
      Attached lorebooks appear as a note in the character's Raw JSON under <code style="font-size:11px;color:var(--ember)">_jai.lorebookRefs</code>.
    </p>
    ${rowsHTML}`;
  }

  function renderJsonTab(lb) {
    const exported = buildExportJson(lb);
    return `
    <div class="field-group">
      <div class="field-label">SillyTavern-compatible lorebook JSON</div>
      <div class="json-viewer">${UI().esc(JSON.stringify(exported, null, 2))}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button class="btn btn-ember" onclick="App.Modules.Lorebooks.exportLorebook()">⬇ Download JSON</button>
      <button class="btn btn-ghost" onclick="App.Modules.Lorebooks.importLorebook()">⬆ Import</button>
      <input type="file" id="lbImportFile" accept=".json" onchange="App.Modules.Lorebooks.handleImport(event)">
    </div>`;
  }

  function buildExportJson(lb) {
    return {
      name:    lb.name,
      entries: (lb.entries || []).map(e => {
        const { _open, id, ...rest } = e;
        return rest;
      })
    };
  }

  /* ── Right panel ── */
  function renderRightPanel() {
    const el = document.getElementById('rightPanelContent');
    if (!el) return;
    const lb = active();
    el.innerHTML = `
      <div class="right-panel-section flex-1">
        <div class="right-panel-header"><span class="right-panel-title">Info</span></div>
        <div style="padding:10px 12px;font-size:12px;color:var(--text3);line-height:1.7;">
          <div>Entries: <span style="color:var(--gold)">${lb?.entries?.length || 0}</span></div>
          <div>Updated: <span style="color:var(--text2)">${lb ? UI().fmtDateShort(lb.updatedAt) : '—'}</span></div>
        </div>
      </div>
      <div class="right-panel-footer">
        <button class="btn btn-ghost btn-sm btn-full" style="color:var(--danger);border-color:var(--danger)"
          onclick="App.Modules.Lorebooks.deleteEntity('${lb?.id || ''}')">Delete lorebook</button>
      </div>`;
  }

  /* ── Entry handlers ── */
  function nameChange(val)  { const lb = active(); if (!lb) return; lb.name = val; renderList(); }
  function descChange(val)  { const lb = active(); if (!lb) return; lb.description = val; }
  function addEntry()       { const lb = active(); if (!lb) return; lb.entries.push(Factory().blankLoreEntry(lb.entries.length)); renderTabContent(); }
  function removeEntry(i)   { const lb = active(); if (!lb) return; lb.entries.splice(i, 1); renderTabContent(); }
  function toggleEntry(i)   { const lb = active(); if (!lb) return; const e = lb.entries[i]; e._open = !e._open; const el = document.getElementById('lbLore-'+i); if (el) el.classList.toggle('open', e._open); }
  function updateEntry(i, key, val) { const lb = active(); if (!lb) return; lb.entries[i][key] = val; }

  async function toggleAttach(lbId, cardId, attach) {
    const cards = App.Modules.Characters.getCards();
    const card  = cards.find(c => c.id === cardId);
    if (!card) return;
    if (!card._jai.lorebookRefs) card._jai.lorebookRefs = [];
    if (attach && !card._jai.lorebookRefs.includes(lbId)) {
      card._jai.lorebookRefs.push(lbId);
    } else {
      card._jai.lorebookRefs = card._jai.lorebookRefs.filter(id => id !== lbId);
    }
    card.updatedAt = Date.now();
    await DB().put('cards', card);
    UI().toast(attach ? 'Lorebook attached' : 'Lorebook detached', 'success');
  }

  async function saveLorebook() {
    const lb = active(); if (!lb) return;
    await persist(lb);
    renderList(); renderRightPanel();
    App.updateStats();
    UI().toast('Saved', 'success');
  }

  function exportLorebook() {
    const lb = active(); if (!lb) return;
    UI().downloadJSON(buildExportJson(lb), UI().safeFilename(lb.name) + '_lorebook.json');
    UI().toast('Lorebook exported');
  }

  function importLorebook() {
    document.getElementById('lbImportFile').click();
  }

  async function handleImport(e) {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = '';
    try {
      const text  = await UI().readFile(file);
      const json  = JSON.parse(text);
      const lb    = Factory().blankLorebook(json.name || 'Imported Lorebook');
      if (Array.isArray(json.entries)) {
        lb.entries = json.entries.map((en, i) => ({
          ...Factory().blankLoreEntry(i),
          keys:            Array.isArray(en.keys) ? en.keys : (en.key ? [en.key] : []),
          content:         en.content || '',
          enabled:         en.enabled !== false,
          insertion_order: en.insertion_order ?? i,
          priority:        en.priority ?? 10,
          comment:         en.comment || '',
        }));
      }
      lorebooks.unshift(lb);
      await persist(lb);
      selectEntity(lb.id);
      updateCount();
      UI().toast(`"${lb.name}" imported`, 'success');
    } catch (err) {
      UI().toast('Import failed: ' + err.message, 'error');
    }
  }

  window.App = window.App || {};
  window.App.Modules = window.App.Modules || {};
  window.App.Modules.Lorebooks = {
    loadAll, renderList, renderEditor, renderRightPanel,
    newEntity, selectEntity, deleteEntity,
    switchTab, nameChange, descChange,
    addEntry, removeEntry, toggleEntry, updateEntry,
    toggleAttach, saveLorebook, exportLorebook, importLorebook, handleImport,
    getLorebooks: () => lorebooks,
    isDirty: () => false,
  };
})();
