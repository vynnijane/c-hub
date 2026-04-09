/* ── OVERVIEW.JS — Gallery/List overview pages ──────────────────────────────
 * Provides thumbnail grid + toolbar + folders + sorting + tag filter
 * for Characters, Lorebooks, and Personas modules.
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* ── Per-module view state ── */
  const _state = {
    characters: { search: '', sort: 'updated-desc', tags: [], folderId: null, folderName: '', batch: false, selected: new Set() },
    lorebooks:  { search: '', sort: 'updated-desc', tags: [], folderId: null, folderName: '', batch: false, selected: new Set() },
    personas:   { search: '', sort: 'updated-desc', tags: [], folderId: null, folderName: '', batch: false, selected: new Set() },
  };

  /* ── Folder storage (localStorage) ── */
  function _foldersKey(type) { return `jhub_folders_${type}`; }

  function getFolders(type) {
    try { return JSON.parse(localStorage.getItem(_foldersKey(type))) || []; }
    catch { return []; }
  }

  function saveFolders(type, folders) {
    localStorage.setItem(_foldersKey(type), JSON.stringify(folders));
  }

  /* ── Item accessors ── */
  function _getTags(item, type) {
    if (type === 'characters') return item.data?.tags || [];
    return item.tags || [];
  }

  function _getFolderId(item, type) {
    if (type === 'characters') return item._jai?.folderId || null;
    return item.folderId || null;
  }

  function _getThumb(item) {
    const img = item._jai?.images?.find(i => i.id === item._jai?.activeImageId)
             || item._jai?.images?.[0];
    return img?.dataUrl || null;
  }

  function _getName(item, type) {
    if (type === 'characters') return item.data?.name || 'Unnamed';
    return item.name || 'Unnamed';
  }

  function _getIcon(type) {
    if (type === 'characters') return '🎭';
    if (type === 'lorebooks')  return '📚';
    if (type === 'personas')   return '👤';
    return '📄';
  }

  function _getModKey(type) {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  function _getDbStore(type) {
    return type === 'characters' ? 'cards' : type;
  }

  function _getItems(type) {
    if (type === 'characters') return App.Modules.Characters.getCards();
    if (type === 'lorebooks')  return App.Modules.Lorebooks.getLorebooks();
    if (type === 'personas')   return App.Modules.Personas.getPersonas();
    return [];
  }

  function _allTags(items, type) {
    const set = new Set();
    items.forEach(item => _getTags(item, type).forEach(t => set.add(t)));
    return [...set].sort();
  }

  /* ── Filter + sort ── */
  function _filter(items, state, type) {
    let result = items.filter(i => _getFolderId(i, type) === state.folderId);
    if (state.search) {
      const q = state.search.toLowerCase();
      result = result.filter(i => _getName(i, type).toLowerCase().includes(q));
    }
    if (state.tags.length > 0) {
      result = result.filter(i => {
        const itemTags = _getTags(i, type);
        return state.tags.every(t => itemTags.includes(t));
      });
    }
    return result;
  }

  function _sort(items, sortBy, type) {
    const arr = [...items];
    switch (sortBy) {
      case 'name-asc':     return arr.sort((a, b) => _getName(a, type).localeCompare(_getName(b, type)));
      case 'name-desc':    return arr.sort((a, b) => _getName(b, type).localeCompare(_getName(a, type)));
      case 'created-asc':  return arr.sort((a, b) => a.createdAt - b.createdAt);
      case 'created-desc': return arr.sort((a, b) => b.createdAt - a.createdAt);
      case 'updated-asc':  return arr.sort((a, b) => a.updatedAt - b.updatedAt);
      case 'updated-desc': return arr.sort((a, b) => b.updatedAt - a.updatedAt);
      default:             return arr.sort((a, b) => b.updatedAt - a.updatedAt);
    }
  }

  /* ── Main render ── */
  function render(module) {
    const container = document.getElementById('overviewContainer');
    if (!container) return;

    const state    = _state[module];
    const allItems = _getItems(module);
    const folders  = getFolders(module);
    const filtered = _filter(allItems, state, module);
    const sorted   = _sort(filtered, state.sort, module);

    // Only show root-level folders (flat folder system — no sub-folders)
    const visibleFolders = state.folderId ? [] : folders;

    container.innerHTML = `
      <div class="overview-page-inner">
        ${_renderBreadcrumb(module, state)}
        ${_renderToolbar(module, state, allItems)}
        ${_renderBatchBar(module, state)}
        <div class="overview-scroll">
          ${module === 'lorebooks'
            ? _renderListContent(module, state, sorted, visibleFolders)
            : _renderGridContent(module, state, sorted, visibleFolders)}
        </div>
      </div>
    `;
  }

  /* ── Breadcrumb ── */
  function _renderBreadcrumb(module, state) {
    if (!state.folderId) return '';
    const icon  = _getIcon(module);
    const title = _getModKey(module);
    return `
      <div class="overview-breadcrumb">
        <button class="overview-breadcrumb-btn" onclick="App.Overview.exitFolder('${module}')">
          ${icon} ${title}
        </button>
        <span class="overview-breadcrumb-sep">›</span>
        <span class="overview-breadcrumb-current">${App.UI.esc(state.folderName)}</span>
      </div>
    `;
  }

  /* ── Toolbar ── */
  function _renderToolbar(module, state, allItems) {
    const modKey  = _getModKey(module);
    const isChars = module === 'characters';

    const sortOptions = [
      { value: 'updated-desc', label: 'Recently updated' },
      { value: 'updated-asc',  label: 'Least recently updated' },
      { value: 'created-desc', label: 'Newest first' },
      { value: 'created-asc',  label: 'Oldest first' },
      { value: 'name-asc',     label: 'Name A → Z' },
      { value: 'name-desc',    label: 'Name Z → A' },
    ];

    const sortHTML = sortOptions.map(o =>
      `<option value="${o.value}"${state.sort === o.value ? ' selected' : ''}>${o.label}</option>`
    ).join('');

    const selectedTagsHTML = state.tags.map(t => `
      <span class="filter-tag-chip">
        ${App.UI.esc(t)}
        <button class="filter-tag-remove"
          onclick="App.Overview.removeTag('${module}', ${JSON.stringify(t)})">×</button>
      </span>`
    ).join('');

    return `
      <div class="overview-toolbar">
        <div class="overview-toolbar-left">
          <button class="btn btn-ember btn-sm"
            onclick="App.Modules.${modKey}.newEntity()">+ New</button>
          ${isChars
            ? `<button class="btn btn-ghost btn-sm"
                onclick="document.getElementById('globalImportFile').click()">⬆ Import</button>`
            : ''}
          <button class="btn btn-ghost btn-sm${state.batch ? ' btn-active' : ''}"
            onclick="App.Overview.toggleBatch('${module}')">Select</button>
          <button class="btn btn-ghost btn-sm"
            onclick="App.Overview.newFolder('${module}')">📁 New Folder</button>
        </div>
        <div class="overview-toolbar-right">
          <div class="overview-search-wrap">
            <span class="overview-search-icon">🔍</span>
            <input class="overview-search-input" placeholder="Search…"
              value="${App.UI.esc(state.search)}"
              oninput="App.Overview.handleSearch('${module}', this.value)">
          </div>
          <div class="overview-tag-wrap">
            <button class="btn btn-ghost btn-sm"
              onclick="App.Overview.toggleTagDropdown('${module}', this)">
              🏷 Tags${state.tags.length ? ` <span style="color:var(--ember)">(${state.tags.length})</span>` : ''}
            </button>
            ${selectedTagsHTML}
          </div>
          <select class="overview-sort-select"
            onchange="App.Overview.applySort('${module}', this.value)">
            ${sortHTML}
          </select>
        </div>
      </div>
    `;
  }

  /* ── Batch bar ── */
  function _renderBatchBar(module, state) {
    if (!state.batch) return '';
    const n = state.selected.size;
    return `
      <div class="overview-batch-bar">
        <span style="font-size:12.5px;color:var(--text2);">
          ${n} selected
        </span>
        <button class="btn btn-ghost btn-sm"
          onclick="App.Overview.selectAll('${module}')">Select all</button>
        <button class="btn btn-ghost btn-sm"
          onclick="App.Overview.moveFolderPrompt('${module}')">Move to folder</button>
        <button class="btn btn-danger btn-sm"
          ${n === 0 ? 'disabled' : ''}
          onclick="App.Overview.deleteSelected('${module}')">Delete selected</button>
        <button class="btn btn-ghost btn-sm"
          onclick="App.Overview.toggleBatch('${module}')">Cancel</button>
      </div>
    `;
  }

  /* ── Grid view (Characters, Personas) ── */
  function _renderGridContent(module, state, items, folders) {
    const icon   = _getIcon(module);
    const modKey = _getModKey(module);
    const { esc } = App.UI;

    const folderCards = folders.map(f => {
      const folderItems = _getItems(module).filter(i => _getFolderId(i, module) === f.id);
      const count = folderItems.length;
      const thumbs = folderItems.slice(0, 3).map(i => _getThumb(i)).filter(Boolean);
      const mainThumb = thumbs[0] || '';

      const stack2 = `<div class="ov-folder-stack stack-2"${thumbs[1] ? ` style="background-image:url('${thumbs[1]}')"` : ''}></div>`;
      const stack1 = `<div class="ov-folder-stack stack-1"${thumbs[2] ? ` style="background-image:url('${thumbs[2]}')"` : ''}></div>`;

      const safeName = f.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `
        <div class="ov-card ov-folder-card"
             ondblclick="App.Overview.enterFolder('${module}', '${f.id}', '${safeName}')">
          ${stack2}${stack1}
          <div class="ov-card-body"${mainThumb ? ` style="background-image:url('${mainThumb}')"` : ''}>
            <div class="ov-folder-overlay">
              <span class="ov-folder-icon">📁</span>
            </div>
          </div>
          <div class="ov-card-label">
            <span class="ov-card-name">📁 ${esc(f.name)}</span>
            <span class="ov-card-meta">${count} item${count !== 1 ? 's' : ''}</span>
          </div>
          <div class="ov-folder-actions">
            <button class="ov-folder-action-btn"
              onclick="event.stopPropagation(); App.Overview.renameFolder('${module}', '${f.id}')"
              title="Rename">✏</button>
            <button class="ov-folder-action-btn danger"
              onclick="event.stopPropagation(); App.Overview.deleteFolder('${module}', '${f.id}')"
              title="Delete">✕</button>
          </div>
        </div>
      `;
    }).join('');

    if (!items.length && !folders.length) {
      return `<div class="empty-state" style="margin-top:60px;">
        <div class="empty-icon">${icon}</div>
        <div class="empty-text">No ${module} yet.<br>Create one to get started.</div>
      </div>`;
    }

    const itemCards = items.map(item => {
      const name   = _getName(item, module);
      const thumb  = _getThumb(item);
      const isSel  = state.batch && state.selected.has(item.id);
      const nsfw   = module === 'characters' && item._jai?.nsfw
        ? `<span class="ov-card-nsfw">NSFW</span>` : '';
      const active = module === 'personas' && item.isActive
        ? `<span class="ov-card-badge" style="background:var(--ember-glow);color:var(--ember);border-radius:3px;padding:2px 5px;font-size:9px;font-weight:600;">● Active</span>` : '';

      const clickAction = state.batch
        ? `App.Overview.toggleSelect('${module}', '${item.id}')`
        : `App.Modules.${modKey}.selectEntity('${item.id}')`;

      return `
        <div class="ov-card item-card${isSel ? ' selected' : ''}"
             onclick="${clickAction}"
             data-id="${item.id}">
          <div class="ov-card-body">
            ${thumb
              ? `<img class="ov-card-img" src="${thumb}" alt="">`
              : `<div class="ov-card-placeholder">${icon}</div>`}
            ${nsfw}${active}
            ${state.batch ? `
              <div class="ov-select-overlay${isSel ? ' checked' : ''}">
                <div class="ov-checkbox">${isSel ? '✓' : ''}</div>
              </div>` : ''}
          </div>
          <div class="ov-card-label">
            <span class="ov-card-name">${App.UI.esc(name)}</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="ov-grid">
        ${folderCards}
        ${itemCards}
      </div>
    `;
  }

  /* ── List view (Lorebooks) ── */
  function _renderListContent(module, state, items, folders) {
    const { esc, fmtDateShort } = App.UI;

    const folderRows = folders.map(f => {
      const folderItems = _getItems(module).filter(i => _getFolderId(i, module) === f.id);
      const count = folderItems.length;
      const safeName = f.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `
        <div class="ov-list-folder"
             ondblclick="App.Overview.enterFolder('${module}', '${f.id}', '${safeName}')">
          <span class="ov-list-folder-icon">📁</span>
          <span class="ov-list-folder-name">${esc(f.name)}</span>
          <span class="ov-list-folder-count">${count} item${count !== 1 ? 's' : ''}</span>
          <div class="ov-list-folder-actions">
            <button class="ov-folder-action-btn"
              onclick="event.stopPropagation(); App.Overview.renameFolder('${module}', '${f.id}')"
              title="Rename">✏</button>
            <button class="ov-folder-action-btn danger"
              onclick="event.stopPropagation(); App.Overview.deleteFolder('${module}', '${f.id}')"
              title="Delete">✕</button>
          </div>
        </div>
      `;
    }).join('');

    if (!items.length && !folders.length) {
      return `<div class="empty-state" style="margin-top:60px;">
        <div class="empty-icon">📚</div>
        <div class="empty-text">No lorebooks yet.<br>Create one to get started.</div>
      </div>`;
    }

    const itemRows = items.map(item => {
      const name    = _getName(item, module);
      const tags    = _getTags(item, module);
      const isSel   = state.batch && state.selected.has(item.id);
      const count   = item.entries?.length || 0;
      const updated = fmtDateShort(item.updatedAt);

      const tagsHTML = tags.slice(0, 4).map(t =>
        `<span class="ov-inline-tag">${esc(t)}</span>`
      ).join('');

      return `
        <div class="ov-list-item${isSel ? ' selected' : ''}"
             onclick="${state.batch
               ? `App.Overview.toggleSelect('${module}', '${item.id}')`
               : `App.Modules.Lorebooks.selectEntity('${item.id}')`}"
             data-id="${item.id}">
          ${state.batch
            ? `<div class="ov-list-checkbox${isSel ? ' checked' : ''}">${isSel ? '✓' : ''}</div>`
            : ''}
          <div class="ov-list-item-icon">📚</div>
          <div class="ov-list-item-body">
            <div class="ov-list-item-name">${esc(name)}</div>
            <div class="ov-list-item-meta">
              ${count} entr${count !== 1 ? 'ies' : 'y'}
              <span style="color:var(--text4)">·</span>
              ${updated}
              ${tagsHTML}
            </div>
          </div>
          <button class="ov-list-delete"
            onclick="event.stopPropagation(); App.Modules.Lorebooks.deleteEntity('${item.id}')">✕</button>
        </div>
      `;
    }).join('');

    return `
      <div class="ov-list">
        ${folderRows}
        ${itemRows}
      </div>
    `;
  }

  /* ── Public actions ── */

  function handleSearch(module, val) {
    _state[module].search = val;
    render(module);
  }

  function applySort(module, val) {
    _state[module].sort = val;
    render(module);
  }

  function addTag(module, tag) {
    const s = _state[module];
    if (!s.tags.includes(tag)) s.tags.push(tag);
    render(module);
  }

  function removeTag(module, tag) {
    _state[module].tags = _state[module].tags.filter(t => t !== tag);
    render(module);
  }

  function toggleTagDropdown(module, btn) {
    // Close any existing dropdown
    document.querySelectorAll('.overview-tag-dropdown').forEach(el => el.remove());

    const allItems = _getItems(module);
    const allTags  = _allTags(allItems, module);
    const avail    = allTags.filter(t => !_state[module].tags.includes(t));

    if (!avail.length) {
      App.UI.toast('No more tags to filter. Add tags in the character editor.', 'info');
      return;
    }

    const dropdown = document.createElement('div');
    dropdown.className = 'overview-tag-dropdown';
    dropdown.innerHTML = avail.map(t =>
      `<div class="overview-tag-item"
        onclick="App.Overview.addTag('${module}', ${JSON.stringify(t)}); document.querySelectorAll('.overview-tag-dropdown').forEach(e=>e.remove());">
        ${App.UI.esc(t)}
      </div>`
    ).join('');

    const rect = btn.getBoundingClientRect();
    dropdown.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;z-index:300;`;
    document.body.appendChild(dropdown);

    const close = e => {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.remove();
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 50);
  }

  function enterFolder(module, folderId, folderName) {
    const s = _state[module];
    s.folderId   = folderId;
    s.folderName = folderName;
    render(module);
  }

  function exitFolder(module) {
    const s = _state[module];
    s.folderId   = null;
    s.folderName = '';
    render(module);
  }

  function toggleBatch(module) {
    const s = _state[module];
    s.batch = !s.batch;
    s.selected.clear();
    render(module);
  }

  function toggleSelect(module, id) {
    const s = _state[module];
    if (s.selected.has(id)) s.selected.delete(id);
    else s.selected.add(id);
    render(module);
  }

  function selectAll(module) {
    const s     = _state[module];
    const items = _filter(_getItems(module), s, module);
    items.forEach(i => s.selected.add(i.id));
    render(module);
  }

  async function deleteSelected(module) {
    const s = _state[module];
    if (!s.selected.size) return;
    const ok = await App.UI.confirm(
      `Delete ${s.selected.size} selected item${s.selected.size !== 1 ? 's' : ''}? This cannot be undone.`,
      'Delete'
    );
    if (!ok) return;

    const store = _getDbStore(module);
    for (const id of s.selected) {
      await App.DB.del(store, id);
    }
    s.selected.clear();
    s.batch = false;

    await App.Modules[_getModKey(module)].loadAll();
    render(module);
    App.updateStats();
    App.UI.toast('Deleted', 'success');
  }

  async function moveFolderPrompt(module) {
    const s = _state[module];
    if (!s.selected.size) return;
    const folders = getFolders(module);
    if (!folders.length) {
      App.UI.toast('No folders exist. Create one first.', 'info');
      return;
    }
    const folderList = folders.map(f => `• ${f.name}`).join('\n');
    const chosen = await App.UI.prompt(
      `Move to folder:\n\n${folderList}\n\nType folder name or leave blank for root:`,
      ''
    );
    if (chosen === null) return;

    let targetId = null;
    const trimmed = chosen.trim();
    if (trimmed !== '' && trimmed.toLowerCase() !== 'root') {
      const target = folders.find(f => f.name.toLowerCase() === trimmed.toLowerCase());
      if (!target) { App.UI.toast('Folder not found', 'error'); return; }
      targetId = target.id;
    }

    await _moveItems(module, [...s.selected], targetId);
    s.selected.clear();
    s.batch = false;
    render(module);
  }

  async function _moveItems(module, ids, folderId) {
    const store = _getDbStore(module);
    const items = _getItems(module);
    for (const id of ids) {
      const item = items.find(i => i.id === id);
      if (!item) continue;
      if (module === 'characters') item._jai.folderId = folderId;
      else item.folderId = folderId;
      item.updatedAt = Date.now();
      await App.DB.put(store, item);
    }
    await App.Modules[_getModKey(module)].loadAll();
    App.UI.toast('Moved', 'success');
  }

  async function newFolder(module) {
    const name = await App.UI.prompt('Folder name:');
    if (!name || !name.trim()) return;
    const folders = getFolders(module);
    const folder  = { id: App.UI.uid(), name: name.trim(), createdAt: Date.now() };
    folders.push(folder);
    saveFolders(module, folders);
    render(module);
    App.UI.toast(`Folder "${folder.name}" created`, 'success');
  }

  async function renameFolder(module, folderId) {
    const folders = getFolders(module);
    const folder  = folders.find(f => f.id === folderId);
    if (!folder) return;
    const name = await App.UI.prompt('Rename folder:', folder.name);
    if (!name || !name.trim() || name.trim() === folder.name) return;
    folder.name = name.trim();
    saveFolders(module, folders);
    render(module);
  }

  async function deleteFolder(module, folderId) {
    const folders = getFolders(module);
    const folder  = folders.find(f => f.id === folderId);
    if (!folder) return;
    const ok = await App.UI.confirm(
      `Delete folder "${folder.name}"? Items inside will be moved to root.`,
      'Delete Folder'
    );
    if (!ok) return;

    // Move items to root
    const store = _getDbStore(module);
    const items = _getItems(module);
    for (const item of items) {
      if (_getFolderId(item, module) === folderId) {
        if (module === 'characters') item._jai.folderId = null;
        else item.folderId = null;
        item.updatedAt = Date.now();
        await App.DB.put(store, item);
      }
    }

    saveFolders(module, folders.filter(f => f.id !== folderId));
    await App.Modules[_getModKey(module)].loadAll();
    render(module);
    App.UI.toast('Folder deleted', 'success');
  }

  /* ── Expose ── */
  window.App = window.App || {};
  window.App.Overview = {
    render,
    handleSearch,
    applySort,
    addTag,
    removeTag,
    toggleTagDropdown,
    enterFolder,
    exitFolder,
    toggleBatch,
    toggleSelect,
    selectAll,
    deleteSelected,
    moveFolderPrompt,
    newFolder,
    renameFolder,
    deleteFolder,
  };

})();
