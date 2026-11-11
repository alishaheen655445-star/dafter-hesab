// -----------------------------------------------------------------------------
//  reminders.js — the notification loop, no DOM.
//
//  The browser is the clock: every minute we ask the API "what is due for ME,
//  right now?" (sending our local time, because a reminder set for 08:00 in
//  Baghdad must not fire at 05:00 UTC) and raise a Notification, or a toast when
//  the device refuses one.
//
//  Phase 8 moved the reminder LIST to its own screen (reminders.html, the bell
//  tab) — this file only watches the time, and is loaded by any page that stays
//  open long enough to need it.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  const t = (k, v) => global.I18n.t(k, v);
  const pad = (n) => String(n).padStart(2, '0');

  /** 'YYYY-MM-DD HH:MM:SS' in THIS device's local time. */
  function localNow() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  }

  function fire(rem) {
    const title = `${t('rem.dueNow')}: ${rem.title}`;
    if (global.Notification && Notification.permission === 'granted') {
      try {
        new global.Notification(rem.title, { body: rem.message || t('app.name'), tag: `rem-${rem.id}` });
        return;
      } catch (_err) { /* some browsers block constructor calls — fall through */ }
    }
    global.UI.toast(title, 'ok');
  }

  async function tick() {
    if (!global.Auth.isLoggedIn()) return;
    try {
      const res = await global.API.get(`/reminders/due?now=${encodeURIComponent(localNow())}`);
      const due = res.data.reminders || [];
      if (due.length === 0) return;
      due.forEach(fire);
      await Promise.all(due.map((r) => global.API.post(`/reminders/${r.id}/ack`, { sent: true })));
      // The reminders screen, if it is the one open, refreshes itself.
      global.dispatchEvent(new CustomEvent('dh:reminders'));
    } catch (_err) { /* offline is fine, we try again next minute */ }
  }

  tick();
  setInterval(tick, 60000);

  global.Reminders = { tick, localNow };
})(window);
