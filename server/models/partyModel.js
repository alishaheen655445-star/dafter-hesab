// -----------------------------------------------------------------------------
//  partyModel — SQL data access for `parties`, `party_bank_info`, `party_notes`.
//  Every query is scoped by user_id so one account can never read another's rows.
//  No business logic here — that lives in services/partyService.js.
// -----------------------------------------------------------------------------
const { pool } = require('../config/db');

// Balance is derived from transactions (Phase 3 fills them in). credit = they
// owe me (طلب), debit = I owe them (بدهی). SUM over non-deleted rows only.
const LIST_SELECT = `
  SELECT p.id, p.name, p.phone, p.avatar_url, p.note,
         p.created_at, p.updated_at,
         COALESCE(t.credit_minor, 0)  AS credit_minor,
         COALESCE(t.debit_minor, 0)   AS debit_minor,
         COALESCE(t.credit_minor, 0) - COALESCE(t.debit_minor, 0) AS balance_minor,
         COALESCE(t.txn_count, 0)     AS txn_count
    FROM parties p
    LEFT JOIN (
      SELECT party_id,
             SUM(CASE WHEN type = 'credit' THEN amount_minor ELSE 0 END) AS credit_minor,
             SUM(CASE WHEN type = 'debit'  THEN amount_minor ELSE 0 END) AS debit_minor,
             COUNT(*)                                                    AS txn_count
        FROM transactions
       WHERE deleted_at IS NULL
       GROUP BY party_id
    ) t ON t.party_id = p.id
   WHERE p.user_id = ? AND p.deleted_at IS NULL`;

/** List a user's parties, newest activity first, with running totals. */
async function listByUser(userId, { search = '' } = {}) {
  const params = [userId];
  let sql = LIST_SELECT;
  if (search) {
    sql += ' AND p.name LIKE ?';
    params.push(`%${search}%`);
  }
  sql += ' ORDER BY p.updated_at DESC, p.id DESC';
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** One party (scoped to its owner), totals included. */
async function findById(userId, id) {
  const [rows] = await pool.query(`${LIST_SELECT} AND p.id = ? LIMIT 1`, [userId, id]);
  return rows[0] || null;
}

/** Raw row without aggregates — used by create/update to read back safe fields. */
async function findRaw(userId, id) {
  const [rows] = await pool.query(
    'SELECT id, user_id, name, phone, avatar_url, note, created_at, updated_at ' +
    'FROM parties WHERE user_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1',
    [userId, id]
  );
  return rows[0] || null;
}

async function create({ userId, name, phone, note }) {
  const [result] = await pool.query(
    'INSERT INTO parties (user_id, name, phone, note) VALUES (?, ?, ?, ?)',
    [userId, name, phone || null, note || null]
  );
  return result.insertId;
}

/** Update name / phone / note / avatar_url. Any subset; returns the fresh row. */
async function update(userId, id, fields) {
  const allowed = ['name', 'phone', 'note', 'avatar_url'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k) && fields[k] !== undefined);
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => (k === 'phone' || k === 'note' || k === 'avatar_url'
      ? (fields[k] === '' ? null : fields[k])
      : fields[k]));
    await pool.query(`UPDATE parties SET ${setClause} WHERE user_id = ? AND id = ?`, [...values, userId, id]);
  }
  return findRaw(userId, id);
}

/** Soft delete — the row stays, everything below it keeps its FKs intact. */
async function softDelete(userId, id) {
  const [result] = await pool.query(
    'UPDATE parties SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ? AND deleted_at IS NULL',
    [userId, id]
  );
  return result.affectedRows > 0;
}

/**
 * A party that is gone takes its money with it: its movements, its cheques and
 * its loans are soft-deleted the same way. Nothing is erased — but a query that
 * filters only `deleted_at IS NULL` can never count a row of a party no screen
 * can open any more. Without this, a deleted account's totals would keep living
 * in the tables as far as any whole-book sum is concerned.
 */
async function softDeleteLedger(userId, partyId) {
  const tail = 'SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND party_id = ? AND deleted_at IS NULL';
  await pool.query(`UPDATE transactions ${tail}`, [userId, partyId]);
  await pool.query(`UPDATE checks ${tail}`, [userId, partyId]);
  await pool.query(`UPDATE loans ${tail}`, [userId, partyId]);
}

/** True when the user already has an active party with this exact name. */
async function nameExists(userId, name, exceptId = null) {
  const params = [userId, name];
  let sql = 'SELECT 1 FROM parties WHERE user_id = ? AND name = ? AND deleted_at IS NULL';
  if (exceptId) { sql += ' AND id <> ?'; params.push(exceptId); }
  const [rows] = await pool.query(`${sql} LIMIT 1`, params);
  return rows.length > 0;
}

// --- party_bank_info (one row per party) -------------------------------------

async function findBank(userId, partyId) {
  const [rows] = await pool.query(
    'SELECT b.bank_name, b.card_number, b.account_number, b.iban, b.branch, b.account_holder ' +
    'FROM party_bank_info b JOIN parties p ON p.id = b.party_id ' +
    'WHERE p.user_id = ? AND b.party_id = ? LIMIT 1',
    [userId, partyId]
  );
  return rows[0] || null;
}

/** Insert-or-update the single bank row for a party. */
async function upsertBank(userId, partyId, data) {
  const fields = ['bank_name', 'card_number', 'account_number', 'iban', 'branch', 'account_holder'];
  const values = fields.map((f) => (data[f] === '' || data[f] === undefined ? null : data[f]));
  await pool.query(
    `INSERT INTO party_bank_info (party_id, ${fields.join(', ')})
     VALUES (?, ${fields.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${fields.map((f) => `${f} = VALUES(${f})`).join(', ')}`,
    [partyId, ...values]
  );
  return findBank(userId, partyId);
}

// --- party_notes (many per party) --------------------------------------------

async function listNotes(userId, partyId) {
  const [rows] = await pool.query(
    'SELECT n.id, n.note, n.created_at FROM party_notes n JOIN parties p ON p.id = n.party_id ' +
    'WHERE p.user_id = ? AND n.party_id = ? ORDER BY n.id DESC',
    [userId, partyId]
  );
  return rows;
}

async function createNote(userId, partyId, note) {
  const [result] = await pool.query('INSERT INTO party_notes (party_id, note) VALUES (?, ?)', [partyId, note]);
  const [rows] = await pool.query('SELECT id, note, created_at FROM party_notes WHERE id = ?', [result.insertId]);
  return rows[0];
}

/** Ownership is enforced through the JOIN on parties.user_id. */
async function deleteNote(userId, noteId) {
  const [result] = await pool.query(
    'DELETE n FROM party_notes n JOIN parties p ON p.id = n.party_id WHERE p.user_id = ? AND n.id = ?',
    [userId, noteId]
  );
  return result.affectedRows > 0;
}

module.exports = {
  listByUser,
  findById,
  findRaw,
  create,
  update,
  softDelete,
  softDeleteLedger,
  nameExists,
  findBank,
  upsertBank,
  listNotes,
  createNote,
  deleteNote,
};
