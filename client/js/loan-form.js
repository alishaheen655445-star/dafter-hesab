// -----------------------------------------------------------------------------
//  loan-form.js — the add/edit bottom sheet for a قرض / وام.
//  Type the principal and EITHER the monthly payment or the number of
//  installments — the server works out the missing one and builds the schedule.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  const shiftMonths = (n) => {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /**
   * Add n months to a YYYY-MM-DD, keeping the day when it exists in that month
   * (31 -> 30 in a shorter month). The server builds the real schedule from the
   * start date; this only answers "so when is the last one due?".
   */
  function addMonths(dateStr, n) {
    const base = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
    const d = base
      ? new Date(Number(base[1]), Number(base[2]) - 1, Number(base[3]))
      : new Date();
    const day = d.getDate();
    const out = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
    out.setDate(Math.min(day, lastDay));
    return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, '0')}-${String(out.getDate()).padStart(2, '0')}`;
  }

  /**
   * "1 200,50" -> 1200.5 — the same tolerance the amount boxes already have.
   * Arabic-Indic and Persian digits are folded to ASCII first: a number read
   * aloud by the keyboard of a phone arrives as «۱۲۰۰», and it is still 1200.
   */
  const parseNum = (v) => {
    const latin = String(v)
      .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
      .replace(/[\u066B\u066C]/g, (c) => (c === '\u066C' ? '.' : ','));
    const n = Number(latin.replace(/[\s,]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };

  /**
   * The calculator block inside the create sheet. Two of the three numbers are
   * always known (the principal from the sheet), so typing EITHER the monthly
   * payment or the count gives the other one back, the last installment, and the
   * month the loan ends — in this language's calendar.
   */
  function wireCalc(form, sheet) {
    const box = form.querySelector('#calc-box');
    const out = form.querySelector('#calc-out');
    const cMonthly = form.elements.c_monthly;
    const cCount = form.elements.c_count;
    const principal = form.elements.principal;
    const startDate = form.elements.start_date;

    function paint() {
      const P = parseNum(principal.value);
      const M = parseNum(cMonthly.value);
      const N = parseNum(cCount.value);
      if (!(P > 0)) { out.textContent = global.I18n.t('calc.needPrincipal'); out.className = 'calc-out bad'; return; }
      if (!(M > 0) && !(N > 0)) { out.textContent = global.I18n.t('calc.pickOne'); out.className = 'calc-out'; return; }

      let monthly;
      let count;
      if (M > 0) { monthly = M; count = Math.ceil(P / M); }
      // Rounded UP so the plan never ends short: the server puts the difference
      // on the last installment either way, this one only suggests the shape.
      else { count = Math.round(N); monthly = Math.ceil((P / count) * 100) / 100; }

      if (count > 600 || count < 1) {
        out.textContent = global.I18n.t('calc.tooMany', { n: global.UI.num(count) });
        out.className = 'calc-out bad';
        return;
      }
      const lastMinor = Math.round(P * 100) - Math.round(monthly * 100) * (count - 1);
      const last = lastMinor > 0 ? lastMinor : Math.round(monthly * 100);
      const end = addMonths(startDate && startDate.value, count - 1);
      out.className = 'calc-out';
      out.textContent = global.I18n.t('calc.result', {
        monthly: global.UI.money(Math.round(monthly * 100), { withUnit: false }),
        count: global.UI.num(count),
        last: global.UI.money(last, { withUnit: false }),
        end: global.UI.formatDateLong(end),
      });
    }

    form.querySelector('#btn-calc').addEventListener('click', () => {
      box.hidden = !box.hidden;
      if (!box.hidden) { paint(); cMonthly.focus(); }
    });
    [cMonthly, cCount].forEach((el) => el.addEventListener('input', paint));
    principal.addEventListener('input', () => { if (!box.hidden) paint(); });

    sheet.el.querySelector('[data-c="close"]').onclick = () => { box.hidden = true; };
    sheet.el.querySelector('[data-c="apply"]').onclick = () => {
      const P = parseNum(principal.value);
      const M = parseNum(cMonthly.value);
      const N = parseNum(cCount.value);
      if (!(P > 0)) return;
      if (M > 0) {
        cMonthly.value = '';
        form.elements.monthly_payment.value = String(M);
        form.elements.total_installments.value = String(Math.min(600, Math.ceil(P / M)));
      } else if (N > 0) {
        const count = Math.min(600, Math.round(N));
        form.elements.monthly_payment.value = String(Math.ceil((P / count) * 100) / 100);
        form.elements.total_installments.value = String(count);
      }
      box.hidden = true;
      global.UI.toast(global.I18n.t('calc.applied'), 'ok');
    };
  }

  /**
   * @param {object|null} loan  existing row to edit, or null to create
   * @returns {Promise<object|null>} { loan, installments } or null if cancelled
   */
  function openLoanForm(loan = null) {
    const isEdit = !!loan;
    const t = (k, v) => global.I18n.t(k, v);
    let type = isEdit ? loan.type : 'received';
    // Editing cannot rebuild the schedule (installments may already be paid), so
    // the sheet switches to notes / party / status only.
    const startValue = isEdit ? String(loan.start_date).slice(0, 10) : shiftMonths(0);
    const unit = t('cur.' + ((global.Auth.user() || {}).currency || 'toman'));

    return new Promise((resolve) => {
      const sheet = global.UI.modal(
        isEdit ? t('loan.edit') : t('loan.new'),
        `
        ${isEdit ? '' : `
        <div class="seg" id="loan-types">
          <button type="button" data-type="received" class="active">${t('loan.received')}</button>
          <button type="button" data-type="given">${t('loan.given')}</button>
        </div>`}
        <form id="loan-form" novalidate>
          ${isEdit ? '' : `
          <label class="fld">
            <span class="lbl">${t('loan.principal')}</span>
            <input type="text" name="principal" inputmode="decimal" required placeholder="0" />
            <span class="suffix">${unit}</span>
            <em class="err-text" data-err-for="principal"></em>
          </label>
          <div class="fld pair">
            <label class="fld">
              <span class="lbl">${t('loan.monthly')}</span>
              <input type="text" name="monthly_payment" inputmode="decimal" placeholder="0" />
              <em class="err-text" data-err-for="monthly_payment"></em>
            </label>
            <label class="fld">
              <span class="lbl">${t('loan.count')}</span>
              <input type="number" name="total_installments" min="1" max="600" inputmode="numeric" placeholder="12" />
              <em class="err-text" data-err-for="total_installments"></em>
            </label>
          </div>
          <p class="muted" style="margin:-6px 0 12px;font-size:12px">${t('loan.planHint')}</p>
          <!-- The installment calculator («محاسبه قسط» in the paid app): it fills
               the two boxes above, it does not invent a second place to store a
               plan, so the loan that is saved is exactly the one the server plans. -->
          <div class="row" style="margin:-4px 0 10px">
            <button type="button" class="btn sm secondary" id="btn-calc">${t('calc.open')}</button>
          </div>
          <div class="calc" id="calc-box" hidden>
            <div class="fld pair">
              <label class="fld">
                <span class="lbl">${t('loan.monthly')}</span>
                <input type="text" name="c_monthly" inputmode="decimal" placeholder="0" />
              </label>
              <label class="fld">
                <span class="lbl">${t('loan.count')}</span>
                <input type="number" name="c_count" min="1" max="600" inputmode="numeric" placeholder="12" />
              </label>
            </div>
            <p class="calc-out" id="calc-out"></p>
            <div class="row" style="gap:8px">
              <button type="button" class="btn sm" data-c="apply">${t('calc.apply')}</button>
              <button type="button" class="btn sm ghost" data-c="close">${t('calc.close')}</button>
            </div>
          </div>
          <label class="fld">
            <span class="lbl">${t('loan.start')}</span>
            <input type="date" name="start_date" required value="${startValue}" />
            <em class="err-text" data-err-for="start_date"></em>
            <span class="date-preview"></span>
          </label>`}
          <label class="fld">
            <span class="lbl">${t('loan.party')}</span>
            <select name="party_id"><option value="">${t('loan.noParty')}</option></select>
          </label>
          ${isEdit ? `
          <label class="fld">
            <span class="lbl">${t('loan.status')}</span>
            <select name="status">
              ${['active', 'completed', 'cancelled'].map((s) => `<option value="${s}"${s === loan.status ? ' selected' : ''}>${t('loan.st_' + s)}</option>`).join('')}
            </select>
          </label>` : ''}
          <label class="fld">
            <span class="lbl">${t('loan.note')}</span>
            <input type="text" name="note" maxlength="2000"
                   value="${global.UI.escapeHtml(loan?.note || '')}" />
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
              await global.PartySelect.options(loan?.party_id, t('loan.noParty'));
            const first = el.querySelector('input[name="principal"]');
            if (first) first.focus();
          },
        }
      );

      const form = sheet.el.querySelector('#loan-form');
      const startDate = form.elements.start_date;

      // The native picker is Gregorian; show the same day the way this language
      // reads it, so a Jalali user is never guessing at a foreign date.
      const preview = startDate ? form.querySelector('.date-preview') : null;
      const paintPreview = () => {
        if (preview) preview.textContent = startDate.value ? global.UI.formatDateLong(startDate.value) : '';
      };
      if (startDate) startDate.addEventListener('change', paintPreview);
      paintPreview();

      if (!isEdit) {
        const seg = sheet.el.querySelector('#loan-types');
        seg.querySelectorAll('button').forEach((b) => {
          b.addEventListener('click', () => {
            type = b.dataset.type;
            seg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
          });
        });
        wireCalc(form, sheet);
      }

      form.querySelector('[data-x="cancel"]').onclick = () => { sheet.close(); resolve(null); };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const errors = {};
        const payload = {
          party_id: global.UI.value(form, 'party_id'),
          note: global.UI.value(form, 'note'),
        };
        if (isEdit) {
          payload.status = global.UI.value(form, 'status');
        } else {
          const principal = global.UI.value(form, 'principal').replace(/\s/g, '');
          const monthly = global.UI.value(form, 'monthly_payment').replace(/\s/g, '');
          const count = global.UI.value(form, 'total_installments');
          if (!principal) errors.principal = t('common.required');
          else if (!(Number(principal.replace(/,/g, '')) > 0)) errors.principal = t('loan.badPrincipal');
          if (!monthly && !count) {
            errors.monthly_payment = t('loan.noPlan');
            errors.total_installments = t('loan.noPlan');
          }
          if (!startDate.value) errors.start_date = t('common.required');
          if (Object.keys(errors).length) return global.UI.showFieldErrors(form, errors);
          payload.type = type;
          payload.principal = principal;
          payload.start_date = startDate.value;
          if (monthly) payload.monthly_payment = monthly;
          if (count) payload.total_installments = Number(count);
        }

        btn.disabled = true;
        try {
          const res = isEdit
            ? await global.API.put(`/loans/${loan.id}`, payload)
            : await global.API.post('/loans', payload);
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

  global.LoanForm = { open: openLoanForm };
})(window);
