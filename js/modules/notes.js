/* ── NOTES MODULE ──────────────────────────────────────────────────────────
 * Free-form scratch pad with custom key/value fields. Tags. Markdown hints.
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const DB      = () => App.DB;
  const UI      = () => App.UI;
  const Factory = () => App.Factory;

  let notes    = [];
  let activeId = null;

  function active() { return notes.find(n => n.id === activeId) || null; }

  async function loadAll() {
    notes = await DB().getAll('notes');
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
    renderList();
    updateCount();
  }

  async function persist(n) {
    n.updatedAt = Date.now();
    await DB().put('notes', n);
  }

  async function newEntity() {
    const n = Factory().blankNote();
    notes.unshift(n);
    await persist(n);
    selectEntity(n.id);
    UI().toast('New note created', 'success');
  }

  function selectEntity(id) {
    activeId = id;
    renderList();
    App.openEditor('notes');
    renderEditor();
    renderRightPanel();
    App.updateStats();
  }

  async function deleteEntity(id) {
    const n = notes.find(x => x.id === id);
    if (!n) return;
    const ok = await UI().confirm(`Delete "${n.title}"?`, 'Delete');
    if (!ok) return;
    await DB().del('notes', id);
    notes = notes.filter(x => x.id !== id);
    if (activeId === id) { activeId = null; App.showWelcome(); }
    renderList(); updateCount(); App.updateStats();
    UI().toast('Note deleted');
  }

  function renderList() {
    const el = document.getElementById('list-notes');
    if (!el) return;
    if (!notes.length) {
      el.innerHTML = `<div class="empty-state" style="padding:20px 12px;">
        <div class="empty-icon">📝</div><div class="empty-text">No notes yet</div></div>`;
      return;
    }
    el.innerHTML = notes.map(n => `
      <div class="entity-item${n.id === activeId ? ' active' : ''}"
           onclick="App.Modules.Notes.selectEntity('${n.id}')">
        <div class="entity-avatar">📝</div>
        <div style="min-width:0;flex:1">
          <div class="entity-name">${UI().esc(n.title)}</div>
          <div class="entity-meta">${n.fields?.length || 0}f · ${UI().fmtDateShort(n.updatedAt)}</div>
        </div>
      </div>`).join('');
  }

  function updateCount() {
    const el = document.getElementById('count-notes');
    if (el) el.textContent = notes.length;
  }

  function renderEditor() {
    const n = active();
    if (!n) return;

    document.getElementById('editorTabsBar').innerHTML = `
      <button class="editor-tab active">Note</button>
    `;
    document.getElementById('editorActionsBar').innerHTML = `
      <span class="editor-panel-title">${UI().esc(n.title)}</span>
      <button class="btn btn-ember btn-sm" onclick="App.Modules.Notes.saveNote()">Save</button>
    `;

    renderTabContent();
  }

  function renderTabContent() {
    const n = active();
    if (!n) return;
    const el = document.getElementById('editorContent');
    if (!el) return;
    const { esc } = UI();

    const tagsHTML = (n.tags || []).map((t, i) =>
      `<span class="tag-chip">${esc(t)}<button class="tag-chip-remove"
        onclick="App.Modules.Notes.removeTag(${i})">×</button></span>`
    ).join('');

    const fieldsHTML = (n.fields || []).map((f, i) => `
      <div class="custom-field-row">
        <input class="custom-field-key" value="${esc(f.key)}" placeholder="Field name"
          oninput="App.Modules.Notes.updateField(${i}, 'key', this.value)">
        <textarea class="custom-field-val" rows="3"
          oninput="App.Modules.Notes.updateField(${i}, 'value', this.value)"
          placeholder="Content… (Markdown supported)">${esc(f.value || '')}</textarea>
        <button class="btn btn-ghost btn-icon btn-xs"
          onclick="App.Modules.Notes.removeField(${i})"
          style="margin-top:2px;color:var(--danger);border-color:var(--danger)">✕</button>
      </div>`).join('');

    el.innerHTML = `
    <div class="field-group">
      <div class="field-label">Title</div>
      <input class="field-input" value="${esc(n.title)}" placeholder="Note title"
        oninput="App.Modules.Notes.titleChange(this.value)">
    </div>

    <div class="field-group">
      <div class="field-label">Tags</div>
      <div class="tags-wrap" onclick="this.querySelector('.tags-input').focus()">
        ${tagsHTML}
        <input class="tags-input" id="noteTagInput"
          placeholder="${(n.tags || []).length ? '' : 'Add tags…'}"
          onkeydown="App.Modules.Notes.handleTagKey(event)">
      </div>
    </div>

    <div class="section-divider">
      <div class="section-divider-line"></div>
      <div class="section-divider-label">Content fields</div>
      <div class="section-divider-line"></div>
    </div>
    <p style="font-size:12px;color:var(--text4);margin-bottom:14px;">
      Add any fields you need — story notes, lore, brainstorming, references. Markdown is supported in values.
    </p>

    ${fieldsHTML}

    <button class="btn btn-ghost btn-sm" onclick="App.Modules.Notes.addField()"
      style="margin-top:4px;">+ Add field</button>
    `;
  }

  function renderRightPanel() {
    const el = document.getElementById('rightPanelContent');
    if (!el) return;
    const n = active();
    el.innerHTML = `
      <div class="right-panel-section flex-1">
        <div class="right-panel-header"><span class="right-panel-title">Info</span></div>
        <div style="padding:10px 12px;font-size:12px;color:var(--text3);line-height:1.8;">
          <div>Fields: <span style="color:var(--gold)">${n?.fields?.length || 0}</span></div>
          <div>Tags: <span style="color:var(--gold)">${n?.tags?.length || 0}</span></div>
          <div>Updated: <span style="color:var(--text2)">${n ? UI().fmtDateShort(n.updatedAt) : '—'}</span></div>
        </div>
      </div>
      <div class="right-panel-footer">
        <button class="btn btn-ghost btn-sm btn-full" style="color:var(--danger);border-color:var(--danger)"
          onclick="App.Modules.Notes.deleteEntity('${n?.id || ''}')">Delete note</button>
      </div>`;
  }

  /* ── Handlers ── */
  function titleChange(val)        { const n = active(); if (!n) return; n.title = val; renderList(); }
  function addField()              { const n = active(); if (!n) return; n.fields.push({ key: '', value: '' }); renderTabContent(); }
  function removeField(i)          { const n = active(); if (!n) return; n.fields.splice(i, 1); renderTabContent(); }
  function updateField(i, key, val){ const n = active(); if (!n) return; n.fields[i][key] = val; }

  function handleTagKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim().replace(/,$/, '').trim();
      if (val) {
        const n = active(); if (!n) return;
        if (!n.tags.includes(val)) n.tags.push(val);
        renderTabContent();
        setTimeout(() => document.getElementById('noteTagInput')?.focus(), 10);
      }
      e.target.value = '';
    }
    if (e.key === 'Backspace' && !e.target.value) {
      const n = active(); if (!n) return;
      n.tags.pop(); renderTabContent();
    }
  }
  function removeTag(i) { const n = active(); if (!n) return; n.tags.splice(i, 1); renderTabContent(); }

  async function saveNote() {
    const n = active(); if (!n) return;
    await persist(n);
    renderList(); renderRightPanel();
    App.updateStats();
    UI().toast('Saved', 'success');
  }

  window.App = window.App || {};
  window.App.Modules = window.App.Modules || {};
  window.App.Modules.Notes = {
    loadAll, renderList, renderEditor, renderRightPanel,
    newEntity, selectEntity, deleteEntity,
    titleChange, addField, removeField, updateField,
    handleTagKey, removeTag, saveNote,
    isDirty: () => false,
  };
})();
