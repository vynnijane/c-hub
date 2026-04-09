/* ── PERSONAS MODULE ───────────────────────────────────────────────────────
 * {{user}} persona profiles with custom fields. Export as TXT or Markdown.
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const DB      = () => App.DB;
  const UI      = () => App.UI;
  const Tokens  = () => App.Tokens;
  const Factory = () => App.Factory;

  let personas = [];
  let activeId = null;

  function active() { return personas.find(p => p.id === activeId) || null; }

  async function loadAll() {
    personas = await DB().getAll('personas');
    personas.sort((a, b) => b.updatedAt - a.updatedAt);
    renderList();
    updateCount();
  }

  async function persist(p) {
    p.updatedAt = Date.now();
    await DB().put('personas', p);
  }

  async function newEntity() {
    const p = Factory().blankPersona();
    personas.unshift(p);
    await persist(p);
    selectEntity(p.id);
    UI().toast('New persona created', 'success');
  }

  function selectEntity(id) {
    activeId = id;
    renderList();
    App.openEditor('personas');
    renderEditor();
    renderRightPanel();
    App.updateStats();
  }

  async function deleteEntity(id) {
    const p = personas.find(x => x.id === id);
    if (!p) return;
    const ok = await UI().confirm(`Delete persona "${p.name}"?`, 'Delete');
    if (!ok) return;
    await DB().del('personas', id);
    personas = personas.filter(x => x.id !== id);
    if (activeId === id) { activeId = null; App.showWelcome(); }
    renderList(); updateCount(); App.updateStats();
    UI().toast('Persona deleted');
  }

  function renderList() {
    const el = document.getElementById('list-personas');
    if (!el) return;
    if (!personas.length) {
      el.innerHTML = `<div class="empty-state" style="padding:20px 12px;">
        <div class="empty-icon">👤</div><div class="empty-text">No personas yet</div></div>`;
      return;
    }
    el.innerHTML = personas.map(p => `
      <div class="entity-item${p.id === activeId ? ' active' : ''}"
           onclick="App.Modules.Personas.selectEntity('${p.id}')">
        <div class="entity-avatar">👤</div>
        <div style="min-width:0;flex:1">
          <div class="entity-name">${UI().esc(p.name)}</div>
          ${p.isActive ? '<div class="entity-meta" style="color:var(--ember)">● Active</div>' : ''}
        </div>
      </div>`).join('');
  }

  function updateCount() {
    const el = document.getElementById('count-personas');
    if (el) el.textContent = personas.length;
  }

  function renderEditor() {
    const p = active();
    if (!p) return;

    document.getElementById('editorTabsBar').innerHTML = `
      <button class="editor-tab active">Persona Fields</button>
    `;

    const activeBadge = p.isActive
      ? `<span class="persona-active-badge">● Active {{user}}</span>`
      : '';

    document.getElementById('editorActionsBar').innerHTML = `
      <span class="editor-panel-title">${UI().esc(p.name)}</span>
      ${activeBadge}
      <button class="btn btn-ghost btn-sm" onclick="App.Modules.Personas.setActive()">
        ${p.isActive ? '✓ Active' : 'Set Active'}
      </button>
      <button class="btn btn-ghost btn-sm" onclick="App.Modules.Personas.exportPersona()">⬇ Export</button>
      <button class="btn btn-ember btn-sm" onclick="App.Modules.Personas.savePersona()">Save</button>
    `;

    renderTabContent();
  }

  function renderTabContent() {
    const p = active();
    if (!p) return;
    const el = document.getElementById('editorContent');
    if (!el) return;
    const { esc } = UI();

    const customFieldsHTML = (p.customFields || []).map((f, i) => `
      <div class="custom-field-row">
        <input class="custom-field-key" value="${esc(f.key)}" placeholder="Field name"
          oninput="App.Modules.Personas.updateCustomField(${i}, 'key', this.value)">
        <textarea class="custom-field-val" rows="2"
          oninput="App.Modules.Personas.updateCustomField(${i}, 'value', this.value)"
          placeholder="Value…">${esc(f.value || '')}</textarea>
        <button class="btn btn-ghost btn-icon btn-xs"
          onclick="App.Modules.Personas.removeCustomField(${i})"
          style="margin-top:2px;color:var(--danger);border-color:var(--danger)">✕</button>
      </div>`).join('');

    el.innerHTML = `
    <div class="field-group">
      <div class="field-label">Display Name</div>
      <input class="field-input" value="${esc(p.name)}" placeholder="Your character's name"
        oninput="App.Modules.Personas.nameChange(this.value)">
    </div>

    <div class="field-group">
      <div class="field-label">Description <span class="field-hint">who {{user}} is</span></div>
      <textarea class="field-textarea" rows="5"
        oninput="App.Modules.Personas.fieldChange('description', this.value)"
        placeholder="Brief description of your persona…">${esc(p.description)}</textarea>
      ${Tokens().fieldTokenHTML(p.description)}
    </div>

    <div class="field-row">
      <div class="field-group">
        <div class="field-label">Personality</div>
        <textarea class="field-textarea" rows="4"
          oninput="App.Modules.Personas.fieldChange('personality', this.value)"
          placeholder="Personality traits…">${esc(p.personality)}</textarea>
        ${Tokens().fieldTokenHTML(p.personality)}
      </div>
      <div class="field-group">
        <div class="field-label">Appearance</div>
        <textarea class="field-textarea" rows="4"
          oninput="App.Modules.Personas.fieldChange('appearance', this.value)"
          placeholder="Physical description…">${esc(p.appearance)}</textarea>
      </div>
    </div>

    <div class="field-group">
      <div class="field-label">Backstory</div>
      <textarea class="field-textarea" rows="5"
        oninput="App.Modules.Personas.fieldChange('backstory', this.value)"
        placeholder="Character history, context…">${esc(p.backstory)}</textarea>
    </div>

    <div class="section-divider">
      <div class="section-divider-line"></div>
      <div class="section-divider-label">Custom fields</div>
      <div class="section-divider-line"></div>
    </div>
    ${customFieldsHTML}
    <button class="btn btn-ghost btn-sm" onclick="App.Modules.Personas.addCustomField()"
      style="margin-top:4px;">+ Add field</button>
    `;
  }

  function renderRightPanel() {
    const el = document.getElementById('rightPanelContent');
    if (!el) return;
    const p = active();
    const totalTokens = p
      ? [p.description, p.personality, p.appearance, p.backstory,
         ...(p.customFields || []).map(f => f.value)
        ].reduce((sum, t) => sum + Tokens().count(t), 0)
      : 0;

    el.innerHTML = `
      <div class="right-panel-section">
        <div class="right-panel-header"><span class="right-panel-title">Token Count</span></div>
        <div style="padding:10px 12px;font-size:12px;">
          <span style="font-family:'JetBrains Mono',monospace;color:var(--gold)">${totalTokens.toLocaleString()}</span>
          <span style="color:var(--text4)"> / ${Tokens().getLimit().toLocaleString()}</span>
        </div>
      </div>
      <div class="right-panel-section flex-1">
        <div class="right-panel-header"><span class="right-panel-title">Export</span></div>
        <div style="padding:10px 8px;display:flex;flex-direction:column;gap:6px;">
          <button class="btn btn-ghost btn-sm btn-full"
            onclick="App.Modules.Personas.exportAs('md')">Export as Markdown</button>
          <button class="btn btn-ghost btn-sm btn-full"
            onclick="App.Modules.Personas.exportAs('txt')">Export as TXT</button>
        </div>
      </div>
      <div class="right-panel-footer">
        <button class="btn btn-ghost btn-sm btn-full" style="color:var(--danger);border-color:var(--danger)"
          onclick="App.Modules.Personas.deleteEntity('${p?.id || ''}')">Delete persona</button>
      </div>`;
  }

  /* ── Handlers ── */
  function nameChange(val)       { const p = active(); if (!p) return; p.name = val; renderList(); }
  function fieldChange(key, val) { const p = active(); if (!p) return; p[key] = val; }

  function addCustomField()           { const p = active(); if (!p) return; p.customFields.push({ key: '', value: '' }); renderTabContent(); }
  function removeCustomField(i)       { const p = active(); if (!p) return; p.customFields.splice(i, 1); renderTabContent(); }
  function updateCustomField(i, k, v) { const p = active(); if (!p) return; p.customFields[i][k] = v; }

  async function setActive() {
    const p = active(); if (!p) return;
    const wasActive = p.isActive;
    // Deactivate all others
    for (const persona of personas) {
      if (persona.isActive && persona.id !== p.id) {
        persona.isActive = false;
        await persist(persona);
      }
    }
    p.isActive = !wasActive;
    await persist(p);
    renderList(); renderEditor();
    UI().toast(p.isActive ? `"${p.name}" is now the active persona` : 'Persona deactivated', 'success');
  }

  async function savePersona() {
    const p = active(); if (!p) return;
    await persist(p);
    renderList(); renderRightPanel();
    App.updateStats();
    UI().toast('Saved', 'success');
  }

  function exportAs(fmt) {
    const p = active(); if (!p) return;
    const lines = [
      `# ${p.name}`, '',
      p.description  ? `## Description\n${p.description}\n`  : '',
      p.personality  ? `## Personality\n${p.personality}\n`  : '',
      p.appearance   ? `## Appearance\n${p.appearance}\n`    : '',
      p.backstory    ? `## Backstory\n${p.backstory}\n`      : '',
      ...(p.customFields || []).filter(f => f.key).map(f => `## ${f.key}\n${f.value}\n`)
    ].filter(Boolean);
    const text = lines.join('\n');
    if (fmt === 'md') {
      UI().downloadText(text, UI().safeFilename(p.name) + '_persona.md');
    } else {
      UI().downloadText(text.replace(/^#{1,3} /gm, '').trim(), UI().safeFilename(p.name) + '_persona.txt');
    }
    UI().toast('Persona exported');
  }

  function exportPersona() { exportAs('md'); }

  window.App = window.App || {};
  window.App.Modules = window.App.Modules || {};
  window.App.Modules.Personas = {
    loadAll, renderList, renderEditor, renderRightPanel,
    newEntity, selectEntity, deleteEntity,
    nameChange, fieldChange,
    addCustomField, removeCustomField, updateCustomField,
    setActive, savePersona, exportPersona, exportAs,
    isDirty: () => false,
  };
})();
