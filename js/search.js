/* ── GLOBAL SEARCH ─────────────────────────────────────────────────────────
 * Search across all modules. Find & Replace with preview.
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const MODULE_CONFIG = {
    cards: {
      label:  'Characters',
      icon:   '🎭',
      fields: [
        { key: 'data.name',                      label: 'Name' },
        { key: 'data.description',               label: 'Description' },
        { key: 'data.personality',               label: 'Personality' },
        { key: 'data.scenario',                  label: 'Scenario' },
        { key: 'data.first_mes',                 label: 'First Message' },
        { key: 'data.mes_example',               label: 'Example Dialogue' },
        { key: 'data.system_prompt',             label: 'System Prompt' },
        { key: 'data.post_history_instructions', label: 'Post-History Instructions' },
        { key: 'data.creator_notes',             label: 'Creator Notes' },
        { key: '_jai.bio',                       label: 'Bio' },
      ],
      getTitle: e => e.data?.name || 'Untitled',
    },
    lorebooks: {
      label:  'Lorebooks',
      icon:   '📚',
      fields: [
        { key: 'name',        label: 'Name' },
        { key: 'description', label: 'Description' },
      ],
      getTitle: e => e.name || 'Untitled',
      // Entries are searched separately
    },
    personas: {
      label:  'Personas',
      icon:   '👤',
      fields: [
        { key: 'name',        label: 'Name' },
        { key: 'description', label: 'Description' },
        { key: 'personality', label: 'Personality' },
        { key: 'appearance',  label: 'Appearance' },
        { key: 'backstory',   label: 'Backstory' },
      ],
      getTitle: e => e.name || 'Untitled',
    },
    presets: {
      label:  'Presets',
      icon:   '📋',
      fields: [
        { key: 'name',                   label: 'Name' },
        { key: 'systemPrompt',           label: 'System Prompt' },
        { key: 'postHistoryInstructions',label: 'Post-History Instructions' },
        { key: 'notes',                  label: 'Notes' },
      ],
      getTitle: e => e.name || 'Untitled',
    },
    notes: {
      label:  'Notes',
      icon:   '📝',
      fields: [
        { key: 'title', label: 'Title' },
      ],
      getTitle: e => e.title || 'Untitled',
    },
  };

  /* Get a nested value by dot-path key */
  function _getVal(obj, path) {
    return path.split('.').reduce((o, k) => (o != null ? o[k] : undefined), obj);
  }

  /* Set a nested value by dot-path key */
  function _setVal(obj, path, val) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (cur[keys[i]] == null) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = val;
  }

  /* Highlight query in a snippet */
  function _highlight(text, query) {
    const esc = window.App.UI.esc;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return esc(text.slice(0, 80));
    const before = text.slice(Math.max(0, idx - 30), idx);
    const match  = text.slice(idx, idx + query.length);
    const after  = text.slice(idx + query.length, idx + query.length + 50);
    return (before ? '…' + esc(before) : '') +
      `<mark>${esc(match)}</mark>` +
      (after ? esc(after) + '…' : '');
  }

  /* Search all stores for a query string */
  async function searchAll(query) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const results = [];

    for (const [store, config] of Object.entries(MODULE_CONFIG)) {
      const items = await App.DB.getAll(store);
      for (const item of items) {
        for (const field of config.fields) {
          const val = String(_getVal(item, field.key) || '');
          if (val.toLowerCase().includes(q)) {
            results.push({
              store,
              id:      item.id,
              title:   config.getTitle(item),
              module:  config.label,
              icon:    config.icon,
              field:   field.label,
              snippet: _highlight(val, query),
            });
            break; // one result per item
          }
        }

        // Also search lorebook entries
        if (store === 'lorebooks' && Array.isArray(item.entries)) {
          for (const entry of item.entries) {
            const content = (entry.content || '') + ' ' + (entry.keys || []).join(' ');
            if (content.toLowerCase().includes(q)) {
              results.push({
                store,
                id:      item.id,
                title:   config.getTitle(item),
                module:  'Lorebooks › Entry',
                icon:    '📖',
                field:   'Entry',
                snippet: _highlight(content, query),
              });
              break;
            }
          }
        }

        // Also search note custom fields
        if (store === 'notes' && Array.isArray(item.fields)) {
          for (const f of item.fields) {
            if ((f.value || '').toLowerCase().includes(q)) {
              results.push({
                store,
                id:      item.id,
                title:   item.title || 'Untitled',
                module:  'Notes',
                icon:    '📝',
                field:   f.key || 'Field',
                snippet: _highlight(f.value, query),
              });
              break;
            }
          }
        }
      }
    }

    return results;
  }

  /* Find & Replace across all stores.
   * Returns count of replacements made. */
  async function replaceAll(find, replacement) {
    if (!find) return 0;
    let count = 0;
    const findLower = find.toLowerCase();

    for (const [store, config] of Object.entries(MODULE_CONFIG)) {
      const items = await App.DB.getAll(store);
      for (const item of items) {
        let changed = false;

        for (const field of config.fields) {
          const val = String(_getVal(item, field.key) || '');
          if (val.toLowerCase().includes(findLower)) {
            const newVal = val.replace(new RegExp(escapeRegex(find), 'gi'), replacement);
            _setVal(item, field.key, newVal);
            count += (val.match(new RegExp(escapeRegex(find), 'gi')) || []).length;
            changed = true;
          }
        }

        // Lorebook entries
        if (store === 'lorebooks' && Array.isArray(item.entries)) {
          item.entries.forEach(e => {
            if ((e.content || '').toLowerCase().includes(findLower)) {
              count += (e.content.match(new RegExp(escapeRegex(find), 'gi')) || []).length;
              e.content = e.content.replace(new RegExp(escapeRegex(find), 'gi'), replacement);
              changed = true;
            }
          });
        }

        // Note fields
        if (store === 'notes' && Array.isArray(item.fields)) {
          item.fields.forEach(f => {
            if ((f.value || '').toLowerCase().includes(findLower)) {
              count += (f.value.match(new RegExp(escapeRegex(find), 'gi')) || []).length;
              f.value = f.value.replace(new RegExp(escapeRegex(find), 'gi'), replacement);
              changed = true;
            }
          });
        }

        if (changed) {
          item.updatedAt = Date.now();
          await App.DB.put(store, item);
        }
      }
    }
    return count;
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  window.App = window.App || {};
  window.App.Search = { searchAll, replaceAll };
})();
