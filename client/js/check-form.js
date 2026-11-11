// -----------------------------------------------------------------------------
//  check-form.js — the add/edit bottom sheet for one صك (check).
//  received = someone handed me a check (money coming) · issued = I wrote one.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  const shiftDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const shiftMonths = (n) => {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const STATUSES = ['pending', 'cashed', 'bounced', 'cancelled'];

  /**
   * @param {object|null} chk  existing row to edit, or null to create
   * @returns {Promise<object|null>} { check } or null if cancelled
   */
  function openCheckForm(chk = null) {
    const isEdit = !!chk;
    const t = (k, v) => global.I18n.t(k, v);
    let type = isEdit ? chk.type : 'received';
    const amountValue = isEdit ? String(Number(chk.amount_minor) / 100) : '';
    const dueValue = isEdit ? String(chk.due_date).slice(0, 10) : shiftMonths(1);
    const unit = t('cur.' + ((global.Auth.user() || {}).currency || 'toman'));

    return new Promise((resolve) => {
      const sheet = global.UI.modal(
        isEdit ? t('chk.edit') : t('chk.new'),
        `
        <form id="chk-form" novalidate>
          <div class="seg" id="chk-types">
            <button type="button" data-type="received" class="active">${t('chk.received')}</button>
            <button type="button" data-type="issued">${t('chk.issued')}</button>
          </div>
          <label class="fld">
            <span class="lbl">${t('chk.amount')}</span>
            <input type="text" name="amount" inputmode="decimal" required
                   placeholder="0" value="${global.UI.escapeHtml(amountValue)}" />
            <span class="suffix">${unit}</span>
            <em class="err-text" data-err-for="amount"></em>
          </label>
          <label class="fld">
            <span class="lbl">${t('chk.due')}</span>
            <input type="date" name="due_date" required value="${dueValue}" />
            <em class="err-text" data-err-for="due_date"></em>
          </label>
          <div class="row" style="gap:6px;margin:-6px 0 8px">
            <button type="button" class="btn sm ghost" data-shift="7">${t('chk.quick1w')}</button>
            <button type="button" class="btn sm ghost" data-months="1">${t('chk.quick1m')}</button>
            <button type="button" class="btn sm ghost" data-months="3">${t('chk.quick3m')}</button>
          </div>
          <span class="date-preview" id="chk-preview"></span>
          <label class="fld">
            <span class="lbl">${t('chk.party')}</span>
            <select name="party_id"><option value="">${t('chk.noParty')}</option></select>
          </label>
          <div class="fld pair">
            <label class="fld">
              <span class="lbl">${t('chk.number')}</span>
              <input type="text" name="check_number" maxlength="50"
                     value="${global.UI.escapeHtml(chk?.check_number || '')}" />
            </label>
            ${isEdit ? `
            <label class="fld">
              <span class="lbl">${t('chk.status')}</span>
              <select name="status">${STATUSES.map((s) => `<option value="${s}"${s === chk.status ? ' selected' : ''}>${t(`chk.st_${s}`)}</option>`).join('')}</select>
            </label>` : ''}
          </div>
          <label class="fld">
            <span class="lbl">${t('chk.bank')}</span>
            <input type="text" name="bank_name" maxlength="100"
                   value="${global.UI.escapeHtml(chk?.bank_name || '')}" />
          </label>
          <label class="fld">
            <span class="lbl">${t('chk.note')}</span>
            <input type="text" name="note" maxlength="2000"
                   value="${global.UI.escapeHtml(chk?.note || '')}" />
            <em class="err-text" data-err-for="note"></em>
          </label>
          <div class="row">
            <button type="button" class="btn secondary" data-x="cancel">${t('common.cancel')}</button>
            <button type="submit" class="btn">${t('common.save')}</button>
          </div>
        </form>`,
        {
          onOpen: async (el) => {
            el.querySelector('select[name="party_id"]').innerHTML =
              await global.PartySelect.options(chk?.party_id, t('chk.noParty'));
            el.querySelector('input[name="amount"]').focus();
          },
        }
      );

      const form = sheet.el.querySelector('#chk-form');
      const dueInput = form.elements.due_date;
      const preview = sheet.el.querySelector('#chk-preview');

      const seg = sheet.el.querySelector('#chk-types');
      seg.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => {
          type = b.dataset.type;
          seg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        });
      });

      const paintPreview = () => {
        preview.textContent = dueInput.value ? global.UI.formatDateLong(dueInput.value) : '';
      };
      dueInput.addEventListener('change', paintPreview);
      sheet.el.querySelectorAll('[data-shift]').forEach((b) => {
        b.addEventListener('click', () => { dueInput.value = shiftDays(Number(b.dataset.shift)); paintPreview(); });
      });
      sheet.el.querySelectorAll('[data-months]').forEach((b) => {
        b.addEventListener('click', () => { dueInput.value = shiftMonths(Number(b.dataset.months)); paintPreview(); });
      });
      paintPreview();

      form.querySelector('[data-x="cancel"]').onclick = () => { sheet.close(); resolve(null); };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const amount = global.UI.value(form, 'amount').replace(/\s/g, '');
        const errors = {};
        if (!amount) errors.amount = t('common.required');
        else if (!(Number(amount.replace(/,/g, '')) > 0)) errors.amount = t('chk.badAmount');
        if (!dueInput.value) errors.due_date = t('common.required');
        if (Object.keys(errors).length) return global.UI.showFieldErrors(form, errors);

        const payload = {
          type,
          amount,
          due_date: dueInput.value,
          party_id: global.UI.value(form, 'party_id'),
          check_number: global.UI.value(form, 'check_number'),
          bank_name: global.UI.value(form, 'bank_name'),
          note: global.UI.value(form, 'note'),
        };
        if (isEdit) payload.status = global.UI.value(form, 'status');
        btn.disabled = true;
        try {
          const res = isEdit
            ? await global.API.put(`/checks/${chk.id}`, payload)
            : await global.API.post('/checks', payload);
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

  global.CheckForm = { open: openCheckForm };
})(window);
