// -----------------------------------------------------------------------------
//  loanModel — SQL access for `loans` and `loan_installments` (قرض / وام).
//  The loan row keeps the plan, the installment rows are the schedule; progress
//  (paid_installments / completed) is always recomputed FROM the installments so
//  the two can never disagree.
// -----------------------------------------------------------------------------
const { pool } = require('../config/db');

const LIST_SELECT = `
  SELECT l.id, l.party_id, p.name AS party_name, l.type, l.principal_minor,
         l.monthly_payment_minor, l.total_installments, l.paid_installments,
         l.start_date, l.status, l.note, l.created_at, l.updated_at,
         COALESCE(i.paid_minor, 0)  AS paid_minor,
         COALESCE(i.open_count, 0)  AS open_count,
         i.next_due_date
    FROM loans l
    LEFT JOIN parties p ON p.id = l.party_id
    LEFT JOIN (
      SELECT loan_id,
             SUM(CASE WHEN paid = 1 THEN amount_minor ELSE 0 END) AS paid_minor,
             SUM(CASE WHEN paid = 0 THEN 1 ELSE 0 END)            AS open_count,
             MIN(CASE WHEN paid = 0 THEN due_date END)            AS next_due_date
        FROM loan_installments
       GROUP BY loan_id
    ) i ON i.loan_id = l.id
   WHERE l.user_id = ? AND l.deleted_at IS NULL`;

async function listByUser(userId, { status = '', type = '', partyId = '' } = {}) {
  const params = [userId];
  let sql = LIST_SELECT;
  if (status) { sql += ' AND l.status = ?'; params.push(status); }
  if (type) { sql += ' AND l.type = ?'; params.push(type); }
  if (partyId) { sql += ' AND l.party_id = ?'; params.push(partyId); }
  sql += " ORDER BY (l.status = 'active') DESC, i.next_due_date ASC, l.id DESC";
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function findById(userId, id) {
  const [rows] = await pool.query(`${LIST_SELECT} AND l.id = ? LIMIT 1`, [userId, id]);
  return rows[0] || null;
}

/** Loan + its whole schedule in ONE transaction, so a failure never leaves an orphan. */
async function createWithInstallments(loan, installments) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO loans (user_id, party_id, type, principal_minor, monthly_payment_minor, ' +
      "total_installments, start_date, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
      [
        loan.userId, loan.partyId || null, loan.type, loan.principalMinor,
        loan.monthlyPaymentMinor || null, loan.totalInstallments, loan.startDate, loan.note || null,
      ]
    );
    const loanId = result.insertId;
    if (installments.length > 0) {
      const values = installments.map((i) => [loanId, i.number, i.dueDate, i.amountMinor]);
      await conn.query(
        'INSERT INTO loan_installments (loan_id, installment_number, due_date, amount_minor) VALUES ?',
        [values]
      );
    }
    await conn.commit();
    return loanId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function listInstallments(userId, loanId) {
  const [rows] = await pool.query(
    'SELECT i.id, i.installment_number, i.due_date, i.amount_minor, i.paid, i.paid_date ' +
    'FROM loan_installments i JOIN loans l ON l.id = i.loan_id ' +
    'WHERE l.user_id = ? AND l.id = ? ORDER BY i.installment_number ASC',
    [userId, loanId]
  );
  return rows;
}

async function findInstallment(userId, loanId, instId) {
  const [rows] = await pool.query(
    'SELECT i.id, i.installment_number, i.due_date, i.amount_minor, i.paid, i.paid_date ' +
    'FROM loan_installments i JOIN loans l ON l.id = i.loan_id ' +
    'WHERE l.user_id = ? AND l.id = ? AND i.id = ? LIMIT 1',
    [userId, loanId, instId]
  );
  return rows[0] || null;
}

/** Mark one installment paid / unpaid. Ownership is enforced through the JOIN. */
async function setInstallmentPaid(userId, loanId, instId, paid, paidDate) {
  const [result] = await pool.query(
    'UPDATE loan_installments i JOIN loans l ON l.id = i.loan_id ' +
    'SET i.paid = ?, i.paid_date = ? WHERE l.user_id = ? AND l.id = ? AND i.id = ?',
    [paid ? 1 : 0, paidDate || null, userId, loanId, instId]
  );
  return result.affectedRows > 0;
}

/** Counts straight from the schedule — the single source of truth for progress. */
async function progress(userId, loanId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total, SUM(i.paid = 1) AS paid_count ' +
    'FROM loan_installments i JOIN loans l ON l.id = i.loan_id WHERE l.user_id = ? AND l.id = ?',
    [userId, loanId]
  );
  return { total: Number(rows[0].total), paidCount: Number(rows[0].paid_count || 0) };
}

/** Writes back paid_installments and flips the loan to completed / back to active.
 *  A cancelled loan stays cancelled — paying an old row must not resurrect it. */
async function applyProgress(userId, loanId, { paidCount, total }) {
  const status = total > 0 && paidCount >= total ? 'completed' : 'active';
  await pool.query(
    "UPDATE loans SET paid_installments = ?, status = IF(status = 'cancelled', 'cancelled', ?) " +
    'WHERE user_id = ? AND id = ? AND deleted_at IS NULL',
    [paidCount, status, userId, loanId]
  );
}

async function update(userId, id, fields) {
  const allowed = ['party_id', 'note', 'status', 'monthly_payment_minor'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k) && fields[k] !== undefined);
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => (k === 'party_id' || k === 'note' ? (fields[k] === '' ? null : fields[k]) : fields[k]));
    await pool.query(`UPDATE loans SET ${setClause} WHERE user_id = ? AND id = ?`, [...values, userId, id]);
  }
  return findById(userId, id);
}

async function softDelete(userId, id) {
  const [result] = await pool.query(
    'UPDATE loans SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ? AND deleted_at IS NULL',
    [userId, id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  listByUser, findById, createWithInstallments, listInstallments, findInstallment,
  setInstallmentPaid, progress, applyProgress, update, softDelete,
};
