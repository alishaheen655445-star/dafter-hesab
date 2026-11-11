// -----------------------------------------------------------------------------
//  Database connection (mysql2/promise) — a shared connection POOL.
//  Opening a new connection per request is slow; a pool reuses a fixed set.
//
//  TLS policy (see sslFromEnv):
//    - DB_SSL unset         -> no TLS (localhost / XAMPP / Railway private net)
//    - DB_SSL=true          -> TLS with FULL certificate verification (secure)
//    - DB_SSL=true + DB_SSL_CA -> TLS verified against a specific CA file/PEM
//    - DB_SSL=insecure      -> TLS WITHOUT verification. DEV ONLY. Refused in prod.
// -----------------------------------------------------------------------------
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

const baseOptions = {
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Return DECIMAL columns as strings so we control money parsing precisely,
  // and map DB dates without timezone surprises.
  decimalNumbers: false,
  dateStrings: true,
};

/**
 * Builds the mysql2 `ssl` option from env, defaulting to SECURE verification.
 * Only an explicit `DB_SSL=insecure` disables verification, and it is refused
 * in production to prevent MITM exposure.
 */
function sslFromEnv() {
  const raw = String(process.env.DB_SSL || process.env.DB_REQUIRE_SSL || '').toLowerCase();
  if (raw !== 'true' && raw !== '1' && raw !== 'yes' && raw !== 'insecure') return undefined;

  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

  if (raw === 'insecure') {
    if (isProd) {
      throw new Error(
        'DB_SSL=insecure is not allowed in production. ' +
        'Provide DB_SSL=true and (if needed) DB_SSL_CA pointing to the server CA.'
      );
    }
    // eslint-disable-next-line no-console
    console.warn('[db] WARNING: TLS certificate verification is DISABLED (DB_SSL=insecure). Dev only.');
    return { rejectUnauthorized: false };
  }

  // Secure path: verify server cert, optionally against a user-supplied CA.
  const caPath = process.env.DB_SSL_CA;
  const ca = caPath && fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined;
  return { rejectUnauthorized: true, ca };
}

// Accept connection info from EITHER granular DB_* vars (local/.env) OR a
// single DATABASE_URL / Railway MYSQL* vars — so the same image runs on Railway
// and Render with zero code change. URL wins when present.
function buildConfig() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.MYSQLURL;
  if (url) {
    const ssl = sslFromEnv();
    return { uri: url, options: ssl ? { ...baseOptions, ssl } : baseOptions };
  }
  const ssl = sslFromEnv();
  const options = {
    ...baseOptions,
    host: process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'daftar_hesab_app',
  };
  if (ssl) options.ssl = ssl;
  return { options };
}

const cfg = buildConfig();
// mysql2's createPool takes ONE argument: a string URL is parsed, but then every
// option beside it is dropped — and `dateStrings`/`decimalNumbers` are not
// optional here, they are how dates stay text and money stays exact. Passing the
// URL as `uri` inside the options object keeps both: the driver fills host/user
// from it and never overwrites a key we set ourselves.
const pool = mysql.createPool(cfg.uri ? { ...cfg.options, uri: cfg.uri } : cfg.options);

// Small helper used at startup to fail fast if the DB is unreachable.
async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1');
  } finally {
    conn.release();
  }
}

module.exports = { pool, testConnection };
