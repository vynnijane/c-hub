/* ── APP.JS — Main Orchestrator ────────────────────────────────────────────
 * Init, routing, keyboard shortcuts, drag-and-drop, search overlay,
 * workspace export/import, settings modal.
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const MODULES = ['characters', 'lorebooks', 'personas', 'presets', 'notes'];
  let _activeModule = null;

  /* ── Bootstrap ── */
  async function init() {
    try {
      await App.DB.init();
    } catch (e) {
      console.error('[app] DB init failed:', e);
      App.UI.toast('Database error: ' + e.message, 'error');
      return;
    }

    // Initialise tokenizer in background (non-blocking)
    App.Tokens.init().then(() => {
      // Re-render token displays once ready
      const active = _activeModule;
      if (active === 'characters') {
        const c = App.Modules.Characters.getCards().find(
          card => card.id === App.Modules.Characters.getActiveId()
        );
        if (c) App.Modules.Characters.renderEditor();
      }
    });

    // Initialise Google Drive (if client ID is set)
    App.Sync.init();

    // Load all modules
    await Promise.all(MODULES.map(m => {
      const key = m.charAt(0).toUpperCase() + m.slice(1);
      return App.Modules[key].loadAll();
    }));

    // Open Characters section by default
    const charHeader = document.querySelector('#section-characters .mod-section-header');
    if (charHeader) toggleSection('characters', true);

    // Set up drag-and-drop for card import
    _setupDragDrop();

    // Keyboard shortcuts
    document.addEventListener('keydown', _handleKeydown);

    // Warn before unload if there are unsaved changes
    window.addEventListener('beforeunload', e => {
      const dirty = App.Modules.Characters.isDirty()
        || App.Modules.Lorebooks.isDirty?.()
        || App.Modules.Personas.isDirty?.()
        || App.Modules.Presets.isDirty?.()
        || App.Modules.Notes.isDirty?.();
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    // Update stats
    updateStats();

    // Listen for tokenizer updates — refresh if editor is open
    document.addEventListener('tokenizerUpdated', () => {
      if (_activeModule === 'characters') {
        App.Modules.Characters.renderEditor();
      }
    });
  }

  /* ── Overview modules: clicking header opens gallery ── */
  const OVERVIEW_MODULES = ['characters', 'lorebooks', 'personas'];

  /* ── Module section toggle (accordion) ── */
  function toggleSection(module, forceOpen) {
    const section = document.getElementById('section-' + module);
    if (!section) return;
    const header = section.querySelector('.mod-section-header');
    const isOpen = header.classList.contains('open');
    const open   = forceOpen !== undefined ? forceOpen : !isOpen;
    header.classList.toggle('open', open);

    // For overview modules, navigating to the section also opens the overview page
    if (open && OVERVIEW_MODULES.includes(module)) {
      openOverview(module);
    }
  }

  /* ── Open overview page for a module ── */
  function openOverview(module) {
    _activeModule = module;
    document.getElementById('page-welcome').classList.remove('active');
    document.getElementById('page-editor').classList.remove('active');
    document.getElementById('page-search').classList.remove('active');
    document.getElementById('page-overview').classList.add('active');
    toggleSection(module, true);
    updateHeaderLabel(module);
    App.Overview.render(module);
  }

  /* ── Open editor for a module ── */
  function openEditor(module) {
    _activeModule = module;
    document.getElementById('page-welcome').classList.remove('active');
    document.getElementById('page-editor').classList.add('active');
    document.getElementById('page-overview').classList.remove('active');
    document.getElementById('page-search').classList.remove('active');
    // Ensure the sidebar section is expanded
    toggleSection(module, true);
    updateHeaderLabel(module);

    // Breadcrumb back-navigation for overview modules
    const breadcrumb = document.getElementById('editorBreadcrumb');
    if (breadcrumb) {
      if (OVERVIEW_MODULES.includes(module)) {
        const icon  = { characters: '🎭', lorebooks: '📚', personas: '👤' }[module] || '';
        const label = module.charAt(0).toUpperCase() + module.slice(1);
        breadcrumb.innerHTML = `
          <button class="editor-breadcrumb-back"
            onclick="App.openOverview('${module}')">
            ← ${icon} ${label}
          </button>
        `;
        breadcrumb.classList.remove('hidden');
      } else {
        breadcrumb.innerHTML = '';
        breadcrumb.classList.add('hidden');
      }
    }
  }

  /* ── Show welcome screen ── */
  function showWelcome() {
    _activeModule = null;
    document.getElementById('page-welcome').classList.add('active');
    document.getElementById('page-editor').classList.remove('active');
    document.getElementById('page-overview').classList.remove('active');
    document.getElementById('page-search').classList.remove('active');
    document.getElementById('rightPanelContent').innerHTML = '';
    document.getElementById('headerWorkspaceLabel').textContent = 'JAI Creator Studio';
  }

  function updateHeaderLabel(module) {
    const labels = {
      characters: 'Character Cards',
      lorebooks:  'Lorebooks',
      personas:   'Personas',
      presets:    'Presets',
      notes:      'Notes',
    };
    const el = document.getElementById('headerWorkspaceLabel');
    if (el) el.textContent = labels[module] || '';
  }

  /* ── Stats bar ── */
  async function updateStats() {
    const counts = await Promise.all(MODULES.map(m => App.DB.getAll(m)));
    const [cards, lorebooks, personas, presets, notes] = counts;
    const activeCard = cards.find(c => c.id === App.Modules.Characters.getActiveId());
    App.UI.updateStats({
      cards:     cards.length,
      lorebooks: lorebooks.length,
      personas:  personas.length,
      presets:   presets.length,
      notes:     notes.length,
      active:    activeCard?.data?.name || '—',
    });
  }

  /* ── Keyboard shortcuts ── */
  function _handleKeydown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === 's') {
      e.preventDefault();
      if (_activeModule === 'characters') App.Modules.Characters.saveCard();
      else if (_activeModule === 'lorebooks') App.Modules.Lorebooks.saveLorebook();
      else if (_activeModule === 'personas')  App.Modules.Personas.savePersona();
      else if (_activeModule === 'presets')   App.Modules.Presets.savePreset();
      else if (_activeModule === 'notes')     App.Modules.Notes.saveNote();
    }
    if (e.key === 'n') {
      e.preventDefault();
      if (_activeModule === 'characters') App.Modules.Characters.newEntity();
    }
    if (e.key === 'f') {
      e.preventDefault();
      openSearch();
    }
  }

  /* ── Drag & drop file import ── */
  function _setupDragDrop() {
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', async e => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || (!file.name.endsWith('.json') && !file.name.endsWith('.png'))) return;
      await App.Modules.Characters.handleImport(file);
    });
  }

  /* ── Global search overlay ── */
  function openSearch() {
    App.UI.openModal('searchOverlay');
    setTimeout(() => document.getElementById('searchInput')?.focus(), 60);
  }
  function closeSearch() { App.UI.closeModal('searchOverlay'); }

  let _searchDebounce;
  async function handleSearchInput(val) {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(async () => {
      const results = await App.Search.searchAll(val);
      renderSearchResults(results, val);
    }, 220);
  }

  function renderSearchResults(results, query) {
    const el = document.getElementById('searchResultsList');
    if (!el) return;
    if (!query || query.length < 2) {
      el.innerHTML = `<div class="empty-state"><div class="empty-text">Type to search across all modules…</div></div>`;
      return;
    }
    if (!results.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-text">No results for "${App.UI.esc(query)}"</div></div>`;
      return;
    }
    el.innerHTML = results.map(r => `
      <div class="search-result-item" onclick="App.navigateToResult('${r.store}', '${r.id}')">
        <div class="search-result-module">${r.icon} ${App.UI.esc(r.module)}</div>
        <div class="search-result-title">${App.UI.esc(r.title)}</div>
        <div class="search-result-snippet"><em>${App.UI.esc(r.field)}</em>: ${r.snippet}</div>
      </div>`).join('');
  }

  function navigateToResult(store, id) {
    closeSearch();
    const MODULE_MAP = {
      cards:      'Characters',
      lorebooks:  'Lorebooks',
      personas:   'Personas',
      presets:    'Presets',
      notes:      'Notes',
    };
    const key = MODULE_MAP[store];
    if (key) App.Modules[key].selectEntity(id);
  }

  /* ── Find & Replace ── */
  async function handleReplaceAll() {
    const find = document.getElementById('replaceFind')?.value || '';
    const repl = document.getElementById('replaceWith')?.value || '';
    if (!find) { App.UI.toast('Enter a search term', 'error'); return; }
    const ok = await App.UI.confirm(
      `Replace all occurrences of "${find}" with "${repl}" across all modules? This cannot be undone.`,
      'Replace All'
    );
    if (!ok) return;
    const count = await App.Search.replaceAll(find, repl);
    // Reload all modules to reflect changes
    await Promise.all(MODULES.map(m => {
      const key = m.charAt(0).toUpperCase() + m.slice(1);
      return App.Modules[key].loadAll();
    }));
    if (_activeModule) {
      const key = _activeModule.charAt(0).toUpperCase() + _activeModule.slice(1);
      App.Modules[key].renderEditor?.();
    }
    App.UI.toast(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}`, 'success');
    App.UI.closeModal('replaceModal');
  }

  /* ── Workspace Export / Import ── */
  async function exportWorkspace() {
    try {
      const data = await App.Factory.exportWorkspace();
      App.UI.downloadJSON(data, 'jai-creator-studio-workspace.json');
      App.UI.toast('Workspace exported', 'success');
    } catch (e) {
      App.UI.toast('Export failed: ' + e.message, 'error');
    }
  }

  async function importWorkspace() {
    const ok = await App.UI.confirm(
      'Import a workspace? This will REPLACE all existing data (characters, lorebooks, etc.).',
      'Import & Replace', 'Cancel'
    );
    if (!ok) return;
    const input = document.getElementById('workspaceImportFile');
    input.click();
  }

  async function handleWorkspaceImport(e) {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = '';
    try {
      const text = await App.UI.readFile(file);
      const data = JSON.parse(text);
      await App.Factory.importWorkspace(data);
      // Reload all modules
      await Promise.all(MODULES.map(m => {
        const key = m.charAt(0).toUpperCase() + m.slice(1);
        return App.Modules[key].loadAll();
      }));
      showWelcome();
      updateStats();
      App.UI.toast('Workspace imported', 'success');
    } catch (err) {
      App.UI.toast('Import failed: ' + err.message, 'error');
    }
  }

  /* ── Google Drive ── */
  async function saveToGoogleDrive() { await App.Sync.saveToGoogleDrive(); }
  async function loadFromGoogleDrive() {
    const result = await App.Sync.loadFromGoogleDrive();
    if (!result) return;
    const ok = await App.UI.confirm(
      `Load workspace from Google Drive (saved ${App.UI.fmtDate(new Date(result.modifiedTime).getTime())})?\nThis will REPLACE all existing data.`,
      'Load & Replace'
    );
    if (!ok) return;
    try {
      await App.Factory.importWorkspace(result.data);
      await Promise.all(MODULES.map(m => {
        const key = m.charAt(0).toUpperCase() + m.slice(1);
        return App.Modules[key].loadAll();
      }));
      showWelcome(); updateStats();
      App.UI.toast('Workspace loaded from Google Drive', 'success');
    } catch (err) {
      App.UI.toast('Load failed: ' + err.message, 'error');
    }
  }

  /* ── Settings modal ── */
  function openSettings() {
    const clientId = App.Sync.getClientId();
    document.getElementById('settingsClientId').value = clientId;
    const limit = App.Tokens.getLimit();
    document.getElementById('settingsTokenLimit').value = limit;
    App.UI.openModal('settingsModal');
  }
  function saveSettings() {
    const clientId = document.getElementById('settingsClientId').value.trim();
    const limit    = parseInt(document.getElementById('settingsTokenLimit').value, 10) || 4096;
    App.Sync.setClientId(clientId);
    App.Tokens.setLimit(limit);
    if (clientId) App.Sync.init();
    App.UI.closeModal('settingsModal');
    App.UI.toast('Settings saved', 'success');
    // Re-render token display if active
    if (_activeModule === 'characters') App.Modules.Characters.renderEditor();
  }

  /* ── Expose to global ── */
  window.App = window.App || {};
  Object.assign(window.App, {
    init,
    toggleSection,
    openOverview,
    openEditor,
    showWelcome,
    updateStats,
    openSearch,
    closeSearch,
    handleSearchInput,
    navigateToResult,
    handleReplaceAll,
    exportWorkspace,
    importWorkspace,
    handleWorkspaceImport,
    saveToGoogleDrive,
    loadFromGoogleDrive,
    openSettings,
    saveSettings,
  });

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
