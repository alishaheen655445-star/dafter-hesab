// -----------------------------------------------------------------------------
//  loanService — قرض / وام with a monthly installment schedule.
//  The schedule is generated once at creation; paying an installment recomputes
//  the loan progress from the schedule, so numbers can never drift apart.
// -----------------------------------------------------------------------------
const loanModel = require('../models/loanModel');
const partyModel = require('../models/partyModel');
const ApiError = require('../utils/ApiError');
const { toMinor } = require('../utils/money');

const TYPES = ['received', 'given'];
const STATUSES = ['active', 'completed', 'cancelled'];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Adds N months to YYYY-MM-DD, clamping to the last day of the target month. */
function addMonths(dateStr, months) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

/**
 * Splits the principal into monthly rows. The LAST row takes whatever is left, so
 * principal 100,000 / 3 installments becomes 33,333 + 33,333 + 33,334 and the
 * schedule always adds back up to exactly the principal.
 */
function buildSchedule({ principalMinor, monthlyMinor, count, startDate }) {
  const rows = [];
  let remaining = principalMinor;
  for (let n = 1; n <= count; n += 1) {
    const amount = n === count ? remaining : Math.min(monthlyMinor, remaining);
    rows.push({ number: n, dueDate: addMonths(startDate, n - 1), amountMinor: amount });
    remaining -= amount;
  }
  return rows;
}

/** Works out monthly + count from whichever one the user supplied. */
function resolvePlan(principalMinor, monthlyRaw, countRaw) {
  const monthly = monthlyRaw === undefined || monthlyRaw === null || monthlyRaw === ''
    ? null : toMinor(monthlyRaw);
  const count = countRaw === undefined || countRaw === null || countRaw === ''
    ? null : Number(countRaw);

  if (monthly !== undefined && monthly !== null && monthly <= 0) throw new ApiError(422, 'Monthly payment must be greater than zero');
  if (count !== null && (!(count >= 1) || count > 600)) throw new ApiError(422, 'Number of installments must be 1-600');

  if (monthly === null && count === null) {
    throw new ApiError(422, 'Give a monthly payment or a number of installments');
  }
  const out = {
    monthly: monthly !== null ? monthly : Math.floor(principalMinor / count),
    count: count !== null ? count : Math.ceil(principalMinor / monthly),
  };
  if (out.monthly <= 0) throw new ApiError(422, 'Monthly payment is too small for this principal');
  if (monthly !== null && count !== null && monthly * (count - 1) >= principalMinor) {
    throw new ApiError(422, 'That plan does not fit the principal — the last installment would be zero');
  }
  return out;
}

async function assertParty(userId, partyId) {
  if (partyId === undefined || partyId === null || partyId === '') return null;
  const party = await partyModel.findRaw(userId, Number(partyId));
  if (!party) throw new ApiError(404, 'Party not found');
  return party;
}

async function assertLoan(userId, id) {
  const loan = await loanModel.findById(userId, id);
  if (!loan) throw new ApiError(404, 'Loan not found');
  return loan;
}

function decorate(row) {
  const principal = Number(row.principal_minor);
  const paid = Number(row.paid_minor);
  const total = Number(row.total_installments) || 0;
  const paidCount = Number(row.paid_installments) || 0;
  const nextDue = row.next_due_date ? String(row.next_due_date).slice(0, 10) : null;
  return {
    ...row,
    remaining_minor: principal - paid,
    progress_percent: total > 0 ? Math.round((paidCount / total) * 100) : 0,
    next_due_date: nextDue,
    is_overdue: row.status === 'active' && !!nextDue && nextDue < todayIso(),
  };
}

/** GET /api/loans */
async function list(userId, filters) {
  const rows = await loanModel.listByUser(userId, filters);
  const loans = rows.map(decorate);
  const sum = (fn) => loans.filter(fn).reduce((s, l) => s + Number(l.remaining_minor), 0);
  return {
    loans,
    meta: {
      count: loans.length,
      remaining_received_minor: sum((l) => l.status === 'active' && l.type === 'received'),
      remaining_given_minor: sum((l) => l.status === 'active' && l.type === 'given'),
      overdue_count: loans.filter((l) => l.is_overdue).length,
    },
  };
}

/** GET /api/loans/:id — loan + its full schedule. */
async function get(userId, id) {
  await assertLoan(userId, id);
  const [loan, installments] = await Promise.all([
    loanModel.findById(userId, id),
    loanModel.listInstallments(userId, id),
  ]);
  return { loan: decorate(loan), installments };
}

/** POST /api/loans — creates the loan AND generates the installment rows. */
async function create(userId, payload) {
  if (!TYPES.includes(payload.type)) throw new ApiError(422, 'Type must be received or given');
  const principalMinor = toMinor(payload.principal);
  if (!(principalMinor > 0)) throw new ApiError(422, 'Principal must be greater than zero');
  const party = await assertParty(userId, payload.party_id);

  const plan = resolvePlan(principalMinor, payload.monthly_payment, payload.total_installments);
  const installments = buildSchedule({
    principalMinor,
    monthlyMinor: plan.monthly,
    count: plan.count,
    startDate: payload.start_date,
  });

  const loanId = await loanModel.createWithInstallments({
    userId,
    partyId: party ? party.id : null,
    type: payload.type,
    principalMinor,
    monthlyPaymentMinor: plan.monthly,
    totalInstallments: plan.count,
    startDate: payload.start_date,
    note: payload.note,
  }, installments);
  return get(userId, loanId);
}

/** PUT /api/loans/:id — notes / party / status only. The schedule itself is fixed. */
async function update(userId, id, payload) {
  await assertLoan(userId, id);
  const fields = {};
  if (payload.status !== undefined) {
    if (!STATUSES.includes(payload.status)) throw new ApiError(422, 'Unknown loan status');
    fields.status = payload.status;
  }
  if (payload.party_id !== undefined) {
    const party = await assertParty(userId, payload.party_id);
    fields.party_id = party ? party.id : '';
  }
  if (payload.note !== undefined) fields.note = payload.note;
  const row = await loanModel.update(userId, id, fields);
  return { loan: decorate(row) };
}

/** PUT /api/loans/:id/installments/:instId — paid true/false, then re-count progress. */
async function setInstallmentPaid(userId, loanId, instId, paid) {
  await assertLoan(userId, loanId);
  const inst = await loanModel.findInstallment(userId, loanId, instId);
  if (!inst) throw new ApiError(404, 'Installment not found');
  const ok = await loanModel.setInstallmentPaid(userId, loanId, instId, paid, paid ? todayIso() : null);
  if (!ok) throw new ApiError(404, 'Installment not found');
  const progress = await loanModel.progress(userId, loanId);
  await loanModel.applyProgress(userId, loanId, progress);
  return get(userId, loanId);
}

/** DELETE /api/loans/:id — soft; installment rows stay for the audit trail. */
async function remove(userId, id) {
  await assertLoan(userId, id);
  await loanModel.softDelete(userId, id);
}

module.exports = {
  list, get, create, update, setInstallmentPaid, remove,
  addMonths, buildSchedule, resolvePlan,
};
