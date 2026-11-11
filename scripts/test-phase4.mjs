// -----------------------------------------------------------------------------
//  Phase 4 test: checks + loans (with installments) + reminders.
//  Needs the server running: npm run dev
//  Run with: node scripts/test-phase4.mjs
//  Re-runnable: everything it creates is cleaned up at the end.
// -----------------------------------------------------------------------------
const BASE = 'http://localhost:3100/api';

let token = '';
const results = [];
const created = { checks: [], loans: [], reminders: [], party: null };

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

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const nowStamp = () => {
  const d = new Date();
  return `${iso(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
};

async function main() {
  // 0) Login as the test account ----------------------------------------------
  const login = await call('/auth/login', {
    method: 'POST', auth: false,
    body: { phone: '+9647701234567', password: 'test123' },
  });
  token = login.json.data?.token || '';
  check('login', !!token);
  if (!token) return finish();

  // A party of our own, so nothing else in the DB can disturb the numbers.
  const party = await call('/parties', { method: 'POST', body: { name: 'صاحب الدفتر 4' } });
  created.party = party.json.data?.party?.id;
  const partyId = created.party;
  check('party created', !!partyId, `id=${partyId}`);

  // The account may already hold rows from a hand test of the screens, so every
  // counter below is read as a DELTA over this baseline instead of as an absolute
  // number. The test stays re-runnable without wiping the demo data first.
  const baseChecks = await call('/checks');
  const baseList = baseChecks.json.data?.checks || [];
  const base = {
    checks: Number(baseChecks.json.meta?.count || 0),
    received: Number(baseChecks.json.meta?.pending_received_minor || 0),
    issued: Number(baseChecks.json.meta?.pending_issued_minor || 0),
    overdue: Number(baseChecks.json.meta?.overdue_count || 0),
    dueSoon: Number(baseChecks.json.meta?.due_soon_count || 0),
    receivedPending: baseList.filter((c) => c.type === 'received' && c.status === 'pending').length,
  };
  const baseLoans = await call('/loans');
  base.loans = Number(baseLoans.json.meta?.count || 0);
  const baseRem = await call(`/reminders?now=${encodeURIComponent(nowStamp())}`);
  base.reminders = Number(baseRem.json.meta?.count || 0);
  base.remPending = Number(baseRem.json.meta?.pending_count || 0);
  base.remDue = Number(baseRem.json.meta?.due_count || 0);
  const baseDue = await call(`/reminders/due?now=${encodeURIComponent(nowStamp())}`);
  base.due = (baseDue.json.data?.reminders || []).length;

  // ===========================================================================
  //  CHECKS
  // ===========================================================================
  const c1 = await call('/checks', {
    method: 'POST',
    body: {
      type: 'received', amount: 250000, due_date: addDays(10), party_id: partyId,
      check_number: 'CH-1001', bank_name: 'مصرف الرافدين',
    },
  });
  created.checks.push(c1.json.data?.check?.id);
  const check1 = c1.json.data?.check;
  check('check created (201, minor units)', c1.status === 201 && Number(check1?.amount_minor) === 25000000,
    `amount_minor=${check1?.amount_minor}`);
  check('check starts pending', check1?.status === 'pending', check1?.status);
  check('days_left is ~10', check1?.days_left >= 9 && check1?.days_left <= 10, `days_left=${check1?.days_left}`);
  check('not overdue / not due soon', check1?.is_overdue === false && check1?.is_due_soon === false);

  const c2 = await call('/checks', {
    method: 'POST',
    body: { type: 'received', amount: 100000, due_date: addDays(-5), bank_name: 'بنك الرافدين' },
  });
  created.checks.push(c2.json.data?.check?.id);
  check('past-dated check is overdue', c2.json.data?.check?.is_overdue === true,
    `days_left=${c2.json.data?.check?.days_left}`);

  const c3 = await call('/checks', {
    method: 'POST',
    body: { type: 'issued', amount: 50000, due_date: addDays(3), party_id: partyId },
  });
  created.checks.push(c3.json.data?.check?.id);
  check('issued check created', c3.status === 201 && c3.json.data?.check?.type === 'issued');

  const list = await call('/checks');
  const meta = list.json.meta;
  check('list counts 3 checks', meta?.count === base.checks + 3, `count=${meta?.count}`);
  check('pending received total', Number(meta?.pending_received_minor) === base.received + 35000000,
    `received=${meta?.pending_received_minor}`);
  check('pending issued total', Number(meta?.pending_issued_minor) === base.issued + 5000000,
    `issued=${meta?.pending_issued_minor}`);
  check('overdue + due-soon counters', meta?.overdue_count === base.overdue + 1 && meta?.due_soon_count === base.dueSoon + 1,
    `overdue=${meta?.overdue_count} soon=${meta?.due_soon_count}`);

  const filtered = await call('/checks?type=received&status=pending');
  check('filter type+status', filtered.json.data?.checks?.length === base.receivedPending + 2,
    `n=${filtered.json.data?.checks?.length}`);
  const byParty = await call(`/checks?party_id=${partyId}`);
  check('filter by party', byParty.json.data?.checks?.length === 2,
    `n=${byParty.json.data?.checks?.length}`);

  const cashed = await call(`/checks/${c2.json.data.check.id}`, { method: 'PUT', body: { status: 'cashed' } });
  check('status -> cashed clears overdue', cashed.json.data?.check?.status === 'cashed'
    && cashed.json.data?.check?.is_overdue === false);

  const edited = await call(`/checks/${c1.json.data.check.id}`, {
    method: 'PUT', body: { amount: '300,000.50', note: 'صك بعد التصحيح' },
  });
  check('grouped amount edit (300000.50 -> 30000050)',
    Number(edited.json.data?.check?.amount_minor) === 30000050,
    `amount_minor=${edited.json.data?.check?.amount_minor}`);

  const one = await call(`/checks/${c1.json.data.check.id}`);
  check('get single check', one.json.data?.check?.id === c1.json.data.check.id);

  // Validation
  const zero = await call('/checks', { method: 'POST', body: { type: 'received', amount: 0, due_date: addDays(1) } });
  check('zero amount rejected (422)', zero.status === 422, `status=${zero.status}`);
  const badType = await call('/checks', { method: 'POST', body: { type: 'wrong', amount: 1000, due_date: addDays(1) } });
  check('bad type rejected (422)', badType.status === 422, `status=${badType.status}`);
  const noDue = await call('/checks', { method: 'POST', body: { type: 'received', amount: 1000 } });
  check('missing due date rejected (422)', noDue.status === 422, `status=${noDue.status}`);
  const badStatus = await call(`/checks/${c1.json.data.check.id}`, { method: 'PUT', body: { status: 'lost' } });
  check('bad status rejected (422)', badStatus.status === 422, `status=${badStatus.status}`);
  const foreignParty = await call('/checks', {
    method: 'POST', body: { type: 'received', amount: 1000, due_date: addDays(1), party_id: 999999 },
  });
  check('unknown party rejected (404)', foreignParty.status === 404, `status=${foreignParty.status}`);

  const delCheck = await call(`/checks/${c3.json.data.check.id}`, { method: 'DELETE' });
  const goneCheck = await call(`/checks/${c3.json.data.check.id}`);
  check('check deleted', delCheck.json.success === true && goneCheck.status === 404,
    `status=${goneCheck.status}`);

  // ===========================================================================
  //  LOANS + INSTALLMENTS
  // ===========================================================================
  const l1 = await call('/loans', {
    method: 'POST',
    body: { type: 'received', principal: 100000, total_installments: 3, start_date: '2026-11-02', party_id: partyId },
  });
  const loan1 = l1.json.data?.loan;
  created.loans.push(loan1?.id);
  check('loan created (201)', l1.status === 201 && Number(loan1?.principal_minor) === 10000000,
    `principal=${loan1?.principal_minor}`);
  check('installment rows generated', l1.json.data?.installments?.length === 3,
    `n=${l1.json.data?.installments?.length}`);

  const sums = (l1.json.data?.installments || []).reduce((s, i) => s + Number(i.amount_minor), 0);
  check('schedule sums to principal exactly', sums === 10000000,
    `sum=${sums} parts=${(l1.json.data?.installments || []).map((i) => i.amount_minor).join('+')}`);
  const dates = (l1.json.data?.installments || []).map((i) => String(i.due_date).slice(0, 10));
  check('due dates step month by month', dates.join(',') === '2026-11-02,2026-12-02,2027-01-02', dates.join(','));
  check('loan starts active with 0 paid', loan1?.status === 'active' && Number(loan1?.paid_installments) === 0
    && Number(loan1?.total_installments) === 3);

  const insts = l1.json.data.installments;
  const paid1 = await call(`/loans/${loan1.id}/installments/${insts[0].id}`, { method: 'PUT', body: { paid: true } });
  const loanAfter1 = paid1.json.data?.loan;
  check('pay installment 1 -> progress 33%',
    Number(loanAfter1?.paid_installments) === 1 && Number(loanAfter1?.paid_minor) === 3333333
    && loanAfter1?.progress_percent === 33,
    `paid=${loanAfter1?.paid_installments} minor=${loanAfter1?.paid_minor} %=${loanAfter1?.progress_percent}`);
  check('remaining shrinks', Number(loanAfter1?.remaining_minor) === 6666667,
    `remaining=${loanAfter1?.remaining_minor}`);
  check('paid installment stamped with a date',
    !!paid1.json.data?.installments?.[0]?.paid_date, String(paid1.json.data?.installments?.[0]?.paid_date));
  check('next_due_date moved to installment 2',
    loanAfter1?.next_due_date === '2026-12-02', `next=${loanAfter1?.next_due_date}`);

  const paid2 = await call(`/loans/${loan1.id}/installments/${insts[1].id}`, { method: 'PUT', body: { paid: true } });
  const paid3 = await call(`/loans/${loan1.id}/installments/${insts[2].id}`, { method: 'PUT', body: { paid: true } });
  check('last installment completes the loan',
    paid3.json.data?.loan?.status === 'completed' && paid3.json.data?.loan?.progress_percent === 100
    && Number(paid3.json.data?.loan?.remaining_minor) === 0,
    `status=${paid3.json.data?.loan?.status} remaining=${paid3.json.data?.loan?.remaining_minor}`);

  const unpay = await call(`/loans/${loan1.id}/installments/${insts[1].id}`, { method: 'PUT', body: { paid: false } });
  check('un-paying reopens the loan',
    unpay.json.data?.loan?.status === 'active' && Number(unpay.json.data?.loan?.paid_installments) === 2,
    `status=${unpay.json.data?.loan?.status} paid=${unpay.json.data?.loan?.paid_installments}`);
  check('un-pay cleared paid_date',
    unpay.json.data?.installments?.[1]?.paid_date === null);

  // Monthly-only plan: count is derived, the last row takes the remainder.
  const l2 = await call('/loans', {
    method: 'POST', body: { type: 'given', principal: 100000, monthly_payment: 30000, start_date: '2026-01-31' },
  });
  created.loans.push(l2.json.data?.loan?.id);
  const l2inst = l2.json.data?.installments || [];
  check('monthly-only -> 4 installments', l2.json.data?.loan?.total_installments === 4,
    `count=${l2.json.data?.loan?.total_installments}`);
  check('last installment absorbs the remainder (10000)',
    Number(l2inst[3]?.amount_minor) === 1000000, `last=${l2inst[3]?.amount_minor}`);
  check('jan 31 clamps to feb 28', String(l2inst[1]?.due_date).slice(0, 10) === '2026-02-28',
    String(l2inst[1]?.due_date));

  // Cancelling must survive a later payment.
  const cancelled = await call(`/loans/${l2.json.data.loan.id}`, { method: 'PUT', body: { status: 'cancelled' } });
  await call(`/loans/${l2.json.data.loan.id}/installments/${l2inst[0].id}`, { method: 'PUT', body: { paid: true } });
  const afterCancel = await call(`/loans/${l2.json.data.loan.id}`);
  check('cancelled loan stays cancelled', afterCancel.json.data?.loan?.status === 'cancelled',
    `status=${afterCancel.json.data?.loan?.status} note=${cancelled.json.message}`);

  const lList = await call('/loans');
  // l1 is active with 2 of 3 paid (3333333 + 3333334) -> 3333333 left; l2 is cancelled -> excluded.
  check('loan list totals ignore cancelled', lList.json.meta?.count === 2
    && Number(lList.json.meta?.remaining_received_minor) === 3333333
    && Number(lList.json.meta?.remaining_given_minor) === 0,
    `count=${lList.json.meta?.count} recv=${lList.json.meta?.remaining_received_minor} given=${lList.json.meta?.remaining_given_minor}`);

  const noPlan = await call('/loans', { method: 'POST', body: { type: 'received', principal: 50000, start_date: '2026-11-02' } });
  check('no plan rejected (422)', noPlan.status === 422, `status=${noPlan.status}`);
  const badPrincipal = await call('/loans', {
    method: 'POST', body: { type: 'received', principal: 0, total_installments: 3, start_date: '2026-11-02' },
  });
  check('zero principal rejected (422)', badPrincipal.status === 422, `status=${badPrincipal.status}`);
  const badFit = await call('/loans', {
    method: 'POST',
    body: { type: 'received', principal: 100000, monthly_payment: 50000, total_installments: 6, start_date: '2026-11-02' },
  });
  check('plan that does not fit rejected (422)', badFit.status === 422, `status=${badFit.status}`);
  const badInst = await call(`/loans/${loan1.id}/installments/999999`, { method: 'PUT', body: { paid: true } });
  check('unknown installment rejected (404)', badInst.status === 404, `status=${badInst.status}`);

  const delLoan = await call(`/loans/${l2.json.data.loan.id}`, { method: 'DELETE' });
  const loanGone = await call(`/loans/${l2.json.data.loan.id}`);
  check('loan deleted', delLoan.json.success === true && loanGone.status === 404, `status=${loanGone.status}`);

  // ===========================================================================
  //  REMINDERS
  // ===========================================================================
  const future = `${addDays(2)} 10:00`;
  const past = `${addDays(-1)} 08:00`;
  const r1 = await call('/reminders', {
    method: 'POST', body: { title: 'تحصيل الصك', message: 'روح خذ الصك', remind_at: future, party_id: partyId },
  });
  created.reminders.push(r1.json.data?.reminder?.id);
  check('future reminder created', r1.status === 201 && r1.json.data?.reminder?.is_due === false,
    r1.json.data?.reminder?.remind_at);
  check('remind_at got seconds appended', /^\d{4}-\d{2}-\d{2} 10:00:00/.test(String(r1.json.data?.reminder?.remind_at)),
    r1.json.data?.reminder?.remind_at);

  const r2 = await call('/reminders', { method: 'POST', body: { title: 'تذكير قديم', remind_at: past } });
  created.reminders.push(r2.json.data?.reminder?.id);
  check('past reminder is due right now', r2.json.data?.reminder?.is_due === true);

  const dateOnly = await call('/reminders', { method: 'POST', body: { title: 'بدون ساعة', remind_at: addDays(1) } });
  created.reminders.push(dateOnly.json.data?.reminder?.id);
  check('date-only defaults to 09:00', / 09:00:00/.test(String(dateOnly.json.data?.reminder?.remind_at)),
    dateOnly.json.data?.reminder?.remind_at);

  const rList = await call(`/reminders?now=${encodeURIComponent(nowStamp())}`);
  check('reminder list + counters', rList.json.meta?.count === base.reminders + 3
    && rList.json.meta?.due_count === base.remDue + 1
    && rList.json.meta?.pending_count === base.remPending + 3,
    `count=${rList.json.meta?.count} due=${rList.json.meta?.due_count}`);

  const dueList = await call(`/reminders/due?now=${encodeURIComponent(nowStamp())}`);
  check('due endpoint returns only the overdue one', dueList.json.data?.reminders?.length === base.due + 1
    && dueList.json.data.reminders.some((x) => x.id === r2.json.data.reminder.id),
    `n=${dueList.json.data?.reminders?.length}`);

  const acked = await call(`/reminders/${r2.json.data.reminder.id}/ack`, { method: 'POST', body: { sent: true } });
  check('ack marks it sent', Number(acked.json.data?.reminder?.sent) === 1);
  const dueAfterAck = await call(`/reminders/due?now=${encodeURIComponent(nowStamp())}`);
  check('acked reminder no longer due', dueAfterAck.json.data?.reminders?.length === base.due,
    `n=${dueAfterAck.json.data?.reminders?.length}`);
  const reopened = await call(`/reminders/${r2.json.data.reminder.id}/ack`, { method: 'POST', body: { sent: false } });
  check('un-ack reopens it', Number(reopened.json.data?.reminder?.sent) === 0);

  const rUpd = await call(`/reminders/${r1.json.data.reminder.id}`, {
    method: 'PUT', body: { title: 'تحصيل الصك - تأجيل', remind_at: `${addDays(5)} 14:30` },
  });
  check('reminder edited', rUpd.json.data?.reminder?.title === 'تحصيل الصك - تأجيل'
    && /14:30:00/.test(String(rUpd.json.data?.reminder?.remind_at)),
    rUpd.json.data?.reminder?.remind_at);

  const noTitle = await call('/reminders', { method: 'POST', body: { remind_at: future } });
  check('missing title rejected (422)', noTitle.status === 422, `status=${noTitle.status}`);
  const badTime = await call('/reminders', { method: 'POST', body: { title: 'x', remind_at: 'بكرة' } });
  check('bad datetime rejected (422)', badTime.status === 422, `status=${badTime.status}`);

  const rDel = await call(`/reminders/${dateOnly.json.data.reminder.id}`, { method: 'DELETE' });
  const rDelGone = await call('/reminders');
  check('reminder deleted', rDel.json.success === true && rDelGone.json.meta?.count === base.reminders + 2,
    `count=${rDelGone.json.meta?.count}`);

  // ===========================================================================
  //  ISOLATION + AUTH GUARDS
  // ===========================================================================
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
    const foreignChecks = await call('/checks');
    const emptyLoans = await call('/loans');
    const emptyRem = await call('/reminders');
    check('other account sees none of our data',
      foreignChecks.json.meta?.count === 0 && emptyLoans.json.meta?.count === 0
      && emptyRem.json.meta?.count === 0,
      `c=${foreignChecks.json.meta?.count} l=${emptyLoans.json.meta?.count} r=${emptyRem.json.meta?.count}`);
    const foreignEdit = await call(`/checks/${c1.json.data.check.id}`, { method: 'PUT', body: { status: 'bounced' } });
    check('other account cannot edit our check (404)', foreignEdit.status === 404, `status=${foreignEdit.status}`);
    const foreignLoan = await call(`/loans/${loan1.id}/installments/${insts[0].id}`, { method: 'PUT', body: { paid: true } });
    check('other account cannot pay our installment (404)', foreignLoan.status === 404, `status=${foreignLoan.status}`);
    const foreignRem = await call(`/reminders/${r1.json.data.reminder.id}`, { method: 'DELETE' });
    check('other account cannot delete our reminder (404)', foreignRem.status === 404, `status=${foreignRem.status}`);
    token = prev;
  } else {
    check('second account available', false, `status=${other.status}`);
  }

  const noAuth = await call('/checks', { auth: false });
  check('checks without token (401)', noAuth.status === 401, `status=${noAuth.status}`);
  const noAuthLoans = await call('/loans', { auth: false });
  check('loans without token (401)', noAuthLoans.status === 401, `status=${noAuthLoans.status}`);

  // ===========================================================================
  //  CLEANUP
  // ===========================================================================
  for (const id of created.reminders) await call(`/reminders/${id}`, { method: 'DELETE' });
  for (const id of created.loans) await call(`/loans/${id}`, { method: 'DELETE' });
  for (const id of created.checks) await call(`/checks/${id}`, { method: 'DELETE' });
  const leftChecks = await call('/checks');
  check('no checks left behind', leftChecks.json.meta?.count === base.checks, `count=${leftChecks.json.meta?.count}`);
  const leftLoans = await call('/loans');
  check('no loans left behind', leftLoans.json.meta?.count === base.loans, `count=${leftLoans.json.meta?.count}`);
  const leftRem = await call('/reminders');
  check('no reminders left behind', leftRem.json.meta?.count === base.reminders, `count=${leftRem.json.meta?.count}`);
  if (partyId) await call(`/parties/${partyId}`, { method: 'DELETE' });

  await finish();
}

async function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach((f) => console.log(` - ${f.label}`));
  }
  console.log(failed.length ? '=== PHASE 4 TEST FAILED ===' : '=== PHASE 4 TEST PASSED ===');
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('Test crashed:', err.message);
  process.exit(1);
});
