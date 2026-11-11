// -----------------------------------------------------------------------------
//  reportService — the numbers behind a printed report (📑 Phase 5).
//
//  It deliberately returns DATA, not a PDF. Why: Arabic/Persian text in a PDF
//  needs a shaping engine plus an embedded font (both a heavy dependency and a
//  build-time asset), while the client already renders perfect RTL/Jalali text.
//  So the server guarantees the figures and the browser produces the PDF with
//  "Print -> Save as PDF" — same paper, zero extra dependencies, works offline.
//
//  Every figure comes from the SAME queries the screens use, so a printed report
//  can never disagree with what the user saw on screen.
// -----------------------------------------------------------------------------
const partyModel = require('../models/partyModel');
const txnModel = require('../models/transactionModel');
const userModel = require('../models/userModel');
const checkService = require('./checkService');
const loanService = require('./loanService');
const ApiError = require('../utils/ApiError');

const signed = (row) => (row.type === 'credit' ? Number(row.amount_minor) : -Number(row.amount_minor));

async function assertParty(userId, partyId) {
  const party = await partyModel.findRaw(userId, Number(partyId));
  if (!party) throw new ApiError(404, 'Party not found');
  return party;
}

/**
 * One party's statement, ready to print.
 * The running balance is computed over the FULL history first (a cumulative sum
 * cannot be filtered before it is accumulated), then the window is applied —
 * exactly like transactionService.statement does for the screen.
 */
async function partyStatement(userId, partyId, { from = '', to = '' } = {}) {
  const raw = await assertParty(userId, partyId);

  const [party, bank, notes, rows, user] = await Promise.all([
    partyModel.findById(userId, raw.id),
    partyModel.findBank(userId, raw.id),
    partyModel.listNotes(userId, raw.id),
    txnModel.listAllForParty(userId, raw.id),
    userModel.findByIdSafe(userId),
  ]);

  let running = 0;
  const withBalance = rows.map((r) => {
    running += signed(r);
    return { ...r, running_balance_minor: running };
  });

  let filtered = withBalance;
  if (from) filtered = filtered.filter((r) => r.txn_date >= from);
  if (to) filtered = filtered.filter((r) => r.txn_date <= to);

  return {
    report: {
      kind: 'party_statement',
      generated_at: new Date().toISOString(),
      range: { from: from || null, to: to || null },
      user: { name: user.name, phone: user.phone, currency: user.currency, lang: user.lang, footer_text: user.footer_text },
      party,
      bank: bank || null,
      notes: notes || [],
      rows: filtered.map((r) => ({
        txn_date: r.txn_date,
        type: r.type,
        description: r.description,
        amount_minor: Number(r.amount_minor),
        running_balance_minor: Number(r.running_balance_minor),
        image_url: r.image_url,
      })),
      totals: {
        count: filtered.length,
        credit_minor: Number(party.credit_minor),
        debit_minor: Number(party.debit_minor),
        balance_minor: Number(party.balance_minor),
        // What the printed footer shows when a date window is applied.
        window_balance_minor: filtered.length ? Number(filtered[filtered.length - 1].running_balance_minor) : 0,
      },
    },
  };
}

/**
 * The whole book on one page: every party's balance, plus what is still out on
 * checks and loans. Used for the "ledger summary" print and for the demo.
 */
async function bookSummary(userId) {
  const [partiesRes, checksRes, loansRes, user] = await Promise.all([
    partyModel.listByUser(userId, {}),
    checkService.list(userId, { status: 'pending' }),
    loanService.list(userId, {}),
    userModel.findByIdSafe(userId),
  ]);

  const parties = partiesRes || [];
  const sum = (key) => parties.reduce((s, p) => s + Number(p[key]), 0);

  return {
    report: {
      kind: 'book_summary',
      generated_at: new Date().toISOString(),
      user: { name: user.name, phone: user.phone, currency: user.currency, lang: user.lang, footer_text: user.footer_text },
      parties: parties.map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        txn_count: Number(p.txn_count),
        credit_minor: Number(p.credit_minor),
        debit_minor: Number(p.debit_minor),
        balance_minor: Number(p.balance_minor),
      })),
      totals: {
        party_count: parties.length,
        credit_minor: sum('credit_minor'),
        debit_minor: sum('debit_minor'),
        balance_minor: sum('balance_minor'),
        pending_checks_minor: checksRes.meta.pending_received_minor - checksRes.meta.pending_issued_minor,
        pending_check_count: checksRes.meta.count,
        loans_remaining_minor: loansRes.meta.remaining_received_minor - loansRes.meta.remaining_given_minor,
        open_loan_count: loansRes.meta.count,
      },
      checks_meta: checksRes.meta,
      loans_meta: loansRes.meta,
    },
  };
}

module.exports = { partyStatement, bookSummary };
