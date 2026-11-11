// -----------------------------------------------------------------------------
//  checkService — rules for صكوك (checks). Adds the two things the UI needs on
//  top of the raw rows: days left until the due date, and the pending totals.
// -----------------------------------------------------------------------------
const checkModel = require('../models/checkModel');
const partyModel = require('../models/partyModel');
const ApiError = require('../utils/ApiError');
const { toMinor } = require('../utils/money');

const TYPES = ['issued', 'received'];
const STATUSES = ['pending', 'cashed', 'bounced', 'cancelled'];
const DAY_MS = 86400000;

/** Local calendar day (not UTC — "due today" must mean the user's today). */
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole days between today and a YYYY-MM-DD date (negative = already due). */
function daysLeft(dueDate) {
  const due = Date.parse(`${String(dueDate).slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayIso()}T00:00:00Z`);
  return Math.round((due - today) / DAY_MS);
}

async function assertParty(userId, partyId) {
  if (partyId === undefined || partyId === null || partyId === '') return null;
  const party = await partyModel.findRaw(userId, Number(partyId));
  if (!party) throw new ApiError(404, 'Party not found');
  return party;
}

function decorate(row) {
  const left = daysLeft(row.due_date);
  return {
    ...row,
    days_left: left,
    is_overdue: row.status === 'pending' && left < 0,
    is_due_soon: row.status === 'pending' && left >= 0 && left <= 7,
  };
}

/** GET /api/checks */
async function list(userId, filters) {
  const rows = await checkModel.listByUser(userId, filters);
  const checks = rows.map(decorate);
  const sum = (fn) => checks.filter(fn).reduce((s, c) => s + Number(c.amount_minor), 0);
  return {
    checks,
    meta: {
      count: checks.length,
      pending_received_minor: sum((c) => c.status === 'pending' && c.type === 'received'),
      pending_issued_minor: sum((c) => c.status === 'pending' && c.type === 'issued'),
      overdue_count: checks.filter((c) => c.is_overdue).length,
      due_soon_count: checks.filter((c) => c.is_due_soon).length,
    },
  };
}

/** GET /api/checks/:id */
async function get(userId, id) {
  const row = await checkModel.findById(userId, id);
  if (!row) throw new ApiError(404, 'Check not found');
  return { check: decorate(row) };
}

/** POST /api/checks */
async function create(userId, payload) {
  if (!TYPES.includes(payload.type)) throw new ApiError(422, 'Type must be issued or received');
  const amountMinor = toMinor(payload.amount);
  if (!(amountMinor > 0)) throw new ApiError(422, 'Amount must be greater than zero');
  const party = await assertParty(userId, payload.party_id);
  const id = await checkModel.create({
    userId,
    partyId: party ? party.id : null,
    type: payload.type,
    checkNumber: payload.check_number,
    bankName: payload.bank_name,
    branchName: payload.branch_name,
    amountMinor,
    dueDate: payload.due_date,
    note: payload.note,
  });
  return get(userId, id);
}

/** PUT /api/checks/:id — partial update, status included (pending -> cashed...). */
async function update(userId, id, payload) {
  const existing = await checkModel.findById(userId, id);
  if (!existing) throw new ApiError(404, 'Check not found');

  const fields = {};
  if (payload.type !== undefined) {
    if (!TYPES.includes(payload.type)) throw new ApiError(422, 'Type must be issued or received');
    fields.type = payload.type;
  }
  if (payload.status !== undefined) {
    if (!STATUSES.includes(payload.status)) throw new ApiError(422, 'Unknown check status');
    fields.status = payload.status;
  }
  if (payload.amount !== undefined) {
    const amountMinor = toMinor(payload.amount);
    if (!(amountMinor > 0)) throw new ApiError(422, 'Amount must be greater than zero');
    fields.amount_minor = amountMinor;
  }
  if (payload.party_id !== undefined) {
    const party = await assertParty(userId, payload.party_id);
    fields.party_id = party ? party.id : '';
  }
  ['check_number', 'bank_name', 'branch_name', 'due_date', 'note'].forEach((k) => {
    if (payload[k] !== undefined) fields[k] = payload[k];
  });

  const row = await checkModel.update(userId, id, fields);
  return { check: decorate(row) };
}

/** DELETE /api/checks/:id */
async function remove(userId, id) {
  const ok = await checkModel.softDelete(userId, id);
  if (!ok) throw new ApiError(404, 'Check not found');
}

module.exports = { list, get, create, update, remove, daysLeft, STATUSES, TYPES };
