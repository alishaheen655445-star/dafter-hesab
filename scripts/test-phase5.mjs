// -----------------------------------------------------------------------------
//  Phase 5 test: image attachments + reports + backup (export/import/online).
//  Needs the server running: npm run dev
//  Run with: node scripts/test-phase5.mjs
//  Re-runnable: everything it creates is cleaned up at the end (including the
//  second account's copy, which is wiped with an empty snapshot).
//
//  Multipart bodies are built BY HAND here (not with FormData) because the test
//  must be able to send a wrong mime type and non-image bytes on purpose.
// -----------------------------------------------------------------------------
const BASE = 'http://localhost:3100/api';
const ORIGIN = 'http://localhost:3100';

const PHONE_A = '+9647701234567';
const PHONE_B = '+9647700005555';
const PASSWORD = 'test123';

let tokenA = '';
let tokenB = '';
let userA = null;
const results = [];
const cleanup = { party: null, backups: [], backupB: null };

const check = (label, ok, extra = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
};

async function call(path, { method = 'GET', body, token = () => tokenA } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/** A real multipart request: field "image", declared type, raw bytes. */
async function upload(path, { bytes, filename, contentType, method = 'POST', token = () => tokenA }) {
  const boundary = `dhboundary${Math.random().toString(36).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([head, Buffer.from(bytes), tail]),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const getRaw = async (url, token = tokenA) => {
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, type: res.headers.get('content-type') || '', buffer: Buffer.from(await res.arrayBuffer()) };
};

// A real 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const stampAt = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${iso(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
};

async function finish() {
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} assertions passed`);
  process.exit(failed ? 1 : 0);
}

async function main() {
  // =========================================================================
  //  0) Two accounts: A owns the book, B is the "new phone" that restores it
  // =========================================================================
  const loginA = await call('/auth/login', { method: 'POST', body: { phone: PHONE_A, password: PASSWORD }, token: () => '' });
  tokenA = loginA.json.data?.token || '';
  userA = loginA.json.data?.user || null;
  check('login (account A)', !!tokenA);
  if (!tokenA) return finish();

  const regB = await call('/auth/register', {
    method: 'POST', token: () => '',
    body: { phone: PHONE_B, password: PASSWORD, name: 'جهاز ثاني', currency: 'toman', lang: 'ar' },
  });
  tokenB = regB.json.data?.token || '';
  if (!tokenB) {
    const loginB = await call('/auth/login', { method: 'POST', body: { phone: PHONE_B, password: PASSWORD }, token: () => '' });
    tokenB = loginB.json.data?.token || '';
  }
  check('account B ready', !!tokenB);

  // footer_text / currency are part of a report -> pin them for predictable output
  await call('/auth/me', { method: 'PUT', body: { footer_text: 'دفتر حساب — للتسوية الودّية', currency: 'toman', lang: 'ar' } });

  const partyRes = await call('/parties', { method: 'POST', body: { name: 'صاحب الدفتر 5', phone: '07701112233', note: 'زبون الدفتر' } });
  const partyId = partyRes.json.data?.party?.id;
  cleanup.party = partyId;
  check('party created', !!partyId, `id=${partyId}`);

  // A small, closed world inside that party: bank, note, 3 حركات, صك, قرض, تذكير
  await call(`/parties/${partyId}/bank`, {
    method: 'PUT',
    body: { bank_name: 'مصرف الرافدين', card_number: '5110123412341234', iban: 'IQ99NBAATI123456789012', branch: 'بغداد' },
  });
  await call(`/parties/${partyId}/notes`, { method: 'POST', body: { note: 'يسدّد آخر الشهر' } });
  await call(`/parties/${partyId}/transactions`, { method: 'POST', body: { type: 'credit', amount: 100000, txn_date: addDays(-30), description: 'طلب أول' } });
  await call(`/parties/${partyId}/transactions`, { method: 'POST', body: { type: 'debit', amount: 40000, txn_date: addDays(-10), description: 'بدهي' } });
  const t3 = await call(`/parties/${partyId}/transactions`, { method: 'POST', body: { type: 'credit', amount: 500, txn_date: addDays(-1), description: 'حركة صغيرة' } });
  const txnId = t3.json.data?.transaction?.id;
  check('three transactions created', !!txnId, `last id=${txnId}`);
  const chkRes = await call('/checks', { method: 'POST', body: { type: 'received', amount: 200000, due_date: addDays(15), party_id: partyId, check_number: 'P5-0001' } });
  const checkId = chkRes.json.data?.check?.id;
  const loanRes = await call('/loans', { method: 'POST', body: { type: 'received', principal: 60000, total_installments: 2, start_date: addDays(1), party_id: partyId } });
  const loanId = loanRes.json.data?.loan?.id;
  check('loan with a 2-installment schedule created', !!loanId, `id=${loanId} ${loanRes.json.message || ''}`);
  const remRes = await call('/reminders', { method: 'POST', body: { title: 'تذكير الدفتر 5', remind_at: stampAt(2), party_id: partyId } });
  const reminderId = remRes.json.data?.reminder?.id;

  const partyAfter = await call(`/parties/${partyId}`);
  check('party balance is 6,050,000 minor', Number(partyAfter.json.data?.party?.balance_minor) === 6050000,
    `balance_minor=${partyAfter.json.data?.party?.balance_minor}`);

  // =========================================================================
  //  1) IMAGE ATTACHMENT on a transaction
  // =========================================================================
  const up1 = await upload(`/parties/${partyId}/transactions/${txnId}/image`, {
    bytes: PNG, filename: 'receipt.png', contentType: 'image/png',
  });
  const url1 = up1.json.data?.transaction?.image_url;
  check('png attached (200 + image_url)', up1.status === 200 && /^\/uploads\/.+\.png$/.test(url1 || ''), url1);
  check('file is named after its owner', new RegExp(`/uploads/${userA.id}-\\d+-[0-9a-f]{12}\\.png$`).test(url1 || ''), url1);

  const img = await getRaw(`${ORIGIN}${url1}`);
  check('image is served back', img.status === 200 && img.type.startsWith('image/'), `${img.status} ${img.type}`);
  check('image bytes survived the round trip', img.buffer.equals(PNG), `${img.buffer.length} bytes`);

  const up2 = await upload(`/parties/${partyId}/transactions/${txnId}/image`, {
    bytes: PNG, filename: 'second.png', contentType: 'image/png',
  });
  const url2 = up2.json.data?.transaction?.image_url;
  check('second upload replaces the first', up2.status === 200 && url2 !== url1, url2);
  const oldGone = await getRaw(`${ORIGIN}${url1}`);
  check('the OLD file was deleted from disk', oldGone.status === 404, `status=${oldGone.status}`);

  const txt = await upload(`/parties/${partyId}/transactions/${txnId}/image`, {
    bytes: Buffer.from('just some text, not an image at all'), filename: 'notes.txt', contentType: 'text/plain',
  });
  check('non-image mime is refused', txt.status === 422 && /JPEG|image/i.test(txt.json.message || ''), txt.json.message);

  const fake = await upload(`/parties/${partyId}/transactions/${txnId}/image`, {
    bytes: Buffer.from('<html>pretending to be a png</html>'), filename: 'fake.png', contentType: 'image/png',
  });
  check('fake image bytes are refused', fake.status === 422 && /not a real image/i.test(fake.json.message || ''), fake.json.message);

  const empty = await upload(`/parties/${partyId}/transactions/${txnId}/image`, {
    bytes: Buffer.from(''), filename: 'nomime.jpg', contentType: 'image/jpeg',
  });
  check('empty file is refused', empty.status === 422, empty.json.message);

  const big = await upload(`/parties/${partyId}/transactions/${txnId}/image`, {
    bytes: Buffer.alloc(6 * 1024 * 1024, 7), filename: 'big.png', contentType: 'image/png',
  });
  check('oversize upload is refused (max 5 MB)', big.status === 422 && /too large/i.test(big.json.message || ''), big.json.message);

  const noFile = await call(`/parties/${partyId}/transactions/${txnId}/image`, { method: 'POST' });
  check('upload with no file at all', noFile.status === 422, noFile.json.message);

  const foreign = await upload(`/parties/999999/transactions/1/image`, { bytes: PNG, filename: 'x.png', contentType: 'image/png' });
  check('cannot attach to an unknown party', foreign.status === 404, `status=${foreign.status}`);
  const foreignB = await upload(`/parties/${partyId}/transactions/${txnId}/image`, {
    bytes: PNG, filename: 'x.png', contentType: 'image/png', token: () => tokenB,
  });
  check('account B cannot touch A’s transaction', foreignB.status === 404, `status=${foreignB.status}`);

  const del = await call(`/parties/${partyId}/transactions/${txnId}/image`, { method: 'DELETE' });
  check('image removed (null again)', del.status === 200 && del.json.data?.transaction?.image_url === null);
  const goneAfterDelete = await getRaw(`${ORIGIN}${url2}`);
  check('deleted file is gone from disk', goneAfterDelete.status === 404, `status=${goneAfterDelete.status}`);

  // The picture survives an ordinary edit of the row.
  await call(`/parties/${partyId}/transactions/${txnId}`, { method: 'PUT', body: { description: 'وصف معدّل' } });
  const reUp = await upload(`/parties/${partyId}/transactions/${txnId}/image`, { bytes: PNG, filename: 'third.png', contentType: 'image/png' });
  check('re-attach after an edit works', reUp.status === 200 && !!reUp.json.data?.transaction?.image_url);

  // --- check photo -----------------------------------------------------------
  const chkImg = await upload(`/checks/${checkId}/image`, { bytes: PNG, filename: 'cheque.png', contentType: 'image/png' });
  const chkUrl = chkImg.json.data?.check?.image_url;
  check('image attached to a check', chkImg.status === 200 && /^\/uploads\/.+\.png$/.test(chkUrl || ''), chkUrl);
  const chkGet = await call(`/checks/${checkId}`);
  check('GET /checks/:id returns image_url', chkGet.json.data?.check?.image_url === chkUrl);
  const chkList = await call('/checks');
  check('check list exposes image_url too',
    (chkList.json.data?.checks || []).some((c) => c.id === checkId && c.image_url === chkUrl));
  const chkDel = await call(`/checks/${checkId}/image`, { method: 'DELETE' });
  check('check image removed', chkDel.status === 200 && chkDel.json.data?.check?.image_url === null);

  // 401 guards
  const noAuth = await fetch(`${BASE}/parties/${partyId}/transactions/${txnId}/image`, { method: 'DELETE' });
  check('attachment routes need auth', noAuth.status === 401);

  // =========================================================================
  //  2) REPORTS
  // =========================================================================
  const rep = await call(`/reports/party/${partyId}`);
  const r = rep.json.data?.report;
  check('party report returns rows', rep.status === 200 && r?.rows?.length === 3, `rows=${r?.rows?.length}`);
  check('running balance is cumulative',
    r?.rows?.[0]?.running_balance_minor === 10000000
    && r?.rows?.[1]?.running_balance_minor === 6000000
    && r?.rows?.[2]?.running_balance_minor === 6050000,
    (r?.rows || []).map((x) => x.running_balance_minor).join(','));
  check('report totals match the ledger',
    r?.totals?.credit_minor === 10050000 && r?.totals?.debit_minor === 4000000 && r?.totals?.balance_minor === 6050000,
    JSON.stringify(r?.totals));
  check('report carries the party, bank and footer',
    r?.party?.name === 'صاحب الدفتر 5' && r?.bank?.card_number === '5110123412341234'
    && r?.user?.footer_text === 'دفتر حساب — للتسوية الودّية');
  check('report carries notes and currency', r?.notes?.length === 1 && r?.user?.currency === 'toman');

  const repRange = await call(`/reports/party/${partyId}?from=${addDays(-15)}&to=${addDays(-2)}`);
  const rr = repRange.json.data?.report;
  check('date window filters rows', rr?.rows?.length === 1 && rr?.totals?.count === 1, `rows=${rr?.rows?.length}`);
  check('window balance is the last visible running balance', rr?.totals?.window_balance_minor === 6000000,
    `=${rr?.totals?.window_balance_minor}`);
  check('full-history balance still reported next to the window', rr?.totals?.balance_minor === 6050000);

  const badDate = await call(`/reports/party/${partyId}?from=yesterday`);
  check('bad report date -> 422', badDate.status === 422, badDate.json.message);
  const badParty = await call('/reports/party/999999');
  check('report for an unknown party -> 404', badParty.status === 404);
  const foreignReport = await call(`/reports/party/${partyId}`, { token: () => tokenB });
  check('account B cannot read A’s report', foreignReport.status === 404);
  const noTokenReport = await fetch(`${BASE}/reports/book`);
  check('report routes need auth', noTokenReport.status === 401);

  const book = await call('/reports/book');
  const b = book.json.data?.report;
  check('book summary lists the party', book.status === 200 && (b?.parties || []).some((p) => p.id === partyId));
  check('book totals include the party balance',
    Number(b?.totals?.credit_minor) >= 10050000 && Number(b?.totals?.balance_minor) >= 6050000,
    JSON.stringify(b?.totals));
  check('book counts pending checks and open loans',
    Number(b?.totals?.pending_check_count) >= 1 && Number(b?.totals?.open_loan_count) >= 1
    && Number(b?.totals?.pending_checks_minor) >= 20000000,
    `checks=${b?.totals?.pending_check_count} loans=${b?.totals?.open_loan_count}`);

  // =========================================================================
  //  3) BACKUP — export
  // =========================================================================
  const exp = await call('/backup/export');
  const snap = exp.json.data?.snapshot;
  check('export returns a versioned snapshot',
    exp.status === 200 && snap?.app === 'daftar-hesab' && snap?.version === 1 && !!snap?.exported_at);
  const mine = (snap?.data?.parties || []).find((p) => p.name === 'صاحب الدفتر 5');
  check('snapshot contains our party with bank + note',
    !!mine && mine.bank?.iban === 'IQ99NBAATI123456789012' && mine.notes?.length === 1,
    JSON.stringify(snap?.counts));
  const partyTxns = (snap?.data?.transactions || []).filter((t) => t.party_ref === mine?.ref);
  check('snapshot carries every transaction with minor units',
    partyTxns.length === 3 && partyTxns.every((x) => Number.isInteger(x.amount_minor) && x.amount_minor > 0),
    partyTxns.map((x) => x.amount_minor).join('+'));
  check('snapshot carries the check and the loan schedule',
    (snap?.data?.checks || []).some((c) => c.ref === checkId)
    && (snap?.data?.loans || []).some((l) => l.ref === loanId && l.installments.length === 2));
  check('snapshot carries reminders and the owner profile',
    (snap?.data?.reminders || []).some((x) => x.title === 'تذكير الدفتر 5')
    && snap?.user?.phone === PHONE_A && !!snap?.user?.footer_text);
  check('snapshot sums to the same balance',
    partyTxns.reduce((s, x) => s + (x.type === 'credit' ? x.amount_minor : -x.amount_minor), 0) === 6050000);

  // =========================================================================
  //  4) BACKUP — import (validation + replace + merge)
  // =========================================================================
  const notOurs = await call('/backup/import', { method: 'POST', body: { snapshot: { app: 'other-app', version: 1, data: {} }, mode: 'merge' } });
  check('a foreign JSON file is refused', notOurs.status === 422, notOurs.json.errors?.[0]?.message);
  const badVersion = await call('/backup/import', { method: 'POST', body: { snapshot: { app: 'daftar-hesab', version: 99, data: {} }, mode: 'merge' } });
  check('unknown backup version is refused', badVersion.status === 422, badVersion.json.errors?.[0]?.message);
  const orphan = await call('/backup/import', {
    method: 'POST', token: () => tokenB,
    body: { snapshot: { app: 'daftar-hesab', version: 1, data: { parties: [], transactions: [{ party_ref: 42, type: 'credit', amount_minor: 100, txn_date: addDays(0) }] } }, mode: 'merge' },
  });
  check('a row pointing at a missing party is refused', orphan.status === 422, orphan.json.errors?.[0]?.message);
  const badMoney = await call('/backup/import', {
    method: 'POST', token: () => tokenB,
    body: { snapshot: { app: 'daftar-hesab', version: 1, data: { parties: [{ ref: 1, name: 'س' }], transactions: [{ party_ref: 1, type: 'credit', amount_minor: 'abc', txn_date: addDays(0) }] } }, mode: 'merge' },
  });
  check('non-integer money is refused', badMoney.status === 422, JSON.stringify(badMoney.json.errors));
  const badType = await call('/backup/import', {
    method: 'POST', token: () => tokenB,
    body: { snapshot: { app: 'daftar-hesab', version: 1, data: { parties: [{ ref: 1, name: 'س' }], transactions: [{ party_ref: 1, type: 'maybe', amount_minor: 100, txn_date: addDays(0) }] } }, mode: 'merge' },
  });
  check('an unknown transaction type is refused', badType.status === 422, JSON.stringify(badType.json.errors));
  const noConfirm = await call('/backup/import', { method: 'POST', token: () => tokenB, body: { snapshot: snap, mode: 'replace' } });
  check('replace needs confirm=true', noConfirm.status === 422, noConfirm.json.errors?.[0]?.message);

  const imp = await call('/backup/import', { method: 'POST', token: () => tokenB, body: { snapshot: snap, mode: 'replace', confirm: true } });
  const restored = imp.json.data?.restored;
  check('import into the second account worked', imp.status === 200 && restored?.parties === snap.counts.parties,
    JSON.stringify(restored));
  check('every row type was restored',
    restored?.transactions === snap.counts.transactions && restored?.checks === snap.counts.checks
    && restored?.loans === snap.counts.loans && restored?.reminders === snap.counts.reminders,
    JSON.stringify(restored));

  const bParties = await call('/parties', { token: () => tokenB });
  const copied = (bParties.json.data?.parties || []).find((p) => p.name === 'صاحب الدفتر 5');
  check('the restored book shows the SAME balance on the other device',
    !!copied && Number(copied.balance_minor) === 6050000, `balance=${copied?.balance_minor}`);
  const bBank = await call(`/parties/${copied?.id}`, { token: () => tokenB });
  check('bank info and notes survived the trip',
    bBank.json.data?.bank?.card_number === '5110123412341234' && bBank.json.data?.notes?.length === 1);
  const bLoan = await call('/loans', { token: () => tokenB });
  const copiedLoan = (bLoan.json.data?.loans || []).find((l) => l.party_id === copied?.id || l.party_name === 'صاحب الدفتر 5');
  check('the restored loan kept its schedule', !!copiedLoan && Number(copiedLoan.total_installments) === 2,
    JSON.stringify(bLoan.json?.meta));
  const bRep = await call(`/reports/party/${copied?.id}`, { token: () => tokenB });
  check('the restored report prints the same figures',
    bRep.json.data?.report?.totals?.balance_minor === 6050000
    && bRep.json.data?.report?.rows?.length === 3);

  const again = await call('/backup/import', { method: 'POST', token: () => tokenB, body: { snapshot: snap, mode: 'merge' } });
  const againCounts = again.json.data?.restored;
  const totalRows = snap.counts.transactions + snap.counts.checks + snap.counts.loans + snap.counts.reminders;
  check('merging the same file twice adds nothing',
    again.status === 200 && againCounts?.parties === 0 && againCounts?.transactions === 0
    && againCounts?.checks === 0 && againCounts?.loans === 0 && againCounts?.reminders === 0
    && againCounts?.skipped === totalRows,
    JSON.stringify(againCounts));

  const importNoAuth = await fetch(`${BASE}/backup/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('import needs auth', importNoAuth.status === 401);

  // =========================================================================
  //  5) BACKUP — server-side copies (the "online" backup)
  // =========================================================================
  const save1 = await call('/backup/online', { method: 'POST' });
  const backupId = save1.json.data?.backup?.id;
  cleanup.backups.push(backupId);
  check('online copy saved (201)', save1.status === 201 && !!backupId && /\.json$/.test(save1.json.data?.backup?.name || ''),
    JSON.stringify(save1.json.data?.backup));
  check('online copy reports its own counts', save1.json.data?.counts?.parties === snap.counts.parties);

  const save2 = await call('/backup/online', { method: 'POST' });
  if (save2.json.data?.backup?.id) cleanup.backups.push(save2.json.data.backup.id);
  check('two copies in the same second get different names',
    save2.status === 201 && save2.json.data.backup.name !== save1.json.data.backup.name,
    `${save1.json.data?.backup?.name} / ${save2.json.data?.backup?.name}`);

  const list = await call('/backup/online');
  check('online copies are listed newest first',
    list.status === 200 && (list.json.data?.backups || []).length >= 2
    && list.json.data.backups[0].id >= list.json.data.backups[1].id, `count=${list.json.meta?.count}`);

  const dl = await getRaw(`${BASE}/backup/online/${backupId}/download`);
  let dlJson = null;
  try { dlJson = JSON.parse(dl.buffer.toString('utf8')); } catch (_e) { /* reported below */ }
  check('download returns the real file', dl.status === 200 && dlJson?.app === 'daftar-hesab', `status=${dl.status}`);
  check('downloaded snapshot equals the exported one',
    dlJson?.counts?.transactions === snap.counts.transactions && dlJson?.data?.parties?.length === snap.data.parties.length);

  const dlB = await getRaw(`${BASE}/backup/online/${backupId}/download`, tokenB);
  check('account B cannot download A’s copy', dlB.status === 404, `status=${dlB.status}`);

  // Restoring is per account: B makes its own copy and puts its own book back.
  const saveB = await call('/backup/online', { method: 'POST', token: () => tokenB });
  const backupB = saveB.json.data?.backup?.id;
  cleanup.backupB = backupB;
  check('the second account can keep its own copy', saveB.status === 201 && !!backupB);

  const restoreFromServer = await call(`/backup/online/${backupB}/restore`, {
    method: 'POST', token: () => tokenB, body: { mode: 'replace', confirm: true },
  });
  check('restore straight from the server copy',
    restoreFromServer.status === 200 && restoreFromServer.json.data?.restored?.parties === snap.counts.parties,
    `${restoreFromServer.status} ${restoreFromServer.json.message || ''} ${JSON.stringify(restoreFromServer.json.data?.restored || {})}`);
  const restoreForeign = await call(`/backup/online/${backupId}/restore`, {
    method: 'POST', token: () => tokenB, body: { mode: 'replace', confirm: true },
  });
  check('account B cannot restore A’s copy', restoreForeign.status === 404, `status=${restoreForeign.status}`);
  const restoreNoConfirm = await call(`/backup/online/${backupB}/restore`, { method: 'POST', token: () => tokenB, body: { mode: 'replace' } });
  check('server restore also needs confirm', restoreNoConfirm.status === 422, restoreNoConfirm.json.errors?.[0]?.message);

  const delBk = await call(`/backup/online/${cleanup.backups[cleanup.backups.length - 1]}`, { method: 'DELETE' });
  check('a copy can be deleted', delBk.status === 200);
  const listAfterDel = await call('/backup/online');
  check('the deleted copy is really gone',
    !(listAfterDel.json.data?.backups || []).some((x) => x.id === cleanup.backups[cleanup.backups.length - 1]));
  const exportNoAuth = await fetch(`${BASE}/backup/export`);
  check('export needs auth', exportNoAuth.status === 401);

  // =========================================================================
  //  6) clean up so the next run sees the same numbers
  // =========================================================================
  const emptySnap = { app: 'daftar-hesab', version: 1, data: { parties: [], transactions: [], checks: [], loans: [], reminders: [] } };
  const wipeB = await call('/backup/import', { method: 'POST', token: () => tokenB, body: { snapshot: emptySnap, mode: 'replace', confirm: true } });
  check('an empty snapshot wipes the second account (cleanup)',
    wipeB.status === 200 && wipeB.json.data?.restored?.parties === 0);
  const bLeft = await call('/parties', { token: () => tokenB });
  check('nothing is left behind on the second device', (bLeft.json.data?.parties || []).length === 0);

  for (const id of cleanup.backups) await call(`/backup/online/${id}`, { method: 'DELETE' });
  if (cleanup.backupB) await call(`/backup/online/${cleanup.backupB}`, { method: 'DELETE', token: () => tokenB });
  const listClean = await call('/backup/online');
  // What has to be gone is what THIS run made. A copy the owner stored himself is
  // his business — a test must not fail because the app has real backups.
  const leftOurs = (listClean.json.data?.backups || []).filter((b) => cleanup.backups.includes(b.id));
  check('test backups removed from the server', leftOurs.length === 0,
    leftOurs.map((b) => `${b.id}:${b.kind}`).join(','));
  const listCleanB = await call('/backup/online', { token: () => tokenB });
  const leftOursB = (listCleanB.json.data?.backups || []).filter((b) => b.id === cleanup.backupB);
  check('the second account left no copy either', leftOursB.length === 0,
    leftOursB.map((b) => `${b.id}:${b.kind}`).join(','));
  await call(`/parties/${partyId}/transactions/${txnId}/image`, { method: 'DELETE' });
  if (reminderId) await call(`/reminders/${reminderId}`, { method: 'DELETE' });
  if (loanId) await call(`/loans/${loanId}`, { method: 'DELETE' });
  if (checkId) await call(`/checks/${checkId}`, { method: 'DELETE' });

  if (partyId) await call(`/parties/${partyId}`, { method: 'DELETE' });

  await finish();
}

main().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
