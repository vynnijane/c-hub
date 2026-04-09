/* ── SYNC / GOOGLE DRIVE ───────────────────────────────────────────────────
 * Optional Google Drive integration for workspace backup.
 * Uses Google Identity Services (GIS) for OAuth 2.0.
 *
 * To enable: add your Google Client ID in Settings.
 * The Drive API scope is "drive.file" — only files this app creates.
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const DRIVE_SCOPE   = 'https://www.googleapis.com/auth/drive.file';
  const BACKUP_FNAME  = 'jai-creator-studio-workspace.json';
  const LS_KEY_TOKEN  = 'jai_gdrive_token';
  const LS_KEY_CLIENT = 'jai_gdrive_client_id';
  const LS_KEY_FILE   = 'jai_gdrive_file_id';

  let _tokenClient = null;
  let _accessToken = null;
  let _clientId    = null;
  let _fileId      = localStorage.getItem(LS_KEY_FILE) || null;

  /* ── State helpers ── */
  function isConnected() { return !!_accessToken; }
  function getClientId() { return localStorage.getItem(LS_KEY_CLIENT) || ''; }
  function setClientId(id) { localStorage.setItem(LS_KEY_CLIENT, id.trim()); }

  /* ── Load GIS library dynamically ── */
  function _loadGIS() {
    return new Promise((res, rej) => {
      if (window.google?.accounts) { res(); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload  = res;
      s.onerror = () => rej(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(s);
    });
  }

  /* ── Initialise token client ── */
  async function init() {
    _clientId = getClientId();
    if (!_clientId) return false;

    try {
      await _loadGIS();
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: _clientId,
        scope:     DRIVE_SCOPE,
        callback:  tokenResponse => {
          if (tokenResponse.error) { console.error('[sync]', tokenResponse); return; }
          _accessToken = tokenResponse.access_token;
          localStorage.setItem(LS_KEY_TOKEN, _accessToken);
          _updateStatus();
        }
      });
      // Try to restore previous token (will fail if expired — that's fine)
      const saved = localStorage.getItem(LS_KEY_TOKEN);
      if (saved) _accessToken = saved;
      return true;
    } catch (e) {
      console.warn('[sync] GIS init failed:', e);
      return false;
    }
  }

  /* ── Request / refresh access token ── */
  function requestToken() {
    if (!_tokenClient) {
      App.UI.toast('Set a Google Client ID in Settings first', 'error');
      return;
    }
    _tokenClient.requestAccessToken();
  }

  function disconnect() {
    _accessToken = null;
    localStorage.removeItem(LS_KEY_TOKEN);
    _updateStatus();
    App.UI.toast('Disconnected from Google Drive');
  }

  /* ── Drive API helpers ── */
  function _authHeader() {
    if (!_accessToken) throw new Error('Not authenticated');
    return { 'Authorization': 'Bearer ' + _accessToken };
  }

  async function _findFile() {
    const q = encodeURIComponent(`name='${BACKUP_FNAME}' and trashed=false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`,
      { headers: _authHeader() }
    );
    if (!res.ok) { _handleAuthError(res.status); return null; }
    const data = await res.json();
    return data.files?.[0] || null;
  }

  function _handleAuthError(status) {
    if (status === 401) {
      _accessToken = null;
      localStorage.removeItem(LS_KEY_TOKEN);
      _updateStatus();
      App.UI.toast('Google session expired — please reconnect', 'error');
    }
  }

  /* ── Save workspace to Drive ── */
  async function saveToGoogleDrive() {
    if (!isConnected()) { requestToken(); return false; }
    try {
      const workspace = await App.Factory.exportWorkspace();
      const json      = JSON.stringify(workspace, null, 2);
      const blob      = new Blob([json], { type: 'application/json' });

      // Find existing file
      if (!_fileId) {
        const found = await _findFile();
        _fileId = found?.id || null;
      }

      let res;
      if (_fileId) {
        // Update existing
        res = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${_fileId}?uploadType=media`,
          { method: 'PATCH', headers: { ..._authHeader(), 'Content-Type': 'application/json' }, body: blob }
        );
      } else {
        // Create new (metadata + media multipart)
        const meta = JSON.stringify({ name: BACKUP_FNAME, mimeType: 'application/json' });
        const body = new FormData();
        body.append('metadata', new Blob([meta], { type: 'application/json' }));
        body.append('file', blob);
        res = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
          { method: 'POST', headers: _authHeader(), body }
        );
      }

      if (!res.ok) { _handleAuthError(res.status); return false; }
      const data = await res.json();
      if (data.id) {
        _fileId = data.id;
        localStorage.setItem(LS_KEY_FILE, _fileId);
      }
      App.UI.toast('Saved to Google Drive', 'success');
      return true;
    } catch (e) {
      App.UI.toast('Drive save failed: ' + e.message, 'error');
      return false;
    }
  }

  /* ── Load workspace from Drive ── */
  async function loadFromGoogleDrive() {
    if (!isConnected()) { requestToken(); return null; }
    try {
      const found = await _findFile();
      if (!found) {
        App.UI.toast('No backup found in Google Drive', 'info');
        return null;
      }
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${found.id}?alt=media`,
        { headers: _authHeader() }
      );
      if (!res.ok) { _handleAuthError(res.status); return null; }
      const data = await res.json();
      return { data, modifiedTime: found.modifiedTime };
    } catch (e) {
      App.UI.toast('Drive load failed: ' + e.message, 'error');
      return null;
    }
  }

  /* ── Update the Drive status badge in the UI ── */
  function _updateStatus() {
    const dot = document.getElementById('gdriveDot');
    const lbl = document.getElementById('gdriveLabel');
    if (dot) dot.classList.toggle('connected', isConnected());
    if (lbl) lbl.textContent = isConnected() ? 'Connected' : 'Not connected';
  }

  window.App = window.App || {};
  window.App.Sync = {
    init, requestToken, disconnect, isConnected,
    saveToGoogleDrive, loadFromGoogleDrive,
    getClientId, setClientId
  };
})();
