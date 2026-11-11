// -----------------------------------------------------------------------------
//  transactionModel — SQL data access for `transactions` (طلب / بدهی rows).
//  Amounts are integer minor units; type is 'credit' (they owe me) or
//  'debit' (I owe them). Everything is scoped by user_id AND party_id.
// -----------------------------------------------------------------------------
const { pool } = require('../config/db');

const COLUMNS = 'id, party_id, type, amount_minor, description, image_url, txn_date, created_at, updated_at';

/**
 * Every live row of a party, oldest first. The running balance is a cumulative
 * sum, so it has to be computed over the FULL history — date filters are applied
 * afterwards, in the service. Personal ledgers are small (hundreds of rows), so
 * reading them all is cheaper and far simpler than a windowed SQL re-count.
 */
async function listAllForParty(userId, partyId) {
  const [rows] = await pool.query(
    `SELECT ${COLUMNS} FROM transactions
      WHERE user_id = ? AND party_id = ? AND deleted_at IS NULL
      ORDER BY txn_date ASC, id ASC`,
    [userId, partyId]
  );
  return rows;
}

async function findById(userId, partyId, id) {
  const [rows] = await pool.query(
    `SELECT ${COLUMNS} FROM transactions
      WHERE user_id = ? AND party_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    [userId, partyId, id]
  );
  return rows[0] || null;
}

async function create({ userId, partyId, type, amountMinor, description, txnDate }) {
  const [result] = await pool.query(
    'INSERT INTO transactions (user_id, party_id, type, amount_minor, description, txn_date) ' +
    'VALUES (?, ?, ?, ?, ?, ?)',
    [userId, partyId, type, amountMinor, description || null, txnDate]
  );
  return result.insertId;
}

/** Editable fields only — type/amount/date/name come from the service, already clean. */
async function update(userId, partyId, id, fields) {
  const allowed = ['type', 'amount_minor', 'description', 'txn_date', 'image_url'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k) && fields[k] !== undefined);
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => (k === 'description' || k === 'image_url'
      ? (fields[k] === '' ? null : fields[k])
      : fields[k]));
    await pool.query(
      `UPDATE transactions SET ${setClause} WHERE user_id = ? AND party_id = ? AND id = ?`,
      [...values, userId, partyId, id]
    );
  }
  return findById(userId, partyId, id);
}

async function softDelete(userId, partyId, id) {
  const [result] = await pool.query(
    'UPDATE transactions SET deleted_at = CURRENT_TIMESTAMP ' +
    'WHERE user_id = ? AND party_id = ? AND id = ? AND deleted_at IS NULL',
    [userId, partyId, id]
  );
  return result.affectedRows > 0;
}

/** Attach a photo path (Phase 5 uploads). Kept separate so the image column has ONE writer. */
async function setImage(userId, partyId, id, imageUrl) {
  await pool.query(
    'UPDATE transactions SET image_url = ? WHERE user_id = ? AND party_id = ? AND id = ?',
    [imageUrl, userId, partyId, id]
  );
  return findById(userId, partyId, id);
}

module.exports = { listAllForParty, findById, create, update, softDelete, setImage };
