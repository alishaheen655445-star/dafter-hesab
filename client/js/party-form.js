// -----------------------------------------------------------------------------
//  party-form.js — the create/edit bottom sheet, shared by the parties list and
//  the party detail screen. One place for the fields, so both stay in sync.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  /**
   * @param {object|null} party  existing row to edit, or null to create
   * @returns {Promise<object|null>} the saved party payload, or null if cancelled
   */
  function openPartyForm(party = null) {
    const isEdit = !!party;
    const t = (k) => global.I18n.t(k);

    return new Promise((resolve) => {
      const sheet = global.UI.modal(
        isEdit ? t('party.edit') : t('party.new'),
        `
        <form id="party-form" novalidate>
          <label class="fld">
            <span class="lbl">${t('party.name')}</span>
            <input type="text" name="name" required maxlength="100"
                   value="${global.UI.escapeHtml(party?.name || '')}" />
            <em class="err-text" data-err-for="name"></em>
          </label>
          <label class="fld">
            <span class="lbl">${t('party.phone')}</span>
            <input type="tel" name="phone" inputmode="tel" maxlength="20" dir="ltr" style="text-align:end"
                   value="${global.UI.escapeHtml(party?.phone || '')}" />
            <em class="err-text" data-err-for="phone"></em>
          </label>
          <label class="fld tall">
            <span class="lbl">${t('party.note')}</span>
            <textarea name="note" maxlength="2000">${global.UI.escapeHtml(party?.note || '')}</textarea>
            <em class="err-text" data-err-for="note"></em>
          </label>
          <div class="row">
            <button type="button" class="btn secondary" data-x="cancel">${t('common.cancel')}</button>
            <button type="submit" class="btn">${t('common.save')}</button>
          </div>
        </form>`,
        { onOpen: (el) => el.querySelector('input[name="name"]').focus() }
      );

      const form = sheet.el.querySelector('#party-form');
      form.querySelector('[data-x="cancel"]').onclick = () => { sheet.close(); resolve(null); };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const payload = {
          name: global.UI.value(form, 'name'),
          phone: global.UI.value(form, 'phone'),
          note: global.UI.value(form, 'note'),
        };
        if (!payload.name) {
          global.UI.showFieldErrors(form, { name: t('common.required') });
          return;
        }
        btn.disabled = true;
        try {
          const res = isEdit
            ? await global.API.put(`/parties/${party.id}`, payload)
            : await global.API.post('/parties', payload);
          sheet.close();
          global.UI.toast(t('common.saved'), 'ok');
          resolve(res.data);
        } catch (err) {
          global.UI.showFieldErrors(form, err.fields || {});
          global.UI.toast(err.message, 'bad');
          btn.disabled = false;
        }
      });
    });
  }

  global.PartyForm = { open: openPartyForm };
})(window);
