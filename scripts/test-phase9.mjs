// -----------------------------------------------------------------------------
//  Phase 9 test: the things the reference app locks behind «نسخه کامل» — and that
//  are simply part of the book here: an app lock, automatic server copies, and
//  closing a party's account in one press.
//
//  Needs the server running (npm run dev) and the schema migrated
//  (npm run db:migrate) — the two new columns are what these endpoints write.
//  Run with: node scripts/test-phase9.mjs
//
//  The last group reads the CLIENT source instead of the server: a screen that
//  only breaks when someone opens it (a missing script tag, a button with no
//  handler, a class with no CSS) is caught there, without a browser.
// -----------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

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
const persian = (s) => /\p{sc=Arabic}/u.test(String(s || '')) && /ی|ک|ه|ر/.test(String(s || ''));

const call = async (path, { method = 'GET', body, auth = true, lang = 'en' } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (lang && lang !== 'en') headers['X-App-Lang'] = lang;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const getMe = async () => (await call('/auth/me')).json.data?.user || {};

/** The download route streams the FILE, not the usual JSON envelope. */
const raw = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  return { status: res.status, text, type: res.headers.get('content-type') || '' };
};

// =============================================================================
//  1. the app lock
// =============================================================================
async function lockTests() {
  const PIN = '4321';

  // A fresh account has no code, and the profile only says WHETHER there is one.
  const bare = await getMe();
  check('GET /auth/me exposes has_pin', bare.has_pin === false || bare.has_pin === true,
    `has_pin=${bare.has_pin}`);
  check('the profile never carries the code itself', !('pin_hash' in bare),
    Object.keys(bare).join(','));

  if (bare.has_pin) {
    // A previous failed run left a code behind — take it off before starting.
    await call('/auth/pin', { method: 'PUT', body: { pin: null, password: PASSWORD } });
  }
  check('the account starts unlocked', (await getMe()).has_pin === false);

  // Unlocking an account that has no lock is a plain 422, not a guessable secret.
  const noLock = await call('/auth/pin/unlock', { method: 'POST', body: { pin: PIN }, lang: 'ar' });
  check('unlock without a lock is refused', noLock.status === 422, `status=${noLock.status}`);
  check('and the answer is arabic', noLock.json.message === 'هاد الحساب ما فيه رمز قفل.', noLock.json.message);

  // --- setting a code needs the password, not the code ---------------------
  const wrongProof = await call('/auth/pin', {
    method: 'PUT', body: { pin: PIN, password: 'not-the-password' }, lang: 'ar',
  });
  // 422 and NOT 401: one typo in a settings sheet must not end a good session.
  check('a wrong password is a field error, not a logout', wrongProof.status === 422,
    `status=${wrongProof.status}`);
  check('it points at the password input', wrongProof.json.errors?.[0]?.field === 'password',
    JSON.stringify(wrongProof.json.errors));
  check('the message is translated', wrongProof.json.message === 'كلمة المرور الحالية غلط.',
    wrongProof.json.message);
  check('the session survived the typo', (await call('/auth/me')).status === 200);
  check('and no code was stored', (await getMe()).has_pin === false);

  // Shape rules — anything that is not 4-8 digits cannot become a code.
  for (const bad of ['123', '123456789', 'abcd', '12a4']) {
    const r = await call('/auth/pin', { method: 'PUT', body: { pin: bad, password: PASSWORD }, lang: 'ar' });
    check(`a code of "${bad}" is refused`, r.status === 422 && arabic(r.json.message),
      `${r.status} ${r.json.message}`);
  }
  check('no code was stored by the rejected attempts', (await getMe()).has_pin === false);

  // --- put a real code on --------------------------------------------------
  const set = await call('/auth/pin', { method: 'PUT', body: { pin: PIN, password: PASSWORD } });
  check('a 4-digit code is accepted', set.status === 200 && set.json.data?.has_pin === true,
    `${set.status} ${JSON.stringify(set.json.data)}`);
  check('GET /auth/me now says the app is locked', (await getMe()).has_pin === true);

  // The stored value must be a hash: the right code passes, a near miss does not.
  const good = await call('/auth/pin/unlock', { method: 'POST', body: { pin: PIN } });
  check('the right code unlocks', good.status === 200 && good.json.data?.unlocked === true,
    `${good.status} ${good.json.message}`);
  const bad = await call('/auth/pin/unlock', { method: 'POST', body: { pin: '1234' }, lang: 'ar' });
  check('a wrong code is refused', bad.status === 422 && bad.json.message === 'الرمز غلط.',
    `${bad.status} ${bad.json.message}`);
  const faBad = await call('/auth/pin/unlock', { method: 'POST', body: { pin: '1234' }, lang: 'fa' });
  check('and answered in persian when asked', faBad.status === 422 && persian(faBad.json.message),
    faBad.json.message);

  // Changing the code is allowed with the password and needs no old code.
  const changed = await call('/auth/pin', { method: 'PUT', body: { pin: '11223344', password: PASSWORD } });
  check('a longer code can replace it', changed.status === 200 && changed.json.data?.has_pin === true);
  check('the new code works', (await call('/auth/pin/unlock', {
    method: 'POST', body: { pin: '11223344' },
  })).status === 200);
  check('the old code is gone', (await call('/auth/pin/unlock', { method: 'POST', body: { pin: PIN } })).status === 422);

  // --- the guard against guessing ----------------------------------------
  // Five wrong tries lock the CHECK (not the account) for a minute. Setting the
  // code again clears the counter — it protects the door, not the test run — so
  // the group below starts from zero and tips over exactly on the fifth attempt.
  await call('/auth/pin', { method: 'PUT', body: { pin: '11223344', password: PASSWORD } });
  let refused = 0;
  let lastStatus = 0;
  for (let i = 0; i < 5; i++) {
    const r = await call('/auth/pin/unlock', { method: 'POST', body: { pin: '9999' } });
    if (r.status === 422) refused += 1;
    lastStatus = r.status;
  }
  check('wrong codes keep answering 422 for a while', refused >= 4, `${refused} × 422`);
  check('the fifth attempt tips into a cooldown', lastStatus === 429, `status=${lastStatus}`);
  const cooled = await call('/auth/pin/unlock', { method: 'POST', body: { pin: '11223344' }, lang: 'ar' });
  check('even the right code waits out the cooldown', cooled.status === 429, `${cooled.status} ${cooled.json.message}`);
  check('the cooldown answer is translated', cooled.json.message === 'محاولات غلط كثيرة — انتظر شوي وجرب.',
    cooled.json.message);

  // Switching the lock off clears the counter — the password is enough proof.
  const off = await call('/auth/pin', { method: 'PUT', body: { pin: null, password: PASSWORD } });
  check('the code can be removed', off.status === 200 && off.json.data?.has_pin === false,
    `${off.status} ${JSON.stringify(off.json.data)}`);
  check('the profile says unlocked again', (await getMe()).has_pin === false);
  const afterOff = await call('/auth/pin/unlock', { method: 'POST', body: { pin: '11223344' } });
  check('and removing it ended the cooldown', afterOff.status === 422
    && afterOff.json.message === 'This account has no lock code', `${afterOff.status} ${afterOff.json.message}`);
}

// =============================================================================
//  2. automatic copies on the server
// =============================================================================
async function backupTests() {
  const before = await call('/backup/online');
  check('the copy list answers', before.status === 200, `status=${before.status}`);
  const meta0 = before.json.meta || {};
  check('the list separates the two kinds',
    typeof meta0.auto === 'number' && typeof meta0.manual === 'number',
    `auto=${meta0.auto} manual=${meta0.manual}`);
  check('and publishes the quotas', meta0.keep_auto === 5 && meta0.keep_manual >= 10,
    `keep_auto=${meta0.keep_auto} keep_manual=${meta0.keep_manual}`);

  const manualBefore = meta0.manual;
  const created = [];

  // A background copy says so, and lands in the auto group.
  const first = await call('/backup/online', { method: 'POST', body: { kind: 'auto' } });
  check('an automatic copy is stored', first.status === 201 && first.json.data?.backup?.kind === 'auto',
    `${first.status} ${JSON.stringify(first.json.data?.backup)}`);
  if (first.json.data?.backup?.id) created.push(first.json.data.backup.id);

  // No kind at all still means "the user pressed the button".
  const plain = await call('/backup/online', { method: 'POST', body: {} });
  check('a copy without a kind is manual', plain.status === 201 && plain.json.data?.backup?.kind === 'manual',
    `${plain.status} ${plain.json.data?.backup?.kind}`);
  if (plain.json.data?.backup?.id) created.push(plain.json.data.backup.id);

  const badKind = await call('/backup/online', { method: 'POST', body: { kind: 'hourly' }, lang: 'ar' });
  check('an unknown kind is refused', badKind.status === 422, `status=${badKind.status}`);
  check('with a translated reason',
    badKind.json.errors?.[0]?.message === 'نوع النسخة لازم auto أو manual.',
    JSON.stringify(badKind.json.errors));

  // Six more automatic copies: the newest five survive, the manual history does
  // not move by one row. This is the whole point of splitting the quota.
  for (let i = 0; i < 5; i++) {
    const r = await call('/backup/online', { method: 'POST', body: { kind: 'auto' } });
    if (r.json.data?.backup?.id) created.push(r.json.data.backup.id);
  }
  const mid = await call('/backup/online');
  const meta1 = mid.json.meta || {};
  check('only five automatic copies are kept', meta1.auto === 5, `auto=${meta1.auto}`);
  check('the manual copies were not touched', meta1.manual === manualBefore + 1,
    `manual ${manualBefore} → ${meta1.manual}`);
  const kinds = new Set((mid.json.data?.backups || []).map((b) => b.kind));
  check('every row in the list carries its kind', kinds.has('auto') && kinds.has('manual'),
    [...kinds].join(','));

  // An automatic copy is a normal copy: it can be downloaded and restored.
  const autoRow = (mid.json.data?.backups || []).find((b) => b.kind === 'auto');
  const dl = await raw(`/backup/online/${autoRow.id}/download`);
  const snap = (() => { try { return JSON.parse(dl.text); } catch (_e) { return {}; } })();
  check('an automatic copy can be downloaded', dl.status === 200 && snap.app === 'daftar-hesab',
    `status=${dl.status} type=${dl.type}`);
  check('the file is a real snapshot', Array.isArray(snap.data?.parties) && snap.version === 1,
    `parties=${snap.data?.parties?.length}`);
  check('the snapshot counts the live book',
    Number(snap.counts?.parties) === Number(first.json.data?.counts?.parties),
    JSON.stringify(snap.counts));

  // Leave nothing of ours behind. The auto count cannot be compared with the one
  // we started from: the six copies this test made pushed the older automatic ones
  // out of the newest-five window — that is the feature working, not a leak.
  for (const id of created) await call(`/backup/online/${id}`, { method: 'DELETE' });
  const after = await call('/backup/online');
  const meta2 = after.json.meta || {};
  const stillOurs = (after.json.data?.backups || []).filter((b) => created.includes(b.id));
  check('the test copies are cleaned up', stillOurs.length === 0 && meta2.manual === manualBefore,
    `left=${stillOurs.length} auto=${meta2.auto} manual ${manualBefore} → ${meta2.manual}`);
}

// =============================================================================
//  3. settling an account
// =============================================================================
async function settleTests() {
  // The sums of the whole book BEFORE this fixture exists. Everything this
  // function writes is deleted at the end, so the book must read exactly the
  // same afterwards — money and reminders both.
  const bookBefore = (await call('/parties')).json.meta || {};
  const now = new Date(Date.now() + 3600e3).toISOString().slice(0, 19).replace('T', ' ');
  const remBefore = (await call(`/reminders?now=${encodeURIComponent(now)}`)).json.meta || {};
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const name = `تسوية اختبار ${Date.now()}`;
  const made = await call('/parties', { method: 'POST', body: { name } });
  const pid = made.json.data?.party?.id;
  check('test party created', !!pid, `id=${pid}`);
  if (!pid) return;
  let remId = null;

  try {
    // owed 12.500 → balance on the credit side
    const t1 = await call(`/parties/${pid}/transactions`, {
      method: 'POST', body: { type: 'credit', amount: '12500', description: 'طلب' },
    });
    check('a credit entry lands', t1.status === 201, `status=${t1.status}`);
    const bal = Number(t1.json.data?.party?.balance_minor);
    check('the balance is what was owed', bal > 0, `balance_minor=${bal}`);

    const settled = await call(`/parties/${pid}/settle`, {
      method: 'POST', body: { description: 'تسوية الحساب' },
    });
    const d = settled.json.data || {};
    check('settling answers 201', settled.status === 201, `${settled.status} ${settled.json.message}`);
    check('it writes ONE closing entry', d.transaction?.amount_minor === bal,
      `closed ${d.transaction?.amount_minor} of ${bal}`);
    check('on the opposite side', d.transaction?.type === 'debit', d.transaction?.type);
    check('and tells the screen what it closed', d.closed_minor === bal, `closed_minor=${d.closed_minor}`);
    check('the account now reads zero', Number(d.party?.balance_minor) === 0,
      `balance_minor=${d.party?.balance_minor}`);
    check('the wording the screen sent is what is stored', d.transaction?.description === 'تسوية الحساب',
      d.transaction?.description);

    const st = await call(`/parties/${pid}/transactions`);
    check('the statement shows both rows', st.json.data?.transactions?.length === 2,
      `count=${st.json.meta?.count}`);
    check('and the running balance ends at zero',
      Number(st.json.meta?.window_balance_minor) === 0, `window=${st.json.meta?.window_balance_minor}`);

    // Nothing left to close — said in the user's language, as a 422 the form can show.
    const again = await call(`/parties/${pid}/settle`, { method: 'POST', body: {}, lang: 'ar' });
    check('settling twice is refused', again.status === 422, `status=${again.status}`);
    check('with a clear arabic reason', again.json.message === 'حساب هذا مسوّى أصلاً — الرصيد صفر.',
      again.json.message);

    // A garbage date is a field error, never a silent "today".
    const badDate = await call(`/parties/${pid}/settle`, {
      method: 'POST', body: { txn_date: 'not-a-date' }, lang: 'ar',
    });
    check('a bad settle date is refused', badDate.status === 422 && arabic(badDate.json.errors?.[0]?.message),
      JSON.stringify(badDate.json.errors));

    // The other direction: the owner owes, so the closing entry is a credit.
    const t2 = await call(`/parties/${pid}/transactions`, {
      method: 'POST', body: { type: 'debit', amount: '4000', description: 'بدهي' },
    });
    const owed = Number(t2.json.data?.party?.balance_minor);
    check('a debit entry puts the balance the other way', owed < 0, `balance_minor=${owed}`);
    const settle2 = await call(`/parties/${pid}/settle`, { method: 'POST', body: {} });
    check('settling the other way works too', settle2.status === 201
      && settle2.json.data?.transaction?.type === 'credit'
      && Number(settle2.json.data?.party?.balance_minor) === 0,
      `${settle2.json.data?.transaction?.type} ${settle2.json.data?.party?.balance_minor}`);
    check('a settle with no body keeps the server wording',
      settle2.json.data?.transaction?.description === 'Settlement',
      settle2.json.data?.transaction?.description);

    // An unknown party is the same 404 every other party route gives.
    const ghost = await call('/parties/999999/settle', { method: 'POST', body: {}, lang: 'ar' });
    check('settling a missing party is a 404', ghost.status === 404 && arabic(ghost.json.message),
      `${ghost.status} ${ghost.json.message}`);

    // A settlement is an ordinary row: deleting it reopens the account.
    const sid = settle2.json.data?.transaction?.id;
    const del = await call(`/parties/${pid}/transactions/${sid}`, { method: 'DELETE' });
    check('the closing entry can be undone', del.status === 200 && Number(del.json.data?.party?.balance_minor) !== 0,
      `balance_minor=${del.json.data?.party?.balance_minor}`);

    // A reminder that belongs to THIS book, overdue on purpose — it is the row
    // that would keep firing about an account that no screen can open again.
    const rem = await call('/reminders', {
      method: 'POST', body: { title: 'تذكير مع الحساب', remind_at: yesterday, party_id: pid },
    });
    remId = rem.json.data?.reminder?.id || null;
    check('a reminder can be attached to the account', !!remId, `id=${remId}`);
    const liveRem = (await call(`/reminders/due?now=${encodeURIComponent(now)}`)).json.data?.reminders || [];
    check('and it is due while the account is open', liveRem.some((r) => r.id === remId), `n=${liveRem.length}`);
  } finally {
    await call(`/parties/${pid}`, { method: 'DELETE' });
    const gone = await call(`/parties/${pid}`);
    check('test party removed', gone.status === 404, `status=${gone.status}`);
  }

  // --- what a deleted party has to take with it -------------------------------
  // The fixture wrote 16.500 on each side and netted nothing: if the rows under
  // it stayed live, the whole-book sums would be heavier than before it began.
  const bookAfter = (await call('/parties')).json.meta || {};
  check('deleting the party takes its money out of the book sums',
    Number(bookAfter.total_credit_minor) === Number(bookBefore.total_credit_minor ?? 0)
    && Number(bookAfter.total_debit_minor) === Number(bookBefore.total_debit_minor ?? 0),
    `credit ${bookBefore.total_credit_minor}→${bookAfter.total_credit_minor}, `
    + `debit ${bookBefore.total_debit_minor}→${bookAfter.total_debit_minor}`);

  const remList = (await call(`/reminders?now=${encodeURIComponent(now)}`)).json;
  check('the closed account stops being a name a reminder carries',
    !(remList.data?.reminders || []).some((r) => r.id === remId)
    && !remList.data?.reminders?.some((r) => r.party_name === name),
    `count=${remList.meta?.count}`);
  const remDue = (await call(`/reminders/due?now=${encodeURIComponent(now)}`)).json.data?.reminders || [];
  check('and its reminder no longer fires', !remDue.some((r) => r.id === remId), `n=${remDue.length}`);

  if (remId) await call(`/reminders/${remId}`, { method: 'DELETE' });
  const remEnd = (await call(`/reminders?now=${encodeURIComponent(now)}`)).json.meta || {};
  check('the fixture leaves the reminder counters as it found them',
    Number(remEnd.count) === Number(remBefore.count) && Number(remEnd.due_count) === Number(remBefore.due_count),
    `count ${remBefore.count}→${remEnd.count}, due ${remBefore.due_count}→${remEnd.due_count}`);
}

// =============================================================================
//  4. the client: the screens that carry these features
// =============================================================================
// The signed-in screens must all load the background copier; index.html (login)
// and lock.html (the door) must not — neither has an open session to copy.
const SCREENS = ['home', 'party', 'checks', 'loans', 'reminders', 'report', 'backup', 'settings', 'support'];

function clientTests() {
  // --- the code pad -----------------------------------------------------------
  check('lock.html and js/lock.js exist', exists('client/lock.html') && exists('client/js/lock.js'));
  const lockHtml = exists('client/lock.html') ? read('client/lock.html') : '';
  const lockJs = exists('client/js/lock.js') ? read('client/js/lock.js') : '';
  // The digits follow the language (٤ / ۴), so they are painted, never written.
  check('the pad itself is empty in the markup', /id="keypad"[^>]*><\/div>/.test(lockHtml) && !/<button[^>]*data-k=/.test(lockHtml));
  check('lock.js paints the digits through UI.num', /function paintPad[\s\S]{0,400}UI\.num\(/.test(lockJs));
  check('lock.js asks the unlock route and nothing else', /API\.post\('\/auth\/pin\/unlock'/.test(lockJs) && !/API\.post\('\/auth\/login'/.test(lockJs));
  check('the pad never submits at four digits', !/if \(code\.length === MIN\)/.test(lockJs) && /showError\(t\('lock\.tooShort'\)/.test(lockJs));
  check('lock.js reads the session before the door', /Auth\.isLoggedIn\(\)/.test(lockJs) && /location\.replace\('index\.html'\)/.test(lockJs));

  // --- the gate that sends a reader to the pad --------------------------------
  const apiJs = read('client/js/api.js');
  check('Auth.locked() reads the account and the tab', /locked\(\) \{[\s\S]{0,160}u\.has_pin[\s\S]{0,60}ss\.get\(UNLOCKED\)/.test(apiJs));
  check('require() sends the reader to lock.html with a way back', /lock\.html\?back=/.test(apiJs) && /encodeURIComponent\(back\)/.test(apiJs));
  check('the unlock flag dies with the tab', /sessionStorage\.setItem/.test(apiJs) && /UNLOCKED = 'dh_unlocked'/.test(apiJs));
  check('logout clears the unlock flag', /logout\(redirect[\s\S]{0,200}ss\.del\(UNLOCKED\)/.test(apiJs));
  check('a fresh session has not passed the pad', /setSession\([\s\S]{0,240}user\.has_pin\) ss\.del\(UNLOCKED\)/.test(apiJs));
  check('every write tells the copier, copies excluded', /dispatchEvent\(new CustomEvent\('dh:written'/.test(apiJs) && /method !== 'GET' && !String\(path\)\.startsWith\('\/backup'\)/.test(apiJs));

  // --- the background copier --------------------------------------------------
  const ab = read('client/js/autobackup.js');
  check('it asks for an automatic kind only', /post\('\/backup\/online', \{ kind: 'auto' \}\)/.test(ab));
  check('a write is debounced and copies never stack', /DEBOUNCE_MS = 15 \* 1000/.test(ab) && /MIN_GAP_MS = 3 \* 60 \* 1000/.test(ab) && /if \(\!global\.Auth\.isLoggedIn\(\) \|\| \!enabled\(\) \|\| running\) return false/.test(ab));
  check('it never shouts: a failed copy is swallowed', /catch \(_err\)/.test(ab) && !/UI\.toast/.test(ab));
  for (const s of SCREENS) {
    check(`${s}.html loads the copier`, read(`client/${s}.html`).includes('js/autobackup.js'));
  }
  for (const s of ['index', 'lock']) {
    check(`${s}.html does not copy (no open session)`, !read(`client/${s}.html`).includes('js/autobackup.js'));
  }
  // The list must not pretend the app's own copies were pressed by the user.
  const bakJs = read('client/js/backup.js');
  check('the copy list marks the automatic ones', /c\.kind === 'auto'/.test(bakJs) && /t\('bak\.auto'\)/.test(bakJs));

  // --- a deleted party closes its own book ----------------------------------
  const pSvc = read('server/services/partyService.js');
  const pModel = read('server/models/partyModel.js');
  check('deleting a party soft-deletes its money rows too',
    /softDelete\(userId, id\)[\s\S]{0,160}softDeleteLedger\(userId, id\)/.test(pSvc)
    && /UPDATE transactions \$\{tail\}/.test(pModel) && /UPDATE checks \$\{tail\}/.test(pModel)
    && /UPDATE loans \$\{tail\}/.test(pModel), 'party delete must not leave live rows under a dead party');
  check('the cascade keeps the flag, it does not erase history',
    /SET deleted_at = CURRENT_TIMESTAMP/.test(pModel) && !/DELETE FROM transactions/.test(pModel));

  // --- settlement on the party screen ----------------------------------------
  const partyJs = read('client/js/party.js');
  check('the settle tile sits among the quick actions', /tile\('settle', 'settle', t\('party\.settle'\)\)/.test(partyJs) && /act === 'settle'/.test(partyJs));
  check('settleSheet posts to the settle route only', /API\.post\(`\/parties\/\$\{id\}\/settle`/.test(partyJs));
  check('the reader is told what is being closed', /t\('party\.settleBody', \{[\s\S]{0,120}side:[\s\S]{0,120}amount:/.test(partyJs));
  check('an already settled account never opens the sheet', /if \(!amount\) \{ UI\.toast\(t\('party\.settledAlready'\)/.test(partyJs));
  check('the sheet hands the server a date and a wording, no amount', /txn_date: dateEl\.value[\s\S]{0,200}description: t\('party\.settleDesc'\)/.test(partyJs) && !/settle`[\s\S]{0,200}amount:/.test(partyJs));
  // The note written once on the file must be readable on the screen, not only
  // inside the edit sheet — and it needs a rule of its own, because .ph is LTR.
  check('the header card shows the party note when there is one', /p\.note \? `<div class="nt">/.test(partyJs));

  // --- the installment calculator -------------------------------------------
  const loanJs = read('client/js/loan-form.js');
  // A second UI.modal() would close the loan sheet it sits inside — so it has to
  // be an expander, and an expander has to write into the real fields.
  check('the calculator is an expander, not a second sheet', /id="calc-box"/.test(loanJs) && !/modal\(t\('calc\.open'/.test(loanJs));
  check('apply writes the two real fields', /elements\.monthly_payment\.value =[\s\S]{0,400}elements\.total_installments\.value =/.test(loanJs));
  // The boxes are suggestions: the payload is still built from the real fields,
  // so a calculator box can never reach the server as a loan column.
  check('the calculator boxes are never sent to the server', !/payload\.c_/.test(loanJs) && !/c_monthly:/.test(loanJs) && /name="c_monthly"/.test(loanJs) && /payload\.monthly_payment = monthly/.test(loanJs));
  check('either number gives the other one back', /if \(M > 0\) \{ monthly = M; count = Math\.ceil\(P \/ M\); \}/.test(loanJs) && /monthly = Math\.ceil\(\(P \/ count\) \* 100\) \/ 100/.test(loanJs));
  check('a plan longer than 600 is refused, not rounded', /count > 600[\s\S]{0,200}calc\.tooMany/.test(loanJs));

  // --- settings: the lock row, the switch, the benefits card ----------------
  const setHtml = read('client/settings.html');
  const setJs = read('client/js/settings.js');
  check('settings offers the lock and the switch, not a price', /id="btn-lock-row"/.test(setHtml) && /id="ab-row"/.test(setHtml) && /id="benefits"/.test(setHtml));
  check('settings links out to the support page', /href="support\.html"/.test(setHtml));
  check('the lock sheet pays with the account password', /API\.put\('\/auth\/pin', patch\)/.test(setJs) && /write\(\{ password, pin \}/.test(setJs) && /write\(\{ password, pin: null \}/.test(setJs));
  check('setting a code keeps this tab open', /Auth\.markUnlocked\(\)/.test(setJs));
  check('the switch is remembered on the device, not the account', /AutoBackup\.setEnabled\(on\)/.test(setJs) && !/\/auth\/me[\s\S]{0,80}auto/.test(setJs));
  check('the copier speaks through the stamp only', /addEventListener\('dh:autobackup', \(\) => paintAuto\(\)\)/.test(setJs));
  check('the benefits card reads the same keys as the support page', /\['f1', 'cloud-up'\][\s\S]{0,200}\['f6', 'image'\]/.test(setJs) && /t\('sup\.' \+ k\)/.test(setJs));

  // --- the support page ------------------------------------------------------
  check('support.html and js/support.js exist', exists('client/support.html') && exists('client/js/support.js'));
  const supHtml = exists('client/support.html') ? read('client/support.html') : '';
  check('all four paid pages are here as sections', /sup\.about"/.test(supHtml) && /sup\.guide"/.test(supHtml) && /sup\.privacy"/.test(supHtml) && /sup\.share"/.test(supHtml));
  check('the guide walks seven steps', (supHtml.match(/data-i18n="sup\.step\d"/g) || []).length === 7);
  check('the privacy list says four true things', (supHtml.match(/data-i18n="sup\.p\d"/g) || []).length === 4);
  check('the unlocked list is painted, not typed twice', /id="sup-free"/.test(supHtml) && /FEATURES = \['f1', 'f2', 'f3', 'f4', 'f5', 'f6'\]/.test(read('client/js/support.js')));
  const supJs = read('client/js/support.js');
  check('share falls back to copy when the browser has no sheet', /typeof nav\.share === 'function'/.test(supJs) && /copyText\(shareText\(\)\)/.test(supJs));
  check('support.js needs an open session like every other screen', /Auth\.require\(\)/.test(supJs));

  // --- the stylesheet has to answer all of it -------------------------------
  const css = read('client/css/styles.css');
  for (const cls of ['pin-dots', 'keypad', 'calc', 'calc-out', 'guide', 'benefits', 'as-row', 'tick', 'dot', 'key', 'phead .nt']) {
    check(`the stylesheet styles .${cls}`, new RegExp(`\\.${cls}[\\s,.:][^{]*\\{`).test(css));
  }
  check('the quick-action grid fits eight tiles', /\.qa-row \{[^}]*repeat\(4, 1fr\)/.test(css));

  // --- every icon the new screens ask for exists -----------------------------
  const iconsSrc = read('client/js/icons.js');
  const sprite = iconsSrc.slice(iconsSrc.indexOf('const P = {'), iconsSrc.indexOf('const NS ='));
  const have = new Set([...sprite.matchAll(/^\s*'?([a-z0-9-]+)'?\s*:\s*'/gm)].map((m) => m[1]));
  const wanted = [...`${lockHtml}${supHtml}${setHtml}`.matchAll(/data-ico="([a-z0-9-]+)"/g)].map((m) => m[1])
    .concat([...`${setJs}${supJs}${partyJs}`.matchAll(/UI\.icon\('([a-z0-9-]+)'\)/g)].map((m) => m[1]));
  const missing = [...new Set(wanted)].filter((n) => !have.has(n));
  check('no new screen asks for an icon that does not exist', missing.length === 0, missing.join(', '));

  // --- and nothing that only looks wired ------------------------------------
  const dead = [...`${lockHtml}${supHtml}${setHtml}`.matchAll(/<(button|a)[^>]*href="#"/g)];
  check('no new button is a placeholder', dead.length === 0, `${dead.length}`);
  check('no inline handler anywhere (helmet CSP)', !/ on(click|change|input|submit)=/.test(`${lockHtml}${supHtml}${setHtml}`));
}

// =============================================================================
async function main() {
  const login = await call('/auth/login', {
    method: 'POST', auth: false, body: { phone: PHONE, password: PASSWORD }, lang: 'en',
  });
  token = login.json.data?.token || '';
  check('login', !!token);
  if (!token) { console.log('no token — nothing to test'); process.exit(1); }

  try {
    await backupTests();
    await settleTests();
    await lockTests();
    clientTests();
  } finally {
    // Never leave the demo account behind a code.
    await call('/auth/pin', { method: 'PUT', body: { pin: null, password: PASSWORD } });
    const left = await getMe();
    check('the demo account is left unlocked', left.has_pin === false, `has_pin=${left.has_pin}`);
  }

  console.log(`\nphase9: ${pass}/${pass + fail} assertions`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('suite crashed:', err);
  process.exit(1);
});
