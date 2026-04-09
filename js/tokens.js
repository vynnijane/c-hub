/* ── TOKEN COUNTER ─────────────────────────────────────────────────────────
 * Uses gpt-tokenizer (cl100k_base) via ESM CDN.
 * Falls back to chars/4 approximation if load fails.
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _encode = null;
  let _ready  = false;
  let _limit  = parseInt(localStorage.getItem('jai_token_limit') || '4096', 10);

  function init() {
    return new Promise(resolve => {
      // Try loading gpt-tokenizer as an ES module, expose encode globally
      const script = document.createElement('script');
      script.type = 'module';
      script.textContent = `
        try {
          const { encode } = await import('https://esm.sh/gpt-tokenizer@2.9.0/esm/cl100k_base');
          window.__jaiEncode = encode;
          document.dispatchEvent(new Event('__jaiTokenizerReady'));
        } catch(e) {
          document.dispatchEvent(new Event('__jaiTokenizerFailed'));
        }
      `;

      const timeout = setTimeout(() => {
        console.warn('[tokens] Tokenizer load timed out — using approximation');
        resolve();
      }, 6000);

      document.addEventListener('__jaiTokenizerReady', () => {
        clearTimeout(timeout);
        _encode = window.__jaiEncode;
        _ready  = true;
        console.info('[tokens] cl100k_base tokenizer ready');
        // Re-render any visible token counts
        document.dispatchEvent(new Event('tokenizerUpdated'));
        resolve();
      }, { once: true });

      document.addEventListener('__jaiTokenizerFailed', () => {
        clearTimeout(timeout);
        console.warn('[tokens] Tokenizer unavailable — using approximation');
        resolve();
      }, { once: true });

      document.head.appendChild(script);
    });
  }

  function count(str) {
    if (!str) return 0;
    if (_ready && _encode) {
      try { return _encode(str).length; } catch {}
    }
    // Fallback: chars/4 (reasonable English approximation)
    return Math.ceil(str.length / 4);
  }

  function isReady() { return _ready; }

  function getLimit() { return _limit; }
  function setLimit(n) {
    _limit = Math.max(100, parseInt(n, 10) || 4096);
    localStorage.setItem('jai_token_limit', String(_limit));
  }

  /* Render a per-field token count string + CSS class */
  function fieldTokenHTML(str) {
    const n   = count(str);
    const pct = _limit > 0 ? n / _limit : 0;
    const cls = pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : '';
    return `<div class="field-tokens ${cls}">${n.toLocaleString()} tokens</div>`;
  }

  /* Summarise multiple fields for the right-panel token summary */
  function summarise(fields) {
    // fields: [{label, text}]
    let total = 0;
    const rows = fields.map(f => {
      const n = count(f.text);
      total += n;
      return { label: f.label, count: n };
    });
    return { rows, total };
  }

  window.App = window.App || {};
  window.App.Tokens = { init, count, isReady, getLimit, setLimit, fieldTokenHTML, summarise };
})();
