/* ── CHARACTERS MODULE ─────────────────────────────────────────────────────
 * Full character card editor with JAI-specific fields.
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const DB      = () => App.DB;
  const UI      = () => App.UI;
  const Tokens  = () => App.Tokens;
  const Diff    = () => App.Diff;
  const Factory = () => App.Factory;
  const Bio     = () => App.BioEditor;

  let cards         = [];
  let activeId      = null;
  let activeTab     = 'fields';
  let editingImgIdx = null;
  let _bioUpdater   = null;
  let _dirty        = false;   // unsaved-changes flag

  function active() { return cards.find(c => c.id === activeId) || null; }

  /* ── Persistence ── */
  async function loadAll() {
    cards = await DB().getAll('cards');
    cards.sort((a, b) => b.updatedAt - a.updatedAt);
    renderList();
    updateCount();
  }

  async function persist(card) {
    card.updatedAt = Date.now();
    await DB().put('cards', card);
  }

  /* ── Create / Select / Delete ── */
  async function newEntity() {
    const card = Factory().blankCard();
    cards.unshift(card);
    await persist(card);
    selectEntity(card.id);
    UI().toast('New character created', 'success');
    return card;
  }

  async function selectEntity(id) {
    // Warn if switching away from an unsaved card
    if (activeId !== null && activeId !== id && _dirty) {
      const leave = await UI().confirm(
        'You have unsaved changes. Leave without saving?', 'Leave', 'Stay'
      );
      if (!leave) return;
    }
    _dirty    = false;
    activeId  = id;
    activeTab = 'fields';
    renderList();
    App.openEditor('characters');
    renderEditor();
    renderRightPanel();
    App.updateStats();
  }

  async function deleteEntity(id) {
    const card = cards.find(c => c.id === id);
    if (!card) return;
    const ok = await UI().confirm(`Delete "${card.data.name}"? This cannot be undone.`, 'Delete', 'Cancel');
    if (!ok) return;
    await DB().del('cards', id);
    cards = cards.filter(c => c.id !== id);
    if (activeId === id) {
      activeId = null;
      App.showWelcome();
    }
    renderList();
    updateCount();
    App.updateStats();
    UI().toast('Character deleted');
  }

  /* ── Sidebar list ── */
  function renderList() {
    const el = document.getElementById('list-characters');
    if (!el) return;

    if (!cards.length) {
      el.innerHTML = `<div class="empty-state" style="padding:20px 12px;">
        <div class="empty-icon">🎭</div>
        <div class="empty-text">No characters yet</div>
      </div>`;
      return;
    }

    el.innerHTML = cards.map(c => {
      const img    = c._jai?.images?.find(i => i.id === c._jai?.activeImageId) || c._jai?.images?.[0];
      const avatar = img
        ? `<img src="${img.dataUrl}" alt="">`
        : c.data.name.charAt(0).toUpperCase() || '?';
      const verCount = c._jai?.versions?.length || 0;
      const nsfw     = c._jai?.nsfw ? `<span style="color:var(--danger);font-size:9px;font-weight:600;">NSFW</span>` : '';
      return `<div class="entity-item${c.id === activeId ? ' active' : ''}"
               onclick="App.Modules.Characters.selectEntity('${c.id}')">
        <div class="entity-avatar">${avatar}</div>
        <div style="min-width:0;flex:1">
          <div class="entity-name">${UI().esc(c.data.name || 'Unnamed')}</div>
          <div class="entity-meta">${verCount}v ${nsfw}</div>
        </div>
      </div>`;
    }).join('');
  }

  function updateCount() {
    const el = document.getElementById('count-characters');
    if (el) el.textContent = cards.length;
  }

  /* ── Editor shell ── */
  function renderEditor() {
    const c = active();
    if (!c) return;

    // Tab bar
    const tabs = [
      { id: 'fields',    label: 'Fields' },
      { id: 'bio',       label: 'Bio' },
      { id: 'images',    label: 'Images',    badge: 'imgCount' },
      { id: 'greetings', label: 'Greetings', badge: 'greetCount' },
      { id: 'lorebook',  label: 'Lorebook',  badge: 'loreCount' },
      { id: 'json',      label: 'Raw JSON' },
    ];
    const tabsHTML = tabs.map(t => `
      <button class="editor-tab${activeTab === t.id ? ' active' : ''}"
        onclick="App.Modules.Characters.switchTab('${t.id}')">
        ${t.label}
        ${t.badge ? `<span class="tab-badge" id="${t.badge}">0</span>` : ''}
      </button>`).join('');

    const titles = {
      fields: 'Character Fields', bio: 'Character Bio', images: 'Bot Images',
      greetings: 'Alternate Greetings', lorebook: 'Inline Lorebook', json: 'Raw JSON'
    };

    document.getElementById('editorTabsBar').innerHTML = tabsHTML;
    document.getElementById('editorActionsBar').innerHTML = `
      <span class="editor-panel-title" id="panelTitle">${UI().esc(titles[activeTab] || 'Editor')}</span>
      <div id="totalTokensDisplay" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text3);
           background:var(--bg3);border:1px solid var(--border);padding:2px 8px;border-radius:4px;">
        tokens: <span style="color:var(--gold)" id="totalTokens">—</span>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="App.Modules.Characters.exportCard()">⬇ Export</button>
      <span id="dirtyIndicator" title="Unsaved changes"
        style="font-size:18px;line-height:1;color:var(--ember);display:${_dirty ? 'inline' : 'none'}">●</span>
      <button class="btn btn-ember btn-sm" onclick="App.Modules.Characters.saveCard()">Save</button>
    `;

    renderTabContent();
  }

  /* Mark as dirty and show the dot without re-rendering the whole bar */
  function _markDirty() {
    _dirty = true;
    const dot = document.getElementById('dirtyIndicator');
    if (dot) dot.style.display = 'inline';
  }

  function switchTab(tab) {
    activeTab = tab;
    renderEditor();
  }

  /* ── Tab content ── */
  function renderTabContent() {
    const c = active();
    if (!c) return;
    const el = document.getElementById('editorContent');
    if (!el) return;

    if (activeTab === 'fields')    { el.innerHTML = renderFieldsTab(c); }
    if (activeTab === 'bio')       { el.innerHTML = '<div id="bioEditorContainer"></div>'; renderBioTab(c); }
    if (activeTab === 'images')    { el.innerHTML = renderImagesTab(c); }
    if (activeTab === 'greetings') { el.innerHTML = renderGreetingsTab(c); }
    if (activeTab === 'lorebook')  { el.innerHTML = renderLorebookTab(c); }
    if (activeTab === 'json')      { el.innerHTML = renderJsonTab(c); }

    updateBadges(c);
    updateTokenDisplay(c);
  }

  function updateBadges(c) {
    const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    set('imgCount',   c._jai?.images?.length || 0);
    set('greetCount', 1 + (c.data.alternate_greetings?.length || 0));
    set('loreCount',  c.data.character_book?.entries?.length || 0);
  }

  function updateTokenDisplay(c) {
    if (!c) return;
    const d = c.data;
    const fields = [
      { label: 'desc',   text: d.description },
      { label: 'pers',   text: d.personality },
      { label: 'scen',   text: d.scenario },
      { label: 'first',  text: d.first_mes },
      { label: 'mes',    text: d.mes_example },
      { label: 'sys',    text: d.system_prompt },
      { label: 'phi',    text: d.post_history_instructions },
    ];
    const total = fields.reduce((s, f) => s + Tokens().count(f.text), 0);
    const el = document.getElementById('totalTokens');
    if (el) el.textContent = total.toLocaleString();

    // Right panel token summary
    renderTokenSummary(c);
  }

  /* ── FIELDS TAB ── */
  function renderFieldsTab(c) {
    const d = c.data;
    const { esc } = UI();
    const cats = Factory().JAI_CATEGORIES.map(cat =>
      `<option value="${esc(cat)}"${c._jai.category === cat ? ' selected' : ''}>${esc(cat)}</option>`
    ).join('');

    const tagsHTML = (d.tags || []).map((t, i) =>
      `<span class="tag-chip">${esc(t)}<button class="tag-chip-remove"
        onclick="App.Modules.Characters.removeTag(${i})">×</button></span>`
    ).join('');

    return `
    <div class="field-row">
      <div class="field-group">
        <div class="field-label">Name</div>
        <input class="field-input" value="${esc(d.name)}" placeholder="Character name"
          oninput="App.Modules.Characters.fieldChange('name', this.value)">
      </div>
      <div class="field-group">
        <div class="field-label">Version <span class="field-hint">card version string</span></div>
        <input class="field-input" value="${esc(d.character_version || '1.0')}" placeholder="1.0"
          oninput="App.Modules.Characters.fieldChange('character_version', this.value)">
      </div>
    </div>

    <div class="field-group">
      <div class="field-label">Description <span class="field-hint">main personality / appearance prompt</span></div>
      <textarea class="field-textarea mono" rows="9"
        oninput="App.Modules.Characters.fieldChange('description', this.value)"
        placeholder="Write your character's description here…">${esc(d.description)}</textarea>
      ${Tokens().fieldTokenHTML(d.description)}
    </div>

    <div class="field-row">
      <div class="field-group">
        <div class="field-label">Personality</div>
        <textarea class="field-textarea" rows="4"
          oninput="App.Modules.Characters.fieldChange('personality', this.value)"
          placeholder="Trait keywords or short summary…">${esc(d.personality)}</textarea>
        ${Tokens().fieldTokenHTML(d.personality)}
      </div>
      <div class="field-group">
        <div class="field-label">Scenario</div>
        <textarea class="field-textarea" rows="4"
          oninput="App.Modules.Characters.fieldChange('scenario', this.value)"
          placeholder="The setting when chats begin…">${esc(d.scenario)}</textarea>
        ${Tokens().fieldTokenHTML(d.scenario)}
      </div>
    </div>

    <div class="field-group">
      <div class="field-label">First Message <span class="field-hint">greeting shown when chat starts</span></div>
      <textarea class="field-textarea mono" rows="6"
        oninput="App.Modules.Characters.fieldChange('first_mes', this.value)"
        placeholder="*The character looks up as you enter…*">${esc(d.first_mes)}</textarea>
      ${Tokens().fieldTokenHTML(d.first_mes)}
    </div>

    <div class="field-group">
      <div class="field-label">Example Dialogue <span class="field-hint">&lt;START&gt; blocks</span></div>
      <textarea class="field-textarea mono" rows="7"
        oninput="App.Modules.Characters.fieldChange('mes_example', this.value)"
        placeholder="&lt;START&gt;\n{{user}}: Hello\n{{char}}: Hi there!">${esc(d.mes_example)}</textarea>
    </div>

    <div class="section-divider">
      <div class="section-divider-line"></div>
      <div class="section-divider-label">Advanced fields</div>
      <div class="section-divider-line"></div>
    </div>

    <div class="field-group">
      <div class="field-label">System Prompt <span class="field-hint">overrides user system prompt</span></div>
      <textarea class="field-textarea mono" rows="5"
        oninput="App.Modules.Characters.fieldChange('system_prompt', this.value)"
        placeholder="You are {{char}}. Always respond in character…">${esc(d.system_prompt)}</textarea>
      ${Tokens().fieldTokenHTML(d.system_prompt)}
    </div>

    <div class="field-group">
      <div class="field-label">Post-History Instructions <span class="field-hint">injected after chat history</span></div>
      <textarea class="field-textarea mono" rows="3"
        oninput="App.Modules.Characters.fieldChange('post_history_instructions', this.value)"
        placeholder="[Always stay in character…]">${esc(d.post_history_instructions)}</textarea>
    </div>

    <div class="section-divider">
      <div class="section-divider-line"></div>
      <div class="section-divider-label">JanitorAI settings</div>
      <div class="section-divider-line"></div>
    </div>

    <div class="field-row-3">
      <div class="field-group">
        <div class="field-label">Category</div>
        <select class="field-select"
          onchange="App.Modules.Characters.jaiChange('category', this.value)">
          <option value="">— Select —</option>
          ${cats}
        </select>
      </div>
      <div class="field-group">
        <div class="field-label">Visibility</div>
        <select class="field-select"
          onchange="App.Modules.Characters.jaiChange('visibility', this.value)">
          <option value="private"${c._jai.visibility === 'private' ? ' selected' : ''}>Private</option>
          <option value="unlisted"${c._jai.visibility === 'unlisted' ? ' selected' : ''}>Unlisted</option>
          <option value="public"${c._jai.visibility === 'public' ? ' selected' : ''}>Public</option>
        </select>
      </div>
      <div class="field-group">
        <div class="field-label">NSFW</div>
        <label class="toggle" style="margin-top:8px;">
          <input type="checkbox" ${c._jai.nsfw ? 'checked' : ''}
            onchange="App.Modules.Characters.jaiChange('nsfw', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="field-row">
      <div class="field-group">
        <div class="field-label">Creator</div>
        <input class="field-input" value="${esc(d.creator || '')}" placeholder="Your username"
          oninput="App.Modules.Characters.fieldChange('creator', this.value)">
      </div>
      <div class="field-group">
        <div class="field-label">Creator Notes</div>
        <input class="field-input" value="${esc(d.creator_notes || '')}" placeholder="Usage notes, credits…"
          oninput="App.Modules.Characters.fieldChange('creator_notes', this.value)">
      </div>
    </div>

    <div class="field-group">
      <div class="field-label">Tags</div>
      <div class="tags-wrap" onclick="this.querySelector('.tags-input').focus()">
        ${tagsHTML}
        <input class="tags-input" id="tagInput"
          placeholder="${(d.tags || []).length ? '' : 'Add tags…'}"
          onkeydown="App.Modules.Characters.handleTagKey(event)">
      </div>
    </div>
    `;
  }

  /* ── BIO TAB ── */
  function renderBioTab(c) {
    const container = document.getElementById('bioEditorContainer');
    if (!container) return;
    _bioUpdater = Bio().render(container, c._jai.bio || '', val => {
      const card = active(); if (!card) return;
      card._jai.bio = val;
      _markDirty();
    });
  }

  /* ── IMAGES TAB ── */
  function renderImagesTab(c) {
    const { esc } = UI();
    const imgs = c._jai?.images || [];
    const cardsHTML = imgs.map((img, i) => `
      <div class="img-card${img.id === c._jai?.activeImageId ? ' active' : ''}"
           onclick="App.Modules.Characters.openImgModal(${i})">
        ${img.id === c._jai?.activeImageId ? '<div class="img-active-badge">ACTIVE</div>' : ''}
        <div class="img-card-thumb"><img src="${img.dataUrl}" alt=""></div>
        <div class="img-card-body">
          <div class="img-card-label">${esc(img.label || 'Untitled')}</div>
          <div class="img-card-prompt">${esc(img.prompt || 'no prompt saved')}</div>
        </div>
      </div>`).join('');

    return `
    <div style="margin-bottom:14px;">
      <p style="font-size:12.5px;color:var(--text3);line-height:1.6;margin-bottom:10px;">
        Store character images alongside their generation prompts.<br>
        The <strong style="color:var(--text2)">active</strong> image is used as the card avatar.
      </p>
      <label class="btn btn-ghost btn-sm" for="imgUpload" style="cursor:pointer">+ Upload image</label>
      <input type="file" id="imgUpload" accept="image/*"
        onchange="App.Modules.Characters.handleImgUpload(event)">
    </div>
    <div class="img-grid">
      ${cardsHTML}
      <div class="img-upload-card" onclick="document.getElementById('imgUpload').click()">
        <div style="font-size:26px;">+</div>
        <div>Add image</div>
      </div>
    </div>`;
  }

  /* ── GREETINGS TAB ── */
  function renderGreetingsTab(c) {
    const { esc } = UI();
    const alts = c.data.alternate_greetings || [];
    const altHTML = alts.map((g, i) => `
      <div class="alt-greeting">
        <div class="alt-greeting-num">GREETING ${i + 2}</div>
        <button class="alt-greeting-remove"
          onclick="App.Modules.Characters.removeGreeting(${i})">Remove</button>
        <textarea class="field-textarea mono" rows="5"
          oninput="App.Modules.Characters.updateGreeting(${i}, this.value)">${esc(g)}</textarea>
      </div>`).join('');

    return `
    <div class="field-group">
      <div class="field-label">Greeting 1 <span class="field-hint">same as First Message in Fields tab</span></div>
      <textarea class="field-textarea mono" rows="6"
        oninput="App.Modules.Characters.fieldChange('first_mes', this.value)">${esc(c.data.first_mes)}</textarea>
    </div>
    <div class="section-divider">
      <div class="section-divider-line"></div>
      <div class="section-divider-label">Alternate greetings</div>
      <div class="section-divider-line"></div>
    </div>
    ${altHTML}
    <button class="btn btn-ghost btn-sm" onclick="App.Modules.Characters.addGreeting()"
      style="margin-top:4px;">+ Add alternate greeting</button>`;
  }

  /* ── LOREBOOK TAB ── */
  function renderLorebookTab(c) {
    const { esc } = UI();
    const entries = c.data.character_book?.entries || [];
    const entHTML = entries.map((e, i) => `
      <div class="lore-entry${e._open ? ' open' : ''}" id="lore-${i}">
        <div class="lore-entry-header" onclick="App.Modules.Characters.toggleLore(${i})">
          <span class="lore-chevron">›</span>
          <div class="lore-enabled-dot${e.enabled === false ? ' off' : ''}"></div>
          <span class="lore-entry-title">${esc(e.keys?.[0] || 'Untitled entry')}</span>
          <span class="lore-entry-meta">pos:${e.insertion_order ?? i}</span>
          <button class="btn btn-ghost btn-icon btn-xs"
            onclick="event.stopPropagation(); App.Modules.Characters.removeLore(${i})"
            style="font-size:10px;">✕</button>
        </div>
        <div class="lore-entry-body">
          <div class="field-group">
            <div class="field-label">Keys <span class="field-hint">comma-separated trigger words</span></div>
            <input class="field-input" value="${esc((e.keys || []).join(', '))}"
              placeholder="keyword1, keyword2…"
              oninput="App.Modules.Characters.updateLore(${i}, 'keys', this.value.split(',').map(s=>s.trim()).filter(Boolean))">
          </div>
          <div class="field-group">
            <div class="field-label">Content</div>
            <textarea class="field-textarea mono" rows="5"
              oninput="App.Modules.Characters.updateLore(${i}, 'content', this.value)">${esc(e.content || '')}</textarea>
          </div>
          <div class="field-row-3">
            <div class="field-group">
              <div class="field-label">Enabled</div>
              <select class="field-select"
                onchange="App.Modules.Characters.updateLore(${i}, 'enabled', this.value === 'true')">
                <option${e.enabled !== false ? ' selected' : ''} value="true">Yes</option>
                <option${e.enabled === false ? ' selected' : ''} value="false">No</option>
              </select>
            </div>
            <div class="field-group">
              <div class="field-label">Position</div>
              <input class="field-input" type="number" value="${e.insertion_order ?? i}"
                oninput="App.Modules.Characters.updateLore(${i}, 'insertion_order', parseInt(this.value)||0)">
            </div>
            <div class="field-group">
              <div class="field-label">Priority</div>
              <input class="field-input" type="number" value="${e.priority ?? 10}"
                oninput="App.Modules.Characters.updateLore(${i}, 'priority', parseInt(this.value)||10)">
            </div>
          </div>
        </div>
      </div>`).join('');

    return `
    <div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;">
      <p style="font-size:12.5px;color:var(--text3);">
        ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} — triggers inject world context into the AI prompt.
      </p>
      <button class="btn btn-ghost btn-sm" onclick="App.Modules.Characters.addLore()">+ Add entry</button>
    </div>
    ${entHTML || '<div class="empty-state"><div class="empty-icon">📖</div><div class="empty-text">No lorebook entries yet.</div></div>'}`;
  }

  /* ── JSON TAB ── */
  function renderJsonTab(c) {
    const exported = Factory().buildExportJson(c);
    return `
    <div class="field-group">
      <div class="field-label">Export Preview <span class="field-hint">V2 spec, ready to import into JAI</span></div>
      <div class="json-viewer">${UI().esc(JSON.stringify(exported, null, 2))}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button class="btn btn-ember" onclick="App.Modules.Characters.exportCard()">⬇ Download JSON</button>
      <button class="btn btn-ghost" onclick="App.Modules.Characters.copyJson()">Copy to clipboard</button>
    </div>`;
  }

  /* ── RIGHT PANEL (versions + tokens) ── */
  function renderRightPanel() {
    const c = active();
    const el = document.getElementById('rightPanelContent');
    if (!el) return;

    el.innerHTML = `
      <!-- Token summary -->
      <div class="right-panel-section">
        <div class="right-panel-header">
          <span class="right-panel-title">Tokens</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text4)" id="tokenLimitDisplay">
            / ${Tokens().getLimit().toLocaleString()}
          </span>
        </div>
        <div id="tokenSummaryArea" class="token-summary"></div>
      </div>

      <!-- Versions -->
      <div class="right-panel-section flex-1">
        <div class="right-panel-header">
          <span class="right-panel-title">Versions</span>
          <button class="btn btn-ghost btn-icon btn-xs"
            onclick="App.Modules.Characters.saveVersion()" title="Save snapshot">+</button>
        </div>
        <div class="right-panel-list" id="versionListArea"></div>
        <div class="right-panel-footer">
          <button class="btn btn-ghost btn-sm btn-full" style="color:var(--danger);border-color:var(--danger)"
            onclick="App.Modules.Characters.deleteEntity('${c?.id || ''}')">Delete character</button>
        </div>
      </div>
    `;

    if (c) {
      renderVersionList(c);
      renderTokenSummary(c);
    }
  }

  function renderTokenSummary(c) {
    if (!c) return;
    const d = c.data;
    const FIELDS = [
      { label: 'desc',  text: d.description },
      { label: 'pers',  text: d.personality },
      { label: 'scen',  text: d.scenario },
      { label: 'first', text: d.first_mes },
      { label: 'mes',   text: d.mes_example },
      { label: 'sys',   text: d.system_prompt },
      { label: 'phi',   text: d.post_history_instructions },
    ];
    const limit = Tokens().getLimit();
    const { rows, total } = Tokens().summarise(FIELDS);
    const pct = limit > 0 ? Math.min(total / limit, 1) : 0;
    const barCls = pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : '';

    const rowsHTML = rows.map(r => `
      <div class="token-row">
        <span class="token-row-label">${r.label}</span>
        <span class="token-row-val ${r.count / limit >= 0.8 ? (r.count / limit >= 1 ? 'over' : 'warn') : ''}">
          ${r.count.toLocaleString()}
        </span>
      </div>`).join('');

    const el = document.getElementById('tokenSummaryArea');
    if (!el) return;
    el.innerHTML = `
      ${rowsHTML}
      <div style="margin-top:8px;padding-top:7px;border-top:1px solid var(--border)">
        <div class="token-row">
          <span class="token-row-label" style="color:var(--text2);font-weight:500;">total</span>
          <span class="token-row-val ${barCls}" style="font-size:12px;font-weight:500;">${total.toLocaleString()}</span>
        </div>
        <div class="token-bar-wrap" style="margin-top:5px;">
          <div class="token-bar ${barCls}" style="width:${(pct * 100).toFixed(1)}%"></div>
        </div>
      </div>`;
  }

  /* ── VERSION LIST ── */
  function renderVersionList(c) {
    const el = document.getElementById('versionListArea');
    if (!el) return;
    const vers = c?._jai?.versions || [];
    if (!vers.length) {
      el.innerHTML = `<div class="empty-state" style="padding:16px 8px;">
        <div class="empty-text">No saved versions yet.<br>Click + to snapshot.</div>
      </div>`;
      return;
    }
    el.innerHTML = [...vers].reverse().map(v => `
      <div class="version-item">
        <div class="version-name">${UI().esc(v.name)}</div>
        <div class="version-date">${UI().fmtDateShort(v.ts)}</div>
        <div class="version-actions-row">
          <button class="btn btn-ghost btn-xs" style="flex:1"
            onclick="App.Modules.Characters.restoreVersion('${v.id}')">Restore</button>
          <button class="btn btn-ghost btn-xs"
            onclick="App.Modules.Characters.showDiff('${v.id}')">Diff</button>
        </div>
      </div>`).join('');
  }

  /* ── FIELD CHANGE HANDLERS ── */
  function fieldChange(key, val) {
    const c = active(); if (!c) return;
    c.data[key] = val;
    if (key === 'name') renderList();
    updateTokenDisplay(c);
    _markDirty();
  }

  function jaiChange(key, val) {
    const c = active(); if (!c) return;
    c._jai[key] = val;
    _markDirty();
  }

  function handleTagKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim().replace(/,$/, '').trim();
      if (val) addTag(val);
      e.target.value = '';
    }
    if (e.key === 'Backspace' && !e.target.value) {
      const c = active(); if (!c) return;
      c.data.tags.pop(); renderTabContent(); _markDirty();
    }
  }
  function addTag(t) {
    const c = active(); if (!c) return;
    if (!c.data.tags) c.data.tags = [];
    if (!c.data.tags.includes(t)) c.data.tags.push(t);
    renderTabContent(); _markDirty();
    setTimeout(() => document.getElementById('tagInput')?.focus(), 10);
  }
  function removeTag(i) {
    const c = active(); if (!c) return;
    c.data.tags.splice(i, 1);
    renderTabContent(); _markDirty();
  }

  function addGreeting()        { const c = active(); if (!c) return; c.data.alternate_greetings.push(''); renderTabContent(); _markDirty(); }
  function removeGreeting(i)    { const c = active(); if (!c) return; c.data.alternate_greetings.splice(i, 1); renderTabContent(); _markDirty(); }
  function updateGreeting(i, v) { const c = active(); if (!c) return; c.data.alternate_greetings[i] = v; updateBadges(c); _markDirty(); }

  function addLore() {
    const c = active(); if (!c) return;
    if (!c.data.character_book) c.data.character_book = { entries: [] };
    c.data.character_book.entries.push(Factory().blankLoreEntry(c.data.character_book.entries.length));
    renderTabContent(); _markDirty();
  }
  function removeLore(i) { const c = active(); if (!c) return; c.data.character_book.entries.splice(i, 1); renderTabContent(); _markDirty(); }
  function toggleLore(i)  {
    const c = active(); if (!c) return;
    const e = c.data.character_book.entries[i]; e._open = !e._open;
    const el = document.getElementById('lore-' + i);
    if (el) el.classList.toggle('open', e._open);
  }
  function updateLore(i, key, val) { const c = active(); if (!c) return; c.data.character_book.entries[i][key] = val; _markDirty(); }

  /* ── IMAGES ── */
  function handleImgUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const c = active(); if (!c) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = { id: UI().uid(), dataUrl: ev.target.result, label: '', prompt: '', negPrompt: '' };
      if (!c._jai.images) c._jai.images = [];
      c._jai.images.push(img);
      if (!c._jai.activeImageId) c._jai.activeImageId = img.id;
      renderTabContent(); renderList();
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  }

  function openImgModal(i) {
    const c = active(); if (!c) return;
    editingImgIdx = i;
    const img = c._jai.images[i];
    document.getElementById('imgModalTitle').textContent = `Image ${i + 1} — ${img.label || 'Untitled'}`;
    document.getElementById('imgModalPreview').src = img.dataUrl;
    document.getElementById('imgModalLabel').value  = img.label   || '';
    document.getElementById('imgModalPrompt').value = img.prompt  || '';
    document.getElementById('imgModalNeg').value    = img.negPrompt || '';
    UI().openModal('imgModal');
  }
  function closeImgModal() { UI().closeModal('imgModal'); editingImgIdx = null; }
  function saveImgModal() {
    const c = active(); if (!c || editingImgIdx === null) return;
    const img = c._jai.images[editingImgIdx];
    img.label    = document.getElementById('imgModalLabel').value;
    img.prompt   = document.getElementById('imgModalPrompt').value;
    img.negPrompt= document.getElementById('imgModalNeg').value;
    c._jai.activeImageId = img.id;
    closeImgModal(); renderTabContent(); renderList();
    _markDirty();
  }
  async function deleteCurrentImg() {
    const c = active(); if (!c || editingImgIdx === null) return;
    const ok = await UI().confirm('Delete this image?', 'Delete');
    if (!ok) return;
    const img = c._jai.images[editingImgIdx];
    c._jai.images.splice(editingImgIdx, 1);
    if (c._jai.activeImageId === img.id) c._jai.activeImageId = c._jai.images[0]?.id || null;
    closeImgModal(); renderTabContent(); renderList();
    _markDirty();
  }

  /* ── SAVE / EXPORT ── */
  async function saveCard() {
    const c = active(); if (!c) return;
    await persist(c);
    _dirty = false;
    const dot = document.getElementById('dirtyIndicator');
    if (dot) dot.style.display = 'none';
    renderList(); App.updateStats();
    UI().toast('Saved', 'success');
  }
  function exportCard() {
    const c = active(); if (!c) return;
    UI().downloadJSON(Factory().buildExportJson(c), UI().safeFilename(c.data.name) + '_card.json');
    UI().toast('JSON exported');
  }
  function copyJson() {
    const c = active(); if (!c) return;
    navigator.clipboard.writeText(JSON.stringify(Factory().buildExportJson(c), null, 2));
    UI().toast('Copied to clipboard', 'success');
  }

  /* ── IMPORT ── */
  async function handleImport(file) {
    try {
      let json;
      if (file.type === 'image/png' || file.name.endsWith('.png')) {
        json = await Factory().parsePNGCard(file);
      } else {
        const text = await UI().readFile(file);
        json = JSON.parse(text);
      }
      const card = Factory().normaliseCard(json);
      if (!card) { UI().toast('Unrecognised character format', 'error'); return; }
      cards.unshift(card);
      await persist(card);
      selectEntity(card.id);
      updateCount();
      UI().toast(`"${card.data.name}" imported`, 'success');
    } catch (e) {
      UI().toast('Import failed: ' + e.message, 'error');
    }
  }

  /* ── VERSIONS ── */
  async function saveVersion() {
    const name = await UI().prompt('Version name', 'e.g. First draft, After edits, v2.1…', '');
    const c    = active(); if (!c) return;
    const label = (name || `v${(c._jai.versions.length + 1)}`).trim();
    const snap  = JSON.parse(JSON.stringify({ data: c.data, _jai_bio: c._jai.bio }));
    c._jai.versions.push({ id: UI().uid(), name: label, ts: Date.now(), snapshot: snap });
    await persist(c);
    renderVersionList(c);
    UI().toast(`Version "${label}" saved`, 'success');
  }

  async function restoreVersion(vid) {
    const c = active(); if (!c) return;
    const v = c._jai.versions.find(x => x.id === vid); if (!v) return;
    const ok = await UI().confirm(`Restore "${v.name}"? Unsaved changes will be lost.`, 'Restore');
    if (!ok) return;
    c.data    = JSON.parse(JSON.stringify(v.snapshot.data));
    c._jai.bio = v.snapshot._jai_bio || '';
    await persist(c);
    renderEditor();
    renderList();
    if (_bioUpdater && activeTab === 'bio') _bioUpdater(c._jai.bio);
    UI().toast(`Restored "${v.name}"`, 'success');
  }

  function showDiff(vid) {
    const c = active(); if (!c) return;
    const v = c._jai.versions.find(x => x.id === vid); if (!v) return;
    // Compare version snapshot vs current state
    const currentSnap = { data: c.data, _jai_bio: c._jai.bio };
    const blocks = Diff().compareSnapshots(v.snapshot, currentSnap);
    const html   = Diff().renderDiffModal(v, { name: 'Current' }, blocks);
    document.getElementById('diffModalContent').innerHTML = html;
    document.getElementById('diffModalTitle').textContent = `Diff: ${v.name} → Current`;
    UI().openModal('diffModal');
  }

  window.App = window.App || {};
  window.App.Modules = window.App.Modules || {};
  window.App.Modules.Characters = {
    loadAll, renderList, renderEditor, renderRightPanel,
    newEntity, selectEntity, deleteEntity,
    switchTab,
    fieldChange, jaiChange,
    handleTagKey, addTag, removeTag,
    addGreeting, removeGreeting, updateGreeting,
    addLore, removeLore, toggleLore, updateLore,
    handleImgUpload, openImgModal, closeImgModal, saveImgModal, deleteCurrentImg,
    saveCard, exportCard, copyJson, handleImport,
    saveVersion, restoreVersion, showDiff,
    getCards: () => cards,
    getActiveId: () => activeId,
    isDirty: () => _dirty,
  };
})();
