// -----------------------------------------------------------------------------
//  Phase 2 test: parties CRUD + bank info + notes + guards.
//  Needs the server running: npm run dev  (or: node server/server.js)
//  Run with: node scripts/test-parties.mjs
// -----------------------------------------------------------------------------
const BASE = 'http://localhost:3100/api';

let token = '';
const results = [];

const check = (label, ok, extra = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
};

const call = async (path, { method = 'GET', body, auth = true } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

async function main() {
  // 0) Login as the smoke-test account
  const login = await call('/auth/login', {
    method: 'POST', auth: false,
    body: { phone: '+9647701234567', password: 'test123' },
  });
  token = login.json.data?.token || '';
  check('login', !!token);

  // 1) Create a party with Arabic name + phone
  const created = await call('/parties', {
    method: 'POST',
    body: { name: 'أبو محمد', phone: '07701112233', note: 'تاجر جملة' },
  });
  const id = created.json.data?.party?.id;
  check('create party', !!id, `id=${id}`);

  // 2) Duplicate name is rejected
  const dup = await call('/parties', { method: 'POST', body: { name: 'أبو محمد' } });
  check('duplicate name rejected', dup.status === 409, `status=${dup.status}`);

  // 3) Empty name is rejected by the validator
  const bad = await call('/parties', { method: 'POST', body: { name: '   ' } });
  check('empty name rejected (422)', bad.status === 422, `status=${bad.status}`);

  // 4) List shows the party + zero totals (no transactions yet)
  const list = await call('/parties');
  const row = (list.json.data?.parties || []).find((p) => p.id === id);
  check('list contains party', !!row, row ? `balance=${row.balance_minor}` : '');
  check('list meta totals', typeof list.json.meta?.count === 'number', `count=${list.json.meta?.count}`);

  // 5) Search by name
  const search = await call('/parties?search=' + encodeURIComponent('أبو'));
  check('search by name', (search.json.data?.parties || []).some((p) => p.id === id));

  // 6) Update phone + note
  const upd = await call(`/parties/${id}`, { method: 'PUT', body: { phone: '07709998877', note: 'تاجر' } });
  check('update party', upd.json.data?.party?.phone === '07709998877', upd.json.data?.party?.phone);

  // 7) Bank info upsert (card with spaces must be stored as digits)
  const bank = await call(`/parties/${id}/bank`, {
    method: 'PUT',
    body: { bank_name: 'الرافدين', card_number: '1234 5678 9012 3456', account_holder: 'أبو محمد' },
  });
  check('save bank info', bank.json.data?.bank?.card_number === '1234567890123456', bank.json.data?.bank?.card_number);

  const badCard = await call(`/parties/${id}/bank`, { method: 'PUT', body: { card_number: 'abc' } });
  check('non-digit card rejected (422)', badCard.status === 422, `status=${badCard.status}`);

  // 8) Notes: add two, delete one
  const n1 = await call(`/parties/${id}/notes`, { method: 'POST', body: { note: 'يحب التسوية نهاية الشهر' } });
  const n2 = await call(`/parties/${id}/notes`, { method: 'POST', body: { note: 'رقم الثاني للتواصل' } });
  const noteId = n1.json.data?.note?.id;
  check('add notes', !!noteId && !!n2.json.data?.note?.id);

  const detail = await call(`/parties/${id}`);
  check('detail returns 2 notes', (detail.json.data?.notes || []).length === 2, `n=${(detail.json.data?.notes || []).length}`);
  check('detail returns bank info', !!detail.json.data?.bank?.bank_name);

  const delNote = await call(`/parties/${id}/notes/${noteId}`, { method: 'DELETE' });
  check('delete note', delNote.json.success === true);

  // 9) Ownership guard: a second account must not see this party
  //    (register on first run, login on re-runs — the phone already exists then)
  let other = await call('/auth/register', {
    method: 'POST', auth: false,
    body: { phone: '+9647700009999', password: 'test123', name: 'مستخدم ثاني' },
  });
  let otherToken = other.json.data?.token;
  if (!otherToken) {
    other = await call('/auth/login', {
      method: 'POST', auth: false,
      body: { phone: '+9647700009999', password: 'test123' },
    });
    otherToken = other.json.data?.token;
  }
  if (otherToken) {
    const prev = token; token = otherToken;
    const foreign = await call(`/parties/${id}`);
    check('other account cannot read party (404)', foreign.status === 404, `status=${foreign.status}`);
    token = prev;
  } else {
    check('second account available', false, `status=${other.status}`);
  }

  // 10) No token → 401
  const prev = token; token = '';
  const noAuth = await call('/parties', { auth: true });
  check('parties without token (401)', noAuth.status === 401, `status=${noAuth.status}`);
  token = prev;

  // 11) Soft delete → gone from the list
  const del = await call(`/parties/${id}`, { method: 'DELETE' });
  const after = await call('/parties');
  check('delete party (soft)', del.json.success === true && !(after.json.data?.parties || []).some((p) => p.id === id));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.label).join(' | ')); process.exit(1); }
  console.log('=== PARTIES TEST PASSED ===');
}

main().catch((e) => { console.error('CRASH:', e.message); process.exit(1); });
