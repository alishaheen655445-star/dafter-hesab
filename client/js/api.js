// -----------------------------------------------------------------------------
//  api.js — the ONLY place that talks to the backend.
//  * attaches the Bearer token
//  * unwraps the { success, message, data, meta } envelope
//  * turns any failure into one ApiClientError with a message we can show
//  * on 401 (expired/revoked) it clears the session and bounces to login
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  class ApiClientError extends Error {
    constructor(message, status, details) {
      super(message);
      this.name = 'ApiClientError';
      this.status = status;
      this.details = details || [];
    }
  }

  /**
   * The error list inside a failure envelope.
   * The server writes field errors under `errors` ({ success:false, message,
   * errors:[{ field, message }] }); `details` is kept as a fallback so an older
   * response still renders. Whichever one is an array wins.
   */
  function errorList(payload) {
    if (Array.isArray(payload && payload.errors)) return payload.errors;
    if (Array.isArray(payload && payload.details)) return payload.details;
    return [];
  }

  /** Field-level messages, e.g. { name: 'Party name is required' }. */
  function fieldErrors(list) {
    const out = {};
    (list || []).forEach((d) => { if (d && d.field) out[d.field] = d.message; });
    return out;
  }

  async function request(path, { method = 'GET', body, raw = false } = {}) {
    const headers = {};
    if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
    if (global.Config.token) headers.Authorization = `Bearer ${global.Config.token}`;
    // Tell the backend which language it should reply in (used later for
    // server-side messages and localized stored text).
    headers['X-App-Lang'] = global.I18n ? global.I18n.lang() : 'ar';

    let res;
    try {
      res = await fetch(`${global.Config.apiBase}${path}`, {
        method,
        headers,
        body: raw ? body : (body !== undefined ? JSON.stringify(body) : undefined),
      });
    } catch (_err) {
      throw new ApiClientError(global.I18n ? global.I18n.t('common.networkError') : 'Network error', 0);
    }

    let payload = null;
    try { payload = await res.json(); } catch (_e) { payload = null; }

    if (res.status === 401) {
      // Session is gone — drop it and send the user back to the login screen.
      Auth.logout(false);
      throw new ApiClientError((payload && payload.message) || 'Please log in again', 401);
    }
    if (!res.ok || (payload && payload.success === false)) {
      const msg = (payload && payload.message) || (global.I18n ? global.I18n.t('common.somethingWrong') : 'Request failed');
      const list = errorList(payload);
      const err = new ApiClientError(msg, res.status, list);
      err.fields = fieldErrors(list);
      throw err;
    }

    // The book just changed. js/autobackup.js listens and keeps a copy on the
    // server a moment later. /backup/* is left out — otherwise making a copy
    // would announce a write and ask for another copy, forever.
    if (method !== 'GET' && !String(path).startsWith('/backup')) {
      global.dispatchEvent(new CustomEvent('dh:written', { detail: { path, method } }));
    }

    return payload || { success: true, data: {} };
  }

  const get = (p) => request(p);
  const post = (p, body) => request(p, { method: 'POST', body });
  const put = (p, body) => request(p, { method: 'PUT', body });
  const del = (p) => request(p, { method: 'DELETE' });

  /**
   * Multipart upload of one picture (Phase 5). The field name MUST be "image" —
   * that is what multer.single('image') reads on the server.
   * `raw` lets the browser set the Content-Type itself, boundary included.
   */
  const upload = (p, file) => {
    const form = new FormData();
    form.append('image', file, file.name || 'image');
    return request(p, { method: 'POST', body: form, raw: true });
  };

  /** Fetch an authenticated file (a backup copy) and hand it back as a Blob. */
  async function getBlob(p) {
    const headers = {};
    if (global.Config.token) headers.Authorization = `Bearer ${global.Config.token}`;
    let res;
    try {
      res = await fetch(`${global.Config.apiBase}${p}`, { headers });
    } catch (_err) {
      throw new ApiClientError(global.I18n ? global.I18n.t('common.networkError') : 'Network error', 0);
    }
    if (res.status === 401) { Auth.logout(false); throw new ApiClientError('Please log in again', 401); }
    if (!res.ok) {
      let msg = 'Request failed';
      try { msg = (await res.json()).message || msg; } catch (_e) { /* not JSON */ }
      throw new ApiClientError(msg, res.status);
    }
    return res.blob();
  }

  // --- session ---------------------------------------------------------------
  // sessionStorage is the right place for "this tab was unlocked": it survives
  // moving between screens, and dies with the tab, which is what a lock does.
  const ss = {
    get(k) { try { return global.sessionStorage.getItem(k); } catch (_e) { return null; } },
    set(k, v) { try { global.sessionStorage.setItem(k, v); } catch (_e) { /* private mode */ } },
    del(k) { try { global.sessionStorage.removeItem(k); } catch (_e) { /* ignore */ } },
  };
  const UNLOCKED = 'dh_unlocked';

  const Auth = {
    /** Store token + user from a login/register response. */
    setSession(token, user) {
      global.Config.token = token;
      global.Config.user = user;
      // A brand-new session has not faced the code pad yet.
      if (user && user.has_pin) ss.del(UNLOCKED);
      if (user && user.lang && global.I18n && global.I18n.lang() !== user.lang) global.I18n.setLang(user.lang);
    },
    logout(redirect = true) {
      global.Config.token = '';
      global.Config.user = null;
      ss.del(UNLOCKED);
      if (redirect) global.location.href = 'index.html';
    },
    isLoggedIn() { return !!global.Config.token; },
    user() { return global.Config.user; },

    /** A code on the account + no unlock in this tab = the door is shut. */
    locked() {
      const u = this.user() || {};
      return !!u.has_pin && !ss.get(UNLOCKED);
    },
    markUnlocked() { ss.set(UNLOCKED, '1'); },

    /**
     * Guard for every inner page: no token -> login, locked account -> the code
     * pad. This is the one function every screen calls on boot, so a deep link
     * (a reminder, one party, a report) cannot walk past the lock.
     */
    require() {
      if (!this.isLoggedIn()) { global.location.href = 'index.html'; return false; }
      if (this.locked()) {
        const back = `${global.location.pathname.split('/').pop()}${global.location.search}`;
        global.location.href = `lock.html?back=${encodeURIComponent(back)}`;
        return false;
      }
      return true;
    },
  };

  global.API = { request, get, post, put, del, upload, getBlob, ApiClientError, Auth };
  global.Auth = Auth;
})(window);
