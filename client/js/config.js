// -----------------------------------------------------------------------------
//  config.js — single place for runtime configuration.
//
//  Web (served by Express): API lives on the SAME origin, so '/api' just works —
//  no CORS, one service, one URL.
//  Capacitor (packaged WebView on https://localhost): there is no same-origin API,
//  so the base URL must be absolute — the emulator default below, or an address
//  typed once in Settings (e.g. the dev machine over the LAN: http://192.168.1.5:3100/api).
// -----------------------------------------------------------------------------
(function (global) {
  const KEY_BASE = 'dh_api_base';
  const KEY_LANG = 'dh_lang';
  const KEY_TOKEN = 'dh_token';
  const KEY_USER = 'dh_user';

  // Where an installed APK looks when nobody typed an address yet: the host
  // machine of the Android emulator. A real phone on the same wifi needs the
  // LAN address of the computer (Settings ▸ server address), that is saved below.
  const NATIVE_FALLBACK = 'http://10.0.2.2:3100/api';

  /**
   * Are we inside the packaged app? The bridge sets window.Capacitor before any
   * page script runs (native-bridge.js does win.Capacitor = cap), so that is the
   * real signal. The extra tests are only a net for a bridge that has not loaded:
   * an install is served from https://localhost with NO port, while the web build
   * is always http://host:3100, and the Android WebView marks itself with "; wv".
   * Getting this wrong is not cosmetic: the protocol is https on Android, so a
   * plain protocol test answers "/api" and every request dies on a fake origin.
   */
  function isNative() {
    const c = global.Capacitor;
    if (c) {
      if (typeof c.isNativePlatform === 'function') return !!c.isNativePlatform();
      if (typeof c.getPlatform === 'function') return c.getPlatform() !== 'web';
    }
    const loc = global.location;
    if (loc.protocol === 'file:' || loc.protocol === 'capacitor:') return true;
    return loc.hostname === 'localhost' && !loc.port && /; ?wv[);]/.test((global.navigator && global.navigator.userAgent) || '');
  }

  function guessApiBase() {
    // localStorage override always wins (set from Settings).
    const stored = global.localStorage.getItem(KEY_BASE);
    if (stored) return stored.replace(/\/+$/, '');
    // Packaged WebView: there is no same-origin API, so point at the dev server.
    if (isNative()) return NATIVE_FALLBACK;
    // http(s) page => API is served by the same Express process.
    if (/^https?:$/.test(global.location.protocol)) return '/api';
    return NATIVE_FALLBACK;
  }

  const Config = {
    get apiBase() { return guessApiBase(); },
    set apiBase(url) { global.localStorage.setItem(KEY_BASE, url.trim().replace(/\/+$/, '')); },
    isNative: isNative(),

    /**
     * What this device was explicitly told to use, or '' when the app should
     * call its own origin. Settings shows this instead of apiBase, so a web
     * user sees an empty box rather than '/api' they might save as an override.
     * Inside the APK an empty box is meaningless, so the screen shows apiBase.
     */
    get apiBaseOverride() { return global.localStorage.getItem(KEY_BASE) || ''; },

    get token() { return global.localStorage.getItem(KEY_TOKEN) || ''; },
    set token(t) { t ? global.localStorage.setItem(KEY_TOKEN, t) : global.localStorage.removeItem(KEY_TOKEN); },

    /** Cached user row (id, phone, name, currency, lang, footer_text). */
    get user() {
      try { return JSON.parse(global.localStorage.getItem(KEY_USER) || 'null'); }
      catch (_e) { return null; }
    },
    set user(u) { u ? global.localStorage.setItem(KEY_USER, JSON.stringify(u)) : global.localStorage.removeItem(KEY_USER); },

    get lang() { return global.localStorage.getItem(KEY_LANG) || 'ar'; },
    set lang(l) { global.localStorage.setItem(KEY_LANG, l === 'fa' ? 'fa' : 'ar'); },
  };

  global.Config = Config;
})(window);
