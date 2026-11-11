// -----------------------------------------------------------------------------
//  userModel — thin SQL data-access layer for the `users` table.
//  No business logic here; that lives in services/.
// -----------------------------------------------------------------------------
const { pool } = require('../config/db');

const SAFE_COLUMNS =
  'id, phone, name, currency, lang, footer_text, (pin_hash IS NOT NULL) AS has_pin, created_at, updated_at';

/** Look up a user by phone (only if not soft-deleted). Returns raw row incl. password_hash. */
async function findByPhoneWithSecret(phone) {
  const [rows] = await pool.query(
    'SELECT id, phone, password_hash, name, currency, lang, footer_text, '
    + '(pin_hash IS NOT NULL) AS has_pin, created_at, updated_at '
    + 'FROM users WHERE phone = ? AND deleted_at IS NULL LIMIT 1',
    [phone]
  );
  return rows[0] || null;
}

/** Look up a user by id (safe columns only — no password_hash). */
async function findByIdSafe(id) {
  const [rows] = await pool.query(
    `SELECT ${SAFE_COLUMNS} FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

/** Insert a new user; returns the auto-increment id. */
async function create({ phone, passwordHash, name, currency, lang }) {
  const [result] = await pool.query(
    'INSERT INTO users (phone, password_hash, name, currency, lang) VALUES (?, ?, ?, ?, ?)',
    [phone, passwordHash, name, currency, lang]
  );
  return result.insertId;
}

/** Update profile fields (name, currency, lang, footer_text). Any subset. */
async function updateProfile(id, fields) {
  const allowed = ['name', 'currency', 'lang', 'footer_text'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (keys.length === 0) return findByIdSafe(id);
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k]);
  await pool.query(`UPDATE users SET ${setClause} WHERE id = ?`, [...values, id]);
  return findByIdSafe(id);
}

/** Change password (after verifying the old one at the service layer). */
async function updatePassword(id, passwordHash) {
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
}

/**
 * The app-lock code, secret column only — asked for by the two places that must
 * compare it, never by a profile read (those get `has_pin`).
 */
async function findPinHash(id) {
  const [rows] = await pool.query(
    'SELECT pin_hash FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [id]
  );
  return rows[0] ? rows[0].pin_hash : undefined; // undefined = no such user, null = no lock
}

/** Set, change or clear (pass null) the app-lock code. */
async function setPinHash(id, pinHash) {
  await pool.query('UPDATE users SET pin_hash = ? WHERE id = ?', [pinHash, id]);
}

/** Soft delete. */
async function softDelete(id) {
  await pool.query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
}

module.exports = {
  findByPhoneWithSecret,
  findByIdSafe,
  create,
  updateProfile,
  updatePassword,
  findPinHash,
  setPinHash,
  softDelete,
};
