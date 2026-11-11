// -----------------------------------------------------------------------------
//  checkModel — SQL data access for `checks` (صك / چك).
//  issued  = I wrote the check (I owe)      · received = someone gave me a check
//  Status flow: pending -> cashed | bounced | cancelled.
// -----------------------------------------------------------------------------
const { pool } = require('../config/db');

const COLUMNS = `c.id, c.party_id, p.name AS party_name, c.type, c.check_number,
                 c.bank_name, c.branch_name, c.amount_minor, c.due_date, c.status,
                 c.image_url, c.note, c.created_at, c.updated_at`;

const BASE = `SELECT ${COLUMNS} FROM checks c
                LEFT JOIN parties p ON p.id = c.party_id
               WHERE c.user_id = ? AND c.deleted_at IS NULL`;

/** List with optional filters. Newest due date first (the urgent ones on top). */
async function listByUser(userId, { status = '', type = '', partyId = '' } = {}) {
  const params = [userId];
  let sql = BASE;
  if (status) { sql += ' AND c.status = ?'; params.push(status); }
  if (type) { sql += ' AND c.type = ?'; params.push(type); }
  if (partyId) { sql += ' AND c.party_id = ?'; params.push(partyId); }
  sql += ' ORDER BY c.due_date ASC, c.id ASC';
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function findById(userId, id) {
  const [rows] = await pool.query(`${BASE} AND c.id = ? LIMIT 1`, [userId, id]);
  return rows[0] || null;
}

async function create({
  userId, partyId, type, checkNumber, bankName, branchName, amountMinor, dueDate, note,
}) {
  const [result] = await pool.query(
    'INSERT INTO checks (user_id, party_id, type, check_number, bank_name, branch_name, ' +
    'amount_minor, due_date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      userId, partyId || null, type, checkNumber || null, bankName || null,
      branchName || null, amountMinor, dueDate, note || null,
    ]
  );
  return result.insertId;
}

/** Any subset of the editable columns. */
async function update(userId, id, fields) {
  const allowed = ['party_id', 'type', 'check_number', 'bank_name', 'branch_name',
    'amount_minor', 'due_date', 'status', 'note', 'image_url'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k) && fields[k] !== undefined);
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => (['party_id', 'check_number', 'bank_name', 'branch_name', 'note', 'image_url'].includes(k)
      ? (fields[k] === '' ? null : fields[k])
      : fields[k]));
    await pool.query(`UPDATE checks SET ${setClause} WHERE user_id = ? AND id = ?`, [...values, userId, id]);
  }
  return findById(userId, id);
}

async function softDelete(userId, id) {
  const [result] = await pool.query(
    'UPDATE checks SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ? AND deleted_at IS NULL',
    [userId, id]
  );
  return result.affectedRows > 0;
}

module.exports = { listByUser, findById, create, update, softDelete };
