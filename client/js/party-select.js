// -----------------------------------------------------------------------------
//  party-select.js — shared <option> list for the "linked party" picker used by
//  the check / loan / reminder sheets. Cached for a minute so opening three sheets
//  in a row does not hammer the API.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  let cache = { at: 0, rows: [] };
  const TTL = 60000;

  async function options(selectedId, noneLabel) {
    const t = global.I18n.t;
    if (Date.now() - cache.at > TTL) {
      try {
        const res = await global.API.get('/parties');
        cache = { at: Date.now(), rows: res.data.parties || [] };
      } catch (err) {
        // Offline or expired token: still render the "no party" option so the
        // sheet stays usable instead of throwing.
        cache = { at: 0, rows: [] };
      }
    }
    const sel = Number(selectedId) || 0;
    const out = [`<option value="">${global.UI.escapeHtml(noneLabel || t('chk.noParty'))}</option>`];
    cache.rows.forEach((p) => {
      out.push(`<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${global.UI.escapeHtml(p.name)}</option>`);
    });
    // Editing a row whose party was deleted still has to show something sensible.
    if (sel && !cache.rows.some((p) => p.id === sel)) {
      out.push(`<option value="${sel}" selected>${global.UI.escapeHtml(t('party.title'))}</option>`);
    }
    return out.join('');
  }

  global.PartySelect = { options, refresh: () => { cache = { at: 0, rows: [] }; } };
})(window);
