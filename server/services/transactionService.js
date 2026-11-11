// -----------------------------------------------------------------------------
//  transactionService — the ledger itself: add / edit / delete a حركة and build
//  the party statement with a RUNNING BALANCE under every row (the feature the
//  reference app is praised for, and the one its reviewers asked to keep visible).
// -----------------------------------------------------------------------------
const txnModel = require('../models/transactionModel');
const partyModel = require('../models/partyModel');
const ApiError = require('../utils/ApiError');
const { toMinor } = require('../utils/money');

const TYPES = ['credit', 'debit'];

/** Local calendar day as YYYY-MM-DD (never UTC — a ledger entry belongs to "today"). */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function assertParty(userId, partyId) {
  const party = await partyModel.findRaw(userId, partyId);
  if (!party) throw new ApiError(404, 'Party not found');
  return party;
}

async function assertTxn(userId, partyId, id) {
  const txn = await txnModel.findById(userId, partyId, id);
  if (!txn) throw new ApiError(404, 'Transaction not found');
  return txn;
}

const signed = (row) => (row.type === 'credit' ? Number(row.amount_minor) : -Number(row.amount_minor));

/**
 * GET /api/parties/:partyId/transactions
 * Full history is summed first, then filtered by date/type, then newest-first,
 * then paginated — so `running_balance_minor` is correct even on page 3 or when
 * the user filters to one month.
 */
async function statement(userId, partyId, { from = '', to = '', type = '', page = 1, limit = 50 } = {}) {
  await assertParty(userId, partyId);
  const rows = await txnModel.listAllForParty(userId, partyId);

  let running = 0;
  const withBalance = rows.map((r) => {
    running += signed(r);
    return { ...r, running_balance_minor: running };
  });

  let filtered = withBalance;
  if (from) filtered = filtered.filter((r) => r.txn_date >= from);
  if (to) filtered = filtered.filter((r) => r.txn_date <= to);
  if (type) filtered = filtered.filter((r) => r.type === type);

  const ordered = filtered.slice().reverse(); // newest first, balances kept as computed
  const p = Math.max(1, Number(page) || 1);
  const per = Math.min(200, Math.max(1, Number(limit) || 50));
  const start = (p - 1) * per;

  // Totals come from the party aggregate (single source of truth with the list screen).
  const party = await partyModel.findById(userId, partyId);

  return {
    transactions: ordered.slice(start, start + per),
    meta: {
      count: filtered.length,
      page: p,
      limit: per,
      total_credit_minor: Number(party.credit_minor),
      total_debit_minor: Number(party.debit_minor),
      balance_minor: Number(party.balance_minor),
      // Balance at the END of the visible window — what the statement footer shows.
      window_balance_minor: filtered.length ? filtered[filtered.length - 1].running_balance_minor : 0,
    },
  };
}

/** POST /api/parties/:partyId/transactions */
async function createTxn(userId, partyId, payload) {
  await assertParty(userId, partyId);
  if (!TYPES.includes(payload.type)) throw new ApiError(422, 'Type must be credit or debit');
  const amountMinor = toMinor(payload.amount);
  if (!(amountMinor > 0)) throw new ApiError(422, 'Amount must be greater than zero');
  const id = await txnModel.create({
    userId,
    partyId,
    type: payload.type,
    amountMinor,
    description: String(payload.description || '').trim(),
    txnDate: payload.txn_date || today(),
  });
  const [transaction, party] = await Promise.all([
    txnModel.findById(userId, partyId, id),
    partyModel.findById(userId, partyId),
  ]);
  return { transaction, party };
}

/** PUT /api/parties/:partyId/transactions/:id — any subset of the editable fields. */
async function updateTxn(userId, partyId, id, payload) {
  await assertParty(userId, partyId);
  await assertTxn(userId, partyId, id);
  const fields = {};
  if (payload.type !== undefined) {
    if (!TYPES.includes(payload.type)) throw new ApiError(422, 'Type must be credit or debit');
    fields.type = payload.type;
  }
  if (payload.amount !== undefined) {
    const amountMinor = toMinor(payload.amount);
    if (!(amountMinor > 0)) throw new ApiError(422, 'Amount must be greater than zero');
    fields.amount_minor = amountMinor;
  }
  if (payload.description !== undefined) fields.description = String(payload.description).trim();
  if (payload.txn_date !== undefined) fields.txn_date = payload.txn_date;
  const transaction = await txnModel.update(userId, partyId, id, fields);
  const party = await partyModel.findById(userId, partyId);
  return { transaction, party };
}

/** DELETE /api/parties/:partyId/transactions/:id — soft, so the trail survives. */
async function removeTxn(userId, partyId, id) {
  await assertParty(userId, partyId);
  await assertTxn(userId, partyId, id);
  await txnModel.softDelete(userId, partyId, id);
  const party = await partyModel.findById(userId, partyId);
  return { party };
}

/** GET /api/parties/:partyId/transactions/:id — used by the edit sheet. */
async function getTxn(userId, partyId, id) {
  await assertParty(userId, partyId);
  return { transaction: await assertTxn(userId, partyId, id) };
}

/**
 * POST /api/parties/:partyId/settle — close one account with a single entry.
 *
 * The reference app sells this as «تسویه حساب» in the paid version; here it is
 * just a ledger rule: whatever the balance is, put the same number on the other
 * side so the account reads zero. Nothing is deleted and no total is edited by
 * hand, so the statement stays a true history — the closing entry is visible in
 * it and can be deleted like any other حركة if the owner changes their mind.
 *
 * The wording is sent by the screen (in the user's own language); the fallback
 * here is only for direct API calls.
 */
async function settleTxn(userId, partyId, { txn_date, description } = {}) {
  await assertParty(userId, partyId);
  const before = await partyModel.findById(userId, partyId);
  const closed = Number(before.balance_minor);
  if (closed === 0) throw new ApiError(422, 'This account is already settled');

  const id = await txnModel.create({
    userId,
    partyId,
    // balance > 0 means the owner is owed: close it on the debit side, and back.
    type: closed > 0 ? 'debit' : 'credit',
    amountMinor: Math.abs(closed),
    description: String(description || '').trim() || 'Settlement',
    txnDate: txn_date || today(),
  });

  const [transaction, party] = await Promise.all([
    txnModel.findById(userId, partyId, id),
    partyModel.findById(userId, partyId),
  ]);
  return { transaction, party, closed_minor: closed };
}

module.exports = {
  statement,
  createTxn,
  updateTxn,
  removeTxn,
  getTxn,
  settleTxn,
  today,
};
