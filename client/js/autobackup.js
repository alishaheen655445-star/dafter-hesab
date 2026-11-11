// -----------------------------------------------------------------------------
//  autobackup.js — the copy you never have to remember (Phase 9).
//
//  The reference app calls this «پشتیبان گیری خودکار» and sells it. Here it is on
//  by default: the app keeps a fresh copy of the whole book on the server
//    * once a day when the app is opened, and
//    * a moment after any write (a حركة, a صك, a party edited…).
//
//  Three rules keep it from becoming a noise machine:
//    * a WRITE is debounced — fifteen seconds of quiet before a copy, so typing
//      five movements in a row costs one file, not five;
//    * two copies never happen closer than a few minutes apart;
//    * it never announces itself. A failure is swallowed (the manual copy screen
//      is still there, and says what happened), because a background task that
//      shouts "network error" while you are writing a number is worse than none.
//
//  The server prunes automatic copies to the newest five, on their own quota, so
//  this can never push the copies you saved yourself off the list.
//
//  Loaded last on every signed-in screen (it needs API + Auth + I18n).
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  const KEY_ON = 'dh_autobackup';     // 'off' only: absent means ON
  const KEY_AT = 'dh_auto_backup_at'; // when this device last succeeded, in ms
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEBOUNCE_MS = 15 * 1000;
  const MIN_GAP_MS = 3 * 60 * 1000;

  let timer = null;
  let running = false;   // one copy at a time, whatever fired it
  let busy = 0;          // writes still queued behind the debounce

  const store = global.localStorage;
  const enabled = () => store.getItem(KEY_ON) !== 'off';
  const lastAt = () => Number(store.getItem(KEY_AT) || 0);

  /**
   * Ask the server for one automatic copy.
   * @returns {Promise<boolean>} whether a file was actually written
   */
  async function copy(reason) {
    if (!global.Auth.isLoggedIn() || !enabled() || running) return false;
    const since = Date.now() - lastAt();
    if (since < MIN_GAP_MS) return false;
    running = true;
    try {
      await global.API.post('/backup/online', { kind: 'auto' });
      store.setItem(KEY_AT, String(Date.now()));
      global.dispatchEvent(new CustomEvent('dh:autobackup', { detail: { reason } }));
      return true;
    } catch (_err) {
      // Silent on purpose — see the header. The next write tries again.
      return false;
    } finally {
      running = false;
      // A write that arrived while this copy was in flight still deserves a copy.
      if (busy) schedule();
    }
  }

  /** Reset the quiet timer: the book keeps changing, so wait a little longer. */
  function schedule() {
    if (!enabled()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { busy = 0; copy('write'); }, DEBOUNCE_MS);
  }

  global.addEventListener('dh:written', () => {
    busy += 1;
    schedule();
  });

  // Once a day, starting from the first screen this device opens.
  if (global.Auth.isLoggedIn() && enabled() && Date.now() - lastAt() > DAY_MS) {
    // A small delay: the screen's own data calls come first.
    setTimeout(() => copy('open'), 1500);
  }

  global.AutoBackup = {
    enabled,
    /** Switch it from Settings. Off is remembered on this device, not the account. */
    setEnabled(on) {
      if (on) store.removeItem(KEY_ON); else store.setItem(KEY_ON, 'off');
      if (on) schedule();
      return on;
    },
    lastAt,
    /** The moment the next automatic copy would be allowed. */
    dueIn() { return Math.max(0, MIN_GAP_MS - (Date.now() - lastAt())); },
    copy,
  };
})(window);
