/* ── DIFF UTILITY ──────────────────────────────────────────────────────────
 * Simple line-level diff using Myers LCS algorithm.
 * Produces an HTML side-by-side diff view.
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* Compute LCS of two arrays (of strings) */
  function lcs(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    // Backtrack
    const result = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        result.unshift({ type: 'equal', val: a[i - 1] });
        i--; j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        result.unshift({ type: 'remove', val: a[i - 1] });
        i--;
      } else {
        result.unshift({ type: 'add', val: b[j - 1] });
        j--;
      }
    }
    while (i > 0) { result.unshift({ type: 'remove', val: a[i - 1] }); i--; }
    while (j > 0) { result.unshift({ type: 'add',    val: b[j - 1] }); j--; }
    return result;
  }

  /* Compute diff between two text strings */
  function compute(oldText, newText) {
    const oldLines = (oldText || '').split('\n');
    const newLines = (newText || '').split('\n');
    return lcs(oldLines, newLines);
  }

  /* Build side-by-side HTML for the diff modal */
  function renderSideBySide(oldText, newText) {
    const diff = compute(oldText, newText);
    const esc  = window.App.UI.esc;

    const oldLines = [];
    const newLines = [];

    diff.forEach(item => {
      switch (item.type) {
        case 'equal':
          oldLines.push(`<div class="diff-line">${esc(item.val)}</div>`);
          newLines.push(`<div class="diff-line">${esc(item.val)}</div>`);
          break;
        case 'remove':
          oldLines.push(`<div class="diff-line remove">${esc(item.val)}</div>`);
          break;
        case 'add':
          newLines.push(`<div class="diff-line add">${esc(item.val)}</div>`);
          break;
      }
    });

    const hasChanges = diff.some(d => d.type !== 'equal');

    return { oldHTML: oldLines.join(''), newHTML: newLines.join(''), hasChanges };
  }

  /* Compare two version snapshots for a character card */
  function compareSnapshots(oldSnap, newSnap) {
    const FIELDS = [
      { key: 'description',              label: 'Description' },
      { key: 'personality',              label: 'Personality' },
      { key: 'scenario',                 label: 'Scenario' },
      { key: 'first_mes',                label: 'First Message' },
      { key: 'mes_example',              label: 'Example Dialogue' },
      { key: 'system_prompt',            label: 'System Prompt' },
      { key: 'post_history_instructions',label: 'Post-History Instructions' },
    ];

    const blocks = [];
    FIELDS.forEach(f => {
      const oldVal = (oldSnap.data || {})[f.key] || '';
      const newVal = (newSnap.data || {})[f.key] || '';
      if (oldVal === newVal && !oldVal) return; // skip empty unchanged fields
      const { oldHTML, newHTML, hasChanges } = renderSideBySide(oldVal, newVal);
      if (!oldVal && !newVal) return;
      blocks.push({ label: f.label, oldHTML, newHTML, hasChanges });
    });

    // Bio
    const oldBio = oldSnap._jai_bio || '';
    const newBio = newSnap._jai_bio || '';
    if (oldBio || newBio) {
      const { oldHTML, newHTML, hasChanges } = renderSideBySide(oldBio, newBio);
      blocks.push({ label: 'Bio', oldHTML, newHTML, hasChanges });
    }

    return blocks;
  }

  /* Render the full diff modal body HTML */
  function renderDiffModal(oldVersion, newVersion, blocks) {
    const esc = window.App.UI.esc;
    if (!blocks.length) {
      return '<div class="empty-state"><div class="empty-text">No text fields to compare.</div></div>';
    }

    const changedBlocks = blocks.filter(b => b.hasChanges);
    const unchanged     = blocks.length - changedBlocks.length;

    const header = `
      <div style="margin-bottom:16px;font-size:12.5px;color:var(--text3);">
        Comparing <strong style="color:var(--text)">${esc(oldVersion.name)}</strong>
        → <strong style="color:var(--text)">${esc(newVersion.name)}</strong>
        &nbsp;·&nbsp; ${changedBlocks.length} field${changedBlocks.length !== 1 ? 's' : ''} changed
        ${unchanged ? `, ${unchanged} unchanged` : ''}
      </div>`;

    const fieldHTML = (changedBlocks.length ? changedBlocks : blocks).map(b => `
      <div class="diff-field-block">
        <div class="diff-field-name">${esc(b.label)}</div>
        <div class="diff-columns">
          <div class="diff-col">
            <div class="diff-col-header" style="color:var(--danger)">Before — ${esc(oldVersion.name)}</div>
            <div class="diff-lines">${b.oldHTML || '<div class="diff-line diff-unchanged">(empty)</div>'}</div>
          </div>
          <div class="diff-col">
            <div class="diff-col-header" style="color:var(--success)">After — ${esc(newVersion.name)}</div>
            <div class="diff-lines">${b.newHTML || '<div class="diff-line diff-unchanged">(empty)</div>'}</div>
          </div>
        </div>
      </div>`).join('');

    return header + `<div class="diff-viewer">${fieldHTML}</div>`;
  }

  window.App = window.App || {};
  window.App.Diff = { compute, renderSideBySide, compareSnapshots, renderDiffModal };
})();
