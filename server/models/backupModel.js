// -----------------------------------------------------------------------------
//  backupModel — data access for the backup feature (💾 Phase 5).
//
//  Two jobs:
//    1. READ a whole user's book in a handful of flat queries (the snapshot is
//       assembled in the service, which keeps the SQL here very boring), and
//    2. WRITE it back inside ONE transaction (wipe + insert, or merge), plus the
//       small `backups` table that remembers the server-side copies.
//
//  Everything is scoped by user_id. The writes take a `conn` (a pooled
//  connection) so the service can hold one transaction open across tables.
// -----------------------------------------------------------------------------
const { pool } = require('../config/db');

// --- the backups table -------------------------------------------------------

/** Newest-first, so "keep the last N" is a simple slice in the service. */
async function listByUser(userId) {
  const [rows] = await pool.query(
    'SELECT id, file_path, size_bytes, kind, created_at FROM backups '
    + 'WHERE user_id = ? ORDER BY id DESC',
    [userId]
  );
  return rows;
}

async function findById(userId, id) {
  const [rows] = await pool.query(
    'SELECT id, file_path, size_bytes, kind, created_at FROM backups WHERE user_id = ? AND id = ? LIMIT 1',
    [userId, id]
  );
  return rows[0] || null;
}

async function create(userId, filePath, sizeBytes, kind = 'manual') {
  const [result] = await pool.query(
    'INSERT INTO backups (user_id, file_path, size_bytes, kind) VALUES (?, ?, ?, ?)',
    [userId, filePath, sizeBytes, kind]
  );
  return result.insertId;
}

async function remove(userId, id) {
  const [result] = await pool.query('DELETE FROM backups WHERE user_id = ? AND id = ?', [userId, id]);
  return result.affectedRows > 0;
}

// --- reading the book --------------------------------------------------------

async function readBook(userId) {
  // LIVE rows only. A backup must never resurrect something the user deleted:
  // soft-deleted rows are skipped, exactly like every screen does.
  const [parties, bank, notes, transactions, checks, loans, installments, reminders] = await Promise.all([
    pool.query('SELECT id, name, phone, avatar_url, note, created_at FROM parties WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC', [userId]),
    pool.query(
      'SELECT b.*, p.id AS pid FROM party_bank_info b JOIN parties p ON p.id = b.party_id ' +
      'WHERE p.user_id = ? ORDER BY b.id ASC', [userId]),
    pool.query(
      'SELECT n.id, n.party_id, n.note, n.created_at FROM party_notes n JOIN parties p ON p.id = n.party_id ' +
      'WHERE p.user_id = ? ORDER BY n.id ASC', [userId]),
    pool.query(
      'SELECT t.id, t.party_id, t.type, t.amount_minor, t.description, t.image_url, t.txn_date, t.created_at ' +
      'FROM transactions t JOIN parties p ON p.id = t.party_id ' +
      'WHERE t.user_id = ? AND t.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY t.id ASC', [userId]),
    pool.query(
      'SELECT id, party_id, type, check_number, bank_name, branch_name, amount_minor, due_date, status, image_url, note, created_at ' +
      'FROM checks WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC', [userId]),
    pool.query(
      'SELECT id, party_id, type, principal_minor, monthly_payment_minor, total_installments, paid_installments, ' +
      'start_date, status, note, created_at FROM loans WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC', [userId]),
    pool.query(
      'SELECT i.id, i.loan_id, i.installment_number, i.due_date, i.amount_minor, i.paid, i.paid_date ' +
      'FROM loan_installments i JOIN loans l ON l.id = i.loan_id WHERE l.user_id = ? ORDER BY i.id ASC', [userId]),
    pool.query(
      'SELECT id, party_id, title, message, remind_at, sent FROM reminders WHERE user_id = ? ORDER BY id ASC', [userId]),
  ]);

  return {
    parties: parties[0],
    bank: bank[0],
    notes: notes[0],
    transactions: transactions[0],
    checks: checks[0],
    loans: loans[0],
    installments: installments[0],
    reminders: reminders[0],
  };
}

/**
 * Every picture this user owns, including the rows a soft delete hid — exactly
 * the set that wipe() is about to remove, so the disk can be cleaned with it.
 */
async function listImageUrls(conn, userId) {
  const [rows] = await conn.query(
    'SELECT image_url FROM transactions WHERE user_id = ? AND image_url IS NOT NULL ' +
    'UNION ALL SELECT image_url FROM checks WHERE user_id = ? AND image_url IS NOT NULL',
    [userId, userId]
  );
  return rows.map((r) => r.image_url);
}

/** Rows currently alive — used to skip duplicates when merging a backup in. */
async function readSignatures(userId) {
  const [txns, checks, loans, reminders] = await Promise.all([
    pool.query(
      'SELECT t.type, t.amount_minor, t.txn_date, t.description FROM transactions t JOIN parties p ON p.id = t.party_id ' +
      'WHERE t.user_id = ? AND t.deleted_at IS NULL AND p.deleted_at IS NULL', [userId]),
    pool.query('SELECT type, amount_minor, due_date, check_number FROM checks WHERE user_id = ? AND deleted_at IS NULL', [userId]),
    pool.query('SELECT type, principal_minor, start_date FROM loans WHERE user_id = ? AND deleted_at IS NULL', [userId]),
    pool.query('SELECT title, remind_at FROM reminders WHERE user_id = ?', [userId]),
  ]);
  return {
    transactions: txns[0],
    checks: checks[0],
    loans: loans[0],
    reminders: reminders[0],
  };
}

// --- writing the book --------------------------------------------------------

/** Order matters only for readability: children first, parties last. */
async function wipe(conn, userId) {
  await conn.query(
    'DELETE i FROM loan_installments i JOIN loans l ON l.id = i.loan_id WHERE l.user_id = ?', [userId]);
  await conn.query('DELETE FROM loans WHERE user_id = ?', [userId]);
  await conn.query('DELETE FROM checks WHERE user_id = ?', [userId]);
  await conn.query('DELETE FROM reminders WHERE user_id = ?', [userId]);
  await conn.query('DELETE FROM transactions WHERE user_id = ?', [userId]);
  await conn.query('DELETE n FROM party_notes n JOIN parties p ON p.id = n.party_id WHERE p.user_id = ?', [userId]);
  await conn.query('DELETE b FROM party_bank_info b JOIN parties p ON p.id = b.party_id WHERE p.user_id = ?', [userId]);
  await conn.query('DELETE FROM parties WHERE user_id = ?', [userId]);
}

async function insertParty(conn, userId, p) {
  const [result] = await conn.query(
    'INSERT INTO parties (user_id, name, phone, avatar_url, note) VALUES (?, ?, ?, ?, ?)',
    [userId, p.name, p.phone || null, p.avatar_url || null, p.note || null]
  );
  return result.insertId;
}

async function insertBank(conn, partyId, b) {
  const fields = ['bank_name', 'card_number', 'account_number', 'iban', 'branch', 'account_holder'];
  const values = fields.map((f) => b[f] || null);
  // One row per party (UNIQUE party_id), so a re-restore must UPDATE, not fail.
  await conn.query(
    `INSERT INTO party_bank_info (party_id, ${fields.join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${fields.map((f) => `${f} = VALUES(${f})`).join(', ')}`,
    [partyId, ...values]
  );
}

async function insertNote(conn, partyId, note) {
  await conn.query('INSERT INTO party_notes (party_id, note) VALUES (?, ?)', [partyId, note.note]);
}

async function insertTxn(conn, userId, partyId, t) {
  await conn.query(
    'INSERT INTO transactions (user_id, party_id, type, amount_minor, description, image_url, txn_date) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, partyId, t.type, t.amount_minor, t.description || null, t.image_url || null, t.txn_date]
  );
}

async function findPartyByName(conn, userId, name) {
  const [rows] = await conn.query(
    'SELECT id FROM parties WHERE user_id = ? AND name = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1',
    [userId, name]
  );
  return rows[0] ? rows[0].id : null;
}

async function insertCheck(conn, userId, partyId, c) {
  await conn.query(
    'INSERT INTO checks (user_id, party_id, type, check_number, bank_name, branch_name, amount_minor, ' +
    'due_date, status, image_url, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      userId, partyId, c.type, c.check_number || null, c.bank_name || null, c.branch_name || null,
      c.amount_minor, c.due_date, c.status || 'pending', c.image_url || null, c.note || null,
    ]
  );
}

async function insertLoan(conn, userId, partyId, l) {
  const [result] = await conn.query(
    'INSERT INTO loans (user_id, party_id, type, principal_minor, monthly_payment_minor, total_installments, ' +
    'paid_installments, start_date, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      userId, partyId, l.type, l.principal_minor, l.monthly_payment_minor || null,
      l.total_installments || null, l.paid_installments || 0, l.start_date,
      l.status || 'active', l.note || null,
    ]
  );
  return result.insertId;
}

async function insertInstallments(conn, loanId, rows) {
  if (!rows.length) return;
  const values = rows.map((i) => [loanId, i.installment_number, i.due_date, i.amount_minor, i.paid ? 1 : 0, i.paid_date || null]);
  await conn.query(
    'INSERT INTO loan_installments (loan_id, installment_number, due_date, amount_minor, paid, paid_date) VALUES ?',
    [values]
  );
}

async function insertReminder(conn, userId, partyId, r) {
  await conn.query(
    'INSERT INTO reminders (user_id, party_id, title, message, remind_at, sent) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, partyId, r.title, r.message || null, r.remind_at, r.sent ? 1 : 0]
  );
}

module.exports = {
  // backups table
  listByUser, findById, create, remove,
  // reading
  readBook, readSignatures, listImageUrls,
  // writing (all take a transaction connection)
  wipe, insertParty, insertBank, insertNote, insertTxn, insertCheck,
  insertLoan, insertInstallments, insertReminder, findPartyByName,
};
