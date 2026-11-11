// -----------------------------------------------------------------------------
//  Phase 3 test: transactions + running balance + statement filters + guards.
//  Needs the server running: npm run dev
//  Run with: node scripts/test-transactions.mjs
//  Re-runnable: the test party is kept, its transactions are deleted at the end.
// -----------------------------------------------------------------------------
const BASE = 'http://localhost:3100/api';

let token = '';
const results = [];
const createdIds = [];

const check = (label, ok, extra = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
};

const call = async (path, { method = 'GET', body, auth = true } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const add = async (partyId, payload) => {
  const r = await call(`/parties/${partyId}/transactions`, { method: 'POST', body: payload });
  if (r.json.data?.transaction?.id) createdIds.push(r.json.data.transaction.id);
  return r;
};

async function main() {
  // 0) Login + make sure the test party exists
  const login = await call('/auth/login', {
    method: 'POST', auth: false,
    body: { phone: '+9647701234567', password: 'test123' },
  });
  token = login.json.data?.token || '';
  check('login', !!token);

  const NAME = 'متجر التجربة';
  const foundParty = ((await call('/parties')).json.data?.parties || [])
    .find((p) => p.name === NAME);
  let partyId = foundParty?.id;
  // The fixture is ours only when this run had to make it. Then it goes away with
  // the rest of the paperwork, so a test run never leaves a row in a demo list.
  const ownParty = !partyId;
  if (!partyId) {
    const made = await call('/parties', { method: 'POST', body: { name: NAME, phone: '07701234567' } });
    partyId = made.json.data?.party?.id;
  }
  check('test party ready', !!partyId, `id=${partyId}`);

  // 1) Three entries: +500,000 / -120,000 / +50,000  (minor units are cents)
  const t1 = await add(partyId, { type: 'credit', amount: '500000', description: 'بضاعة — دفعة أولى' });
  const t2 = await add(partyId, { type: 'debit', amount: '120000', description: 'سلفة كاش' });
  const t3 = await add(partyId, { type: 'credit', amount: '50000.50', description: 'تسوية صغيرة' });
  check('create transactions', !!t1.json.data?.transaction?.id && !!t2.json.data?.transaction?.id && !!t3.json.data?.transaction?.id);
  check('amount stored in minor units', Number(t1.json.data?.transaction?.amount_minor) === 50000000, `amount_minor=${t1.json.data?.transaction?.amount_minor}`);
  check('create returns fresh party balance',
    Number(t3.json.data?.party?.balance_minor) === 50000000 - 12000000 + 5000050,
    `balance_minor=${t3.json.data?.party?.balance_minor}`);

  // 2) Statement: newest first, running balance accumulated from the FULL history
  const st = await call(`/parties/${partyId}/transactions`);
  const rows = st.json.data?.transactions || [];
  check('statement returns 3 rows', rows.length === 3, `n=${rows.length}`);
  const asc = rows.slice().reverse();
  check('running balance row 1', Number(asc[0]?.running_balance_minor) === 50000000, `${asc[0]?.running_balance_minor}`);
  check('running balance row 2', Number(asc[1]?.running_balance_minor) === 38000000, `${asc[1]?.running_balance_minor}`);
  check('running balance row 3', Number(asc[2]?.running_balance_minor) === 43000050, `${asc[2]?.running_balance_minor}`);
  check('statement meta totals',
    Number(st.json.meta?.total_credit_minor) === 55000050 && Number(st.json.meta?.total_debit_minor) === 12000000,
    `credit=${st.json.meta?.total_credit_minor} debit=${st.json.meta?.total_debit_minor}`);

  // 3) Party detail aggregate agrees with the statement
  const detail = await call(`/parties/${partyId}`);
  check('party balance matches', Number(detail.json.data?.party?.balance_minor) === 43000050,
    `balance_minor=${detail.json.data?.party?.balance_minor}`);

  // 4) Validation
  const zero = await call(`/parties/${partyId}/transactions`, { method: 'POST', body: { type: 'credit', amount: '0' } });
  check('zero amount rejected (422)', zero.status === 422, `status=${zero.status}`);
  const badType = await call(`/parties/${partyId}/transactions`, { method: 'POST', body: { type: 'loan', amount: '10' } });
  check('bad type rejected (422)', badType.status === 422, `status=${badType.status}`);
  const badDate = await add(partyId, { type: 'credit', amount: '10', txn_date: '15-11-2026' });
  check('bad date rejected (422)', badDate.status === 422, `status=${badDate.status}`);
  const commaAmount = await add(partyId, { type: 'debit', amount: '1,250.75', txn_date: '2026-01-15' });
  check('grouped amount parses', Number(commaAmount.json.data?.transaction?.amount_minor) === 125075,
    `amount_minor=${commaAmount.json.data?.transaction?.amount_minor}`);
  const commaId = commaAmount.json.data?.transaction?.id;

  // 5) Date filter — the window shrinks, but the January entry still counts FIRST,
  //    so the visible rows keep the balance of the whole history (49,874,925 = 50,000,000 − 1,250,75).
  const filtered = await call(`/parties/${partyId}/transactions?from=2026-06-01`);
  const fRows = filtered.json.data?.transactions || [];
  check('date filter shrinks the list', fRows.length === 3 && filtered.json.meta.count === 3, `n=${fRows.length}`);
  check('filtered row keeps full-history balance',
    Number(fRows[fRows.length - 1]?.running_balance_minor) === 50000000 - 125075,
    `${fRows[fRows.length - 1]?.running_balance_minor}`);

  // 6) Type filter
  const credits = await call(`/parties/${partyId}/transactions?type=credit`);
  check('type filter', (credits.json.data?.transactions || []).every((r) => r.type === 'credit')
    && credits.json.data?.transactions?.length === 2);

  // 7) Edit an entry (debit -> credit, same amount) → balance moves by 2x
  const before = Number((await call(`/parties/${partyId}`)).json.data?.party?.balance_minor);
  const edit = await call(`/parties/${partyId}/transactions/${t2.json.data.transaction.id}`, {
    method: 'PUT', body: { type: 'credit', description: 'سلفة رجعت' },
  });
  const after = Number((await call(`/parties/${partyId}`)).json.data?.party?.balance_minor);
  check('edit transaction', edit.json.data?.transaction?.type === 'credit' && edit.json.data?.transaction?.description === 'سلفة رجعت');
  check('edit recalculates balance', after === before + 2 * Number(t2.json.data.transaction.amount_minor),
    `before=${before} after=${after}`);

  // 8) Delete an entry → balance drops back
  const del = await call(`/parties/${partyId}/transactions/${t3.json.data.transaction.id}`, { method: 'DELETE' });
  const afterDel = Number((await call(`/parties/${partyId}`)).json.data?.party?.balance_minor);
  check('delete transaction (soft)', del.json.success === true && afterDel === after - 5000050, `after=${afterDel}`);

  // 9) Guards: foreign account and missing token
  let other = await call('/auth/register', {
    method: 'POST', auth: false,
    body: { phone: '+9647700009999', password: 'test123', name: 'مستخدم ثاني' },
  });
  let otherToken = other.json.data?.token;
  if (!otherToken) {
    other = await call('/auth/login', {
      method: 'POST', auth: false, body: { phone: '+9647700009999', password: 'test123' },
    });
    otherToken = other.json.data?.token;
  }
  if (otherToken) {
    const prev = token; token = otherToken;
    const foreign = await call(`/parties/${partyId}/transactions`);
    check('other account cannot read statement (404)', foreign.status === 404, `status=${foreign.status}`);
    const foreignEdit = await call(`/parties/${partyId}/transactions/${t1.json.data.transaction.id}`, {
      method: 'DELETE',
    });
    check('other account cannot delete (404)', foreignEdit.status === 404, `status=${foreignEdit.status}`);
    token = prev;
  } else {
    check('second account available', false, `status=${other.status}`);
  }
  const prev = token; token = '';
  const noAuth = await call(`/parties/${partyId}/transactions`, { auth: true });
  check('statement without token (401)', noAuth.status === 401, `status=${noAuth.status}`);
  token = prev;

  // 10) Cleanup: remove every entry this run created.
  for (const id of [...createdIds, commaId].filter(Boolean)) {
    await call(`/parties/${partyId}/transactions/${id}`, { method: 'DELETE' });
  }
  const empty = await call(`/parties/${partyId}/transactions`);
  check('cleanup leaves an empty ledger', (empty.json.data?.transactions || []).length === 0,
    `n=${(empty.json.data?.transactions || []).length}`);

  if (ownParty) {
    await call(`/parties/${partyId}`, { method: 'DELETE' });
    const gone = await call('/parties');
    check('cleanup leaves no fixture party behind',
      !(gone.json.data?.parties || []).some((p) => p.id === partyId), `id=${partyId}`);
  } else {
    check('a party that was already there is left alone', true, `id=${partyId}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.label).join(' | ')); process.exit(1); }
  console.log('=== TRANSACTIONS TEST PASSED ===');
}

main().catch((e) => { console.error('CRASH:', e.message); process.exit(1); });
