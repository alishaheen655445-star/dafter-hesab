// -----------------------------------------------------------------------------
//  Phase 6 test: account settings, and the API answering in the user's language.
//  Needs the server running: npm run dev   (or: node server/server.js)
//  Run with: node scripts/test-phase6.mjs
//
//  Everything this suite touches on the demo account is PUT BACK at the end
//  (name, currency, language, footer, password) — including when an assertion
//  fails, so the screens never open on a half-renamed account.
//
//  Two things are asserted about language: that the reply is NOT the English
//  source text, and that the exact agreed sentence comes out (a message that
//  quietly changed in the table is caught here, not on a phone).
// -----------------------------------------------------------------------------
const BASE = 'http://localhost:3100/api';
const PHONE = '+9647701234567';
const PASSWORD = 'test123';

let token = '';
let pass = 0;
let fail = 0;

const check = (label, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
};

const arabic = (s) => /\p{sc=Arabic}/u.test(String(s || ''));

const call = async (path, { method = 'GET', body, auth = true, lang } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  // Exactly what client/js/api.js does on every request.
  if (lang) headers['X-App-Lang'] = lang;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const getMe = async () => (await call('/auth/me')).json.data?.user || {};

async function main() {
  // 0) login as the demo account --------------------------------------------
  const login = await call('/auth/login', {
    method: 'POST', auth: false, body: { phone: PHONE, password: PASSWORD },
  });
  token = login.json.data?.token || '';
  check('login', !!token);
  if (!token) { console.log('no token — nothing to test'); process.exit(1); }

  const original = await getMe();
  check('GET /auth/me returns the profile', !!original.phone, `name=${original.name}`);
  check('the profile carries the settings fields',
    original.currency !== undefined && original.lang !== undefined && 'footer_text' in original,
    `${original.currency} · ${original.lang}`);

  try {
    // 1) name ---------------------------------------------------------------
    const renamed = await call('/auth/me', { method: 'PUT', body: { name: 'صاحب الدفتر' } });
    check('PUT /auth/me changes the name', renamed.status === 200 && renamed.json.data?.user?.name === 'صاحب الدفتر');

    // An empty name is refused — the row must never go blank.
    const blank = await call('/auth/me', { method: 'PUT', body: { name: '   ' } });
    check('an empty name is refused', blank.status === 422, `status=${blank.status}`);

    // 2) currency -----------------------------------------------------------
    const cur = await call('/auth/me', { method: 'PUT', body: { currency: 'dinar' } });
    check('PUT /auth/me changes the money unit', cur.status === 200 && cur.json.data?.user?.currency === 'dinar');

    const badCur = await call('/auth/me', { method: 'PUT', body: { currency: 'bitcoin' } });
    check('an unknown currency is refused', badCur.status === 422, `status=${badCur.status}`);

    // Every unit the screen offers must be accepted, or the chip is a trap.
    const units = ['toman', 'rial', 'dinar', 'dollar', 'dirham', 'euro', 'afghani'];
    let allOk = true;
    for (const u of units) {
      const r = await call('/auth/me', { method: 'PUT', body: { currency: u } });
      if (r.status !== 200 || r.json.data?.user?.currency !== u) { allOk = false; }
    }
    check('all seven money units are accepted', allOk);

    // 3) language -----------------------------------------------------------
    const fa = await call('/auth/me', { method: 'PUT', body: { lang: 'fa' } });
    check('PUT /auth/me changes the language', fa.status === 200 && fa.json.data?.user?.lang === 'fa');
    const badLang = await call('/auth/me', { method: 'PUT', body: { lang: 'en' } });
    check('an unknown language is refused', badLang.status === 422, `status=${badLang.status}`);

    // 4) footer text reaches the printed report -----------------------------
    const note = 'تسوية آخر الشهر';
    const foot = await call('/auth/me', { method: 'PUT', body: { footer_text: note } });
    check('PUT /auth/me changes the footer text', foot.status === 200 && foot.json.data?.user?.footer_text === note);

    const book = await call('/reports/book');
    check('the footer travels to the report', book.json.data?.report?.user?.footer_text === note,
      book.json.data?.report?.user?.footer_text);
    check('the report carries the name too', book.json.data?.report?.user?.name === 'صاحب الدفتر');

    // A footer longer than the column is refused instead of being cut in silence.
    const longFoot = await call('/auth/me', { method: 'PUT', body: { footer_text: 'ا'.repeat(501) } });
    check('a 501-char footer is refused', longFoot.status === 422, `status=${longFoot.status}`);

    // 5) the password -------------------------------------------------------
    const weak = await call('/auth/password', {
      method: 'PUT', body: { currentPassword: PASSWORD, newPassword: 'abc' },
    });
    check('a 3-letter password is refused', weak.status === 422, `status=${weak.status}`);

    const wrong = await call('/auth/password', {
      method: 'PUT', body: { currentPassword: 'not-it', newPassword: 'secret66' }, lang: 'ar',
    });
    // 422 (NOT 401): a wrong answer here must not end a valid session.
    check('a wrong current password is a field error, not a logout', wrong.status === 422, `status=${wrong.status}`);
    check('it points at the right input', wrong.json.errors?.[0]?.field === 'currentPassword',
      JSON.stringify(wrong.json.errors));
    check('the answer is in arabic', wrong.json.errors?.[0]?.message === 'كلمة المرور الحالية غلط.',
      wrong.json.errors?.[0]?.message);

    const stillIn = await call('/auth/me');
    check('the session survived the typo', stillIn.status === 200, `status=${stillIn.status}`);

    const changed = await call('/auth/password', {
      method: 'PUT', body: { currentPassword: PASSWORD, newPassword: 'secret66' },
    });
    check('the password changes', changed.status === 200, `status=${changed.status}`);

    const reLogin = await call('/auth/login', {
      method: 'POST', auth: false, body: { phone: PHONE, password: 'secret66' },
    });
    check('the new password logs in', reLogin.status === 200 && !!reLogin.json.data?.token);

    const back = await call('/auth/password', {
      method: 'PUT', body: { currentPassword: 'secret66', newPassword: PASSWORD },
    });
    check('the password is put back', back.status === 200);
    const oldLogin = await call('/auth/login', {
      method: 'POST', auth: false, body: { phone: PHONE, password: PASSWORD },
    });
    check('the old password works again', oldLogin.status === 200);
    token = oldLogin.json.data?.token || token; // the change re-issued nothing, but stay honest

    // 6) the API speaks the language it was asked for -----------------------
    const en = await call('/auth/login', {
      method: 'POST', auth: false, body: { phone: PHONE, password: 'wrong-one' },
    });
    check('no header keeps the english source text', en.json.message === 'Invalid phone or password',
      en.json.message);

    const ar = await call('/auth/login', {
      method: 'POST', auth: false, body: { phone: PHONE, password: 'wrong-one' }, lang: 'ar',
    });
    check('arabic login failure', ar.json.message === 'رقم الموبايل أو كلمة المرور غلط.', ar.json.message);

    const faFail = await call('/auth/login', {
      method: 'POST', auth: false, body: { phone: PHONE, password: 'wrong-one' }, lang: 'fa',
    });
    check('persian login failure', faFail.json.message === 'شماره موبایل یا رمز عبور نادرست است.', faFail.json.message);

    const arCur = await call('/auth/me', { method: 'PUT', body: { currency: 'bitcoin' }, lang: 'ar' });
    check('an error from the service layer is translated',
      arCur.status === 422 && arabic(arCur.json.message), arCur.json.message);

    const arField = await call('/parties', { method: 'POST', body: { name: '' }, lang: 'ar' });
    check('a validator field error is translated',
      arField.status === 422 && arabic(arField.json.errors?.[0]?.message),
      arField.json.errors?.[0]?.message);

    const ar404 = await call('/parties/999999', { lang: 'ar' });
    check('a 404 is translated', ar404.status === 404 && arabic(ar404.json.message), ar404.json.message);

    const noToken = await call('/parties', { auth: false, lang: 'fa' });
    check('a missing session is answered in persian',
      noToken.status === 401 && /\p{sc=Arabic}/u.test(noToken.json.message), noToken.json.message);

    const badMode = await call('/backup/import', {
      method: 'POST', body: { snapshot: {}, mode: 'replace' }, lang: 'ar',
    });
    check('restoring without confirm is explained in arabic',
      badMode.status === 422 && badMode.json.errors?.[0]?.message === 'استبدال كل البيانات لازم مع تأكيد.',
      badMode.json.errors?.[0]?.message);

    const badRange = await call('/reports/party/1?from=nope', { lang: 'ar' });
    check('a bad report date is explained in arabic',
      badRange.status === 422 && arabic(badRange.json.errors?.[0]?.message),
      badRange.json.errors?.[0]?.message);

    // A duplicate party name is the one error the screens cannot predict, so it
    // has to come from the server — translated.
    const unique = `طرف اختبار ${Date.now()}`;
    const p1 = await call('/parties', { method: 'POST', body: { name: unique } });
    const pid = p1.json.data?.party?.id;
    check('test party created', !!pid, `id=${pid}`);
    const p2 = await call('/parties', { method: 'POST', body: { name: unique }, lang: 'ar' });
    // A duplicate name is a conflict (409), not a shape error (422).
    check('the duplicate name message is translated',
      p2.status === 409 && p2.json.message === 'عندك طرف بنفس الاسم.', `${p2.status} ${p2.json.message}`);
    if (pid) await call(`/parties/${pid}`, { method: 'DELETE' });
    check('test party removed', !!(await call(`/parties/${pid}`)).json.success === false);
  } finally {
    // 7) leave the account exactly as it was found --------------------------
    const restore = await call('/auth/me', {
      method: 'PUT',
      body: {
        name: original.name,
        currency: original.currency,
        lang: original.lang,
        footer_text: original.footer_text || '',
      },
    });
    const after = await getMe();
    check('the account is restored',
      restore.status === 200 && after.name === original.name
      && after.currency === original.currency && after.lang === original.lang
      && (after.footer_text || '') === (original.footer_text || ''),
      `${after.name} · ${after.currency} · ${after.lang}`);
  }

  console.log(`\nphase6: ${pass}/${pass + fail} assertions`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('suite crashed:', err);
  process.exit(1);
});
