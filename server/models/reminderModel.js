// -----------------------------------------------------------------------------
//  reminderModel — SQL access for `reminders` (تذكير / یادآوری).
//  `sent` doubles as "handled": 0 = still waiting, 1 = shown / acknowledged.
// -----------------------------------------------------------------------------
const { pool } = require('../config/db');

const COLUMNS = `r.id, r.party_id, p.name AS party_name, r.title, r.message,
                 r.remind_at, r.sent, r.created_at`;

const BASE = `SELECT ${COLUMNS} FROM reminders r
                LEFT JOIN parties p ON p.id = r.party_id
               WHERE r.user_id = ?
                 AND (r.party_id IS NULL OR p.deleted_at IS NULL)`;

/**
 * A reminder attached to a party follows that party: when its book is closed, the
 * reminder stops showing and stops firing — nothing about it is deleted, it is just
 * no longer a thing the user can act on. Reminders with no party (`party_id IS NULL`)
 * are the user's own and always stay.
 */
/** All reminders, the pending ones nearest in time first. */
async function listByUser(userId) {
  const [rows] = await pool.query(`${BASE} ORDER BY r.sent ASC, r.remind_at ASC`, [userId]);
  return rows;
}

/**
 * Unacknowledged reminders whose time has come (or passed).
 * `now` is the CLIENT clock as 'YYYY-MM-DD HH:MM:SS': remind_at is stored as the
 * wall-clock time the user picked, so the device that shows the notification is the
 * one that decides whether it is due (no server-timezone surprises).
 */
async function listDue(userId, now) {
  const [rows] = await pool.query(`${BASE} AND r.sent = 0 AND r.remind_at <= ? ORDER BY r.remind_at ASC`, [userId, now]);
  return rows;
}

async function findById(userId, id) {
  const [rows] = await pool.query(`${BASE} AND r.id = ? LIMIT 1`, [userId, id]);
  return rows[0] || null;
}

async function create({ userId, partyId, title, message, remindAt }) {
  const [result] = await pool.query(
    'INSERT INTO reminders (user_id, party_id, title, message, remind_at) VALUES (?, ?, ?, ?, ?)',
    [userId, partyId || null, title, message || null, remindAt]
  );
  return result.insertId;
}

async function update(userId, id, fields) {
  const allowed = ['party_id', 'title', 'message', 'remind_at'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k) && fields[k] !== undefined);
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => (k === 'party_id' || k === 'message' ? (fields[k] === '' ? null : fields[k]) : fields[k]));
    await pool.query(`UPDATE reminders SET ${setClause} WHERE user_id = ? AND id = ?`, [...values, userId, id]);
  }
  return findById(userId, id);
}

/** Marks a reminder handled (notification shown / done). */
async function setSent(userId, id, sent) {
  const [result] = await pool.query(
    'UPDATE reminders SET sent = ? WHERE user_id = ? AND id = ?',
    [sent ? 1 : 0, userId, id]
  );
  return result.affectedRows > 0;
}

async function remove(userId, id) {
  const [result] = await pool.query('DELETE FROM reminders WHERE user_id = ? AND id = ?', [userId, id]);
  return result.affectedRows > 0;
}

module.exports = { listByUser, listDue, findById, create, update, setSent, remove };
