// -----------------------------------------------------------------------------
//  rem-form.js — the add/edit bottom sheet for a تذكير (reminder).
//  The time is a native datetime-local picker; the server stores the wall-clock
//  value and this device decides when it is due (see reminderService).
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  const stamp = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  /** Date -> 'YYYY-MM-DDTHH:MM' for <input type="datetime-local">. */
  const toLocalInput = (d) => `${stamp(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const shiftDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

  /** '2026-11-04 10:00:00' (server) -> '2026-11-04T10:00' (input). */
  const fromSql = (v) => String(v || '').replace(' ', 'T').slice(0, 16);

  /**
   * @param {object|null} rem  existing row to edit, or null to create
   * @returns {Promise<object|null>} { reminder } or null if cancelled
   */
  function openRemForm(rem = null) {
    // An existing row carries an id; a prefilled draft (the bell button on the
    // party screen) does not, and is still created as a new reminder.
    const isEdit = !!(rem && rem.id);
    const t = (k, v) => global.I18n.t(k, v);
    // New reminders default to tomorrow morning — the usual "don't forget" case.
    const defaultWhen = () => { const d = shiftDays(1); d.setHours(9, 0, 0, 0); return toLocalInput(d); };
    const whenValue = isEdit ? fromSql(rem.remind_at) : defaultWhen();

    return new Promise((resolve) => {
      const sheet = global.UI.modal(
        isEdit ? t('rem.edit') : t('rem.new'),
        `
        <form id="rem-form" novalidate>
          <label class="fld">
            <span class="lbl">${t('rem.t')}</span>
            <input type="text" name="title" maxlength="200" required
                   value="${global.UI.escapeHtml(rem?.title || '')}" />
            <em class="err-text" data-err-for="title"></em>
          </label>
          <label class="fld">
            <span class="lbl">${t('rem.when')}</span>
            <input type="datetime-local" name="remind_at" required value="${whenValue}" />
            <em class="err-text" data-err-for="remind_at"></em>
          </label>
          <div class="row" style="gap:6px;margin:-6px 0 8px">
            <button type="button" class="btn sm ghost" data-shift="0">${t('rem.today')}</button>
            <button type="button" class="btn sm ghost" data-shift="1">${t('rem.tomorrow')}</button>
            <button type="button" class="btn sm ghost" data-shift="7">${t('rem.week')}</button>
          </div>
          <span class="date-preview"></span>
          <label class="fld">
            <span class="lbl">${t('rem.party')}</span>
            <select name="party_id"><option value="">${t('rem.noParty')}</option></select>
          </label>
          <label class="fld tall">
            <span class="lbl">${t('rem.message')}</span>
            <textarea name="message" rows="3" maxlength="2000">${global.UI.escapeHtml(rem?.message || '')}</textarea>
            <em class="err-text" data-err-for="message"></em>
          </label>
          <div class="row">
            <button type="button" class="btn secondary" data-x="cancel">${t('common.cancel')}</button>
            <button type="submit" class="btn">${t('common.save')}</button>
          </div>
        </form>`,
        {
          onOpen: async (el) => {
            el.querySelector('select[name="party_id"]').innerHTML =
              await global.PartySelect.options(rem?.party_id, t('rem.noParty'));
            el.querySelector('input[name="title"]').focus();
          },
        }
      );

      const form = sheet.el.querySelector('#rem-form');
      const whenInput = form.elements.remind_at;

      // Same reason as the other sheets: the picker speaks Gregorian, the line
      // under it speaks the user's calendar.
      const preview = form.querySelector('.date-preview');
      const paintPreview = () => {
        preview.textContent = whenInput.value ? global.UI.formatDateTime(whenInput.value) : '';
      };
      whenInput.addEventListener('change', paintPreview);
      paintPreview();

      // Quick buttons keep the chosen clock time and only move the day.
      sheet.el.querySelectorAll('[data-shift]').forEach((b) => {
        b.addEventListener('click', () => {
          const target = shiftDays(Number(b.dataset.shift));
          const hh = String(whenInput.value.slice(11, 13) || '09');
          const mm = String(whenInput.value.slice(14, 16) || '00');
          whenInput.value = `${stamp(target)}T${hh}:${mm}`;
          paintPreview(); // setting .value does not fire a change event
        });
      });

      form.querySelector('[data-x="cancel"]').onclick = () => { sheet.close(); resolve(null); };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const errors = {};
        if (!global.UI.value(form, 'title')) errors.title = t('common.required');
        if (!whenInput.value) errors.remind_at = t('common.required');
        if (Object.keys(errors).length) return global.UI.showFieldErrors(form, errors);

        const payload = {
          title: global.UI.value(form, 'title'),
          message: global.UI.value(form, 'message'),
          remind_at: whenInput.value,
          party_id: global.UI.value(form, 'party_id'),
        };
        btn.disabled = true;
        try {
          const res = isEdit
            ? await global.API.put(`/reminders/${rem.id}`, payload)
            : await global.API.post('/reminders', payload);
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

  global.RemForm = { open: openRemForm };
})(window);
