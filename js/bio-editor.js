/* ── BIO EDITOR ────────────────────────────────────────────────────────────
 * Split-pane: left = HTML textarea, right = sandboxed iframe preview
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const PREVIEW_CSS = `
    body {
      margin: 0;
      padding: 14px 16px;
      font-family: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.65;
      color: #e8e2d9;
      background: #131210;
      word-break: break-word;
    }
    a { color: #e8622a; }
    h1, h2, h3 { font-weight: 600; margin: 8px 0 4px; }
    h1 { font-size: 20px; }
    h2 { font-size: 17px; }
    h3 { font-size: 14px; }
    p  { margin: 4px 0 8px; }
    hr { border: none; border-top: 1px solid #2e2a24; margin: 10px 0; }
    img { max-width: 100%; border-radius: 6px; }
    blockquote {
      border-left: 3px solid #e8622a;
      padding: 4px 12px;
      margin: 8px 0;
      color: #b5aa9a;
    }
    code {
      background: #1a1815;
      border-radius: 3px;
      padding: 1px 5px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
    }
    pre code { display: block; padding: 10px; overflow: auto; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0; }
    td, th {
      border: 1px solid #2e2a24;
      padding: 5px 10px;
      font-size: 13px;
    }
    th { background: #1a1815; color: #b5aa9a; }
  `;

  /* Build the full preview HTML document */
  function _buildPreviewDoc(html) {
    return `<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
      <style>${PREVIEW_CSS}</style>
    </head><body>${html || '<p style="color:#4a4438;font-style:italic;">Preview will appear here…</p>'}</body></html>`;
  }

  /* Render the bio split-pane into a container element.
   * Returns an updater function: update(newHtml) */
  function render(container, initialHtml, onChange) {
    container.innerHTML = `
      <div class="bio-split">
        <div class="bio-pane">
          <div class="bio-pane-label">HTML Source</div>
          <textarea class="field-textarea bio-textarea mono" id="bioTextarea"
            placeholder="Write bio HTML here… supports CSS, inline styles, tables, etc."
            spellcheck="false">${window.App.UI.esc(initialHtml || '')}</textarea>
        </div>
        <div class="bio-pane" id="bioPanePreview">
          <div class="bio-pane-label">
            Live Preview
            <span style="font-weight:400;letter-spacing:0;text-transform:none;font-size:10px;color:var(--text4)">— rendered in sandboxed iframe</span>
          </div>
          <iframe
            id="bioIframe"
            class="bio-preview-frame"
            sandbox="allow-same-origin"
            title="Bio preview"
          ></iframe>
        </div>
      </div>`;

    const textarea = container.querySelector('#bioTextarea');
    const iframe   = container.querySelector('#bioIframe');

    function updatePreview(html) {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(_buildPreviewDoc(html));
      doc.close();
    }

    // Initial render
    updatePreview(initialHtml || '');

    // Live updates
    textarea.addEventListener('input', () => {
      const val = textarea.value;
      updatePreview(val);
      if (typeof onChange === 'function') onChange(val);
    });

    // Return updater for external use (e.g. restoring a version)
    return function update(html) {
      textarea.value = html || '';
      updatePreview(html || '');
    };
  }

  window.App = window.App || {};
  window.App.BioEditor = { render };
})();
