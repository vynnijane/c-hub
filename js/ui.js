/* ── UI UTILITIES ──────────────────────────────────────────────────────────
 * Toast, modals, helpers, formatters
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* ── IDs / unique keys ── */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ── HTML escape ── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Date / bytes formatters ── */
  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDateShort(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1)  return 'just now';
    if (diffMins < 60) return diffMins + 'm ago';
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24)  return diffHrs + 'h ago';
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }

  function fmtBytes(b) {
    if (b < 1024)    return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  /* ── Toast notifications ── */
  function toast(msg, type = '') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    const iconMap = { success: '✓', error: '✕', info: '●', '': '·' };
    const icon = iconMap[type] || '·';
    el.innerHTML = `<span style="color:${
      type === 'success' ? 'var(--success)'
      : type === 'error' ? 'var(--danger)'
      : type === 'info'  ? 'var(--ember)'
      : 'var(--text3)'
    }">${icon}</span> ${esc(msg)}`;

    container.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  /* ── Generic modal open/close ── */
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  /* ── Confirm dialog (returns Promise<boolean>) ── */
  function confirm(msg, dangerLabel = 'Confirm', cancelLabel = 'Cancel') {
    return new Promise(resolve => {
      const overlay = document.getElementById('confirmModal');
      if (!overlay) { resolve(window.confirm(msg)); return; }

      document.getElementById('confirmMsg').textContent = msg;
      document.getElementById('confirmOkBtn').textContent = dangerLabel;
      overlay.classList.add('open');

      const ok = document.getElementById('confirmOkBtn');
      const cancel = document.getElementById('confirmCancelBtn');

      function cleanup() {
        overlay.classList.remove('open');
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
      }
      function onOk()     { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }

      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
    });
  }

  /* ── Input prompt dialog ── */
  function prompt(msg, placeholder = '', defaultVal = '') {
    return new Promise(resolve => {
      const overlay = document.getElementById('promptModal');
      if (!overlay) { resolve(window.prompt(msg, defaultVal)); return; }

      document.getElementById('promptLabel').textContent = msg;
      const input = document.getElementById('promptInput');
      input.placeholder = placeholder;
      input.value = defaultVal;
      overlay.classList.add('open');
      setTimeout(() => input.focus(), 60);

      const ok = document.getElementById('promptOkBtn');
      const cancel = document.getElementById('promptCancelBtn');

      function cleanup() {
        overlay.classList.remove('open');
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
      }
      function onOk()     { const v = input.value.trim(); cleanup(); resolve(v || null); }
      function onCancel() { cleanup(); resolve(null); }
      function onKey(e)   { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); }

      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  }

  /* ── Download helper ── */
  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ── Read file as text ── */
  function readFile(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = e => res(e.target.result);
      r.onerror = () => rej(r.error);
      r.readAsText(file);
    });
  }

  /* ── Sanitize filename ── */
  function safeFilename(name) {
    return (name || 'untitled').replace(/[^a-z0-9\-_]/gi, '_').toLowerCase();
  }

  /* ── Update stats bar ── */
  async function updateStats(counts) {
    const { cards = 0, lorebooks = 0, personas = 0, presets = 0, notes = 0, active = '—' } = counts || {};
    const el = id => document.getElementById(id);
    if (el('statCards'))     el('statCards').textContent = cards;
    if (el('statLorebooks')) el('statLorebooks').textContent = lorebooks;
    if (el('statPersonas'))  el('statPersonas').textContent = personas;
    if (el('statNotes'))     el('statNotes').textContent = notes;
    if (el('statActive'))    el('statActive').textContent = active;
    try {
      const est = await navigator.storage.estimate();
      if (el('statStorage')) el('statStorage').textContent = fmtBytes(est.usage || 0);
    } catch {}
  }

  window.App = window.App || {};
  window.App.UI = {
    uid, esc, fmtDate, fmtDateShort, fmtBytes,
    toast, openModal, closeModal,
    confirm, prompt,
    downloadJSON, downloadText, readFile, safeFilename,
    updateStats
  };
})();
