// -----------------------------------------------------------------------------
//  Deploy-config test: how the pool is built.
//
//  The app speaks to MariaDB in two ways and both have to be right: granular
//  DB_* variables (a local XAMPP) or one connection URL (Railway, Render). The
//  second one is easy to get wrong silently — mysql2's createPool() takes a
//  SINGLE argument, so a URL passed first and the options second loses the
//  options, and `dateStrings` is exactly what keeps dates as text and money as
//  an exact string. Nothing here opens a connection: a pool is lazy, so reading
//  its parsed config is enough.
//
//  Run with: node scripts/test-config.mjs
// -----------------------------------------------------------------------------
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_MODULE = path.join(ROOT, 'server', 'config', 'db.js');

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
};

/** Require db.js with a clean slate and the given environment, then read the pool. */
function loadDb(env) {
  for (const k of ['DATABASE_URL', 'MYSQL_URL', 'MYSQLURL', 'DB_HOST', 'DB_PORT',
    'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_SSL', 'DB_REQUIRE_SSL', 'DB_SSL_CA', 'NODE_ENV']) {
    delete process.env[k];
  }
  Object.assign(process.env, env);
  delete require.cache[require.resolve(DB_MODULE)];
  const mod = require(DB_MODULE);
  const poolConfig = mod.pool.pool.config;
  const conn = poolConfig.connectionConfig;
  mod.pool.end().catch(() => {});
  return { poolConfig, conn };
}

// --- 1. a connection URL, the way Railway and Render hand it over -------------
{
  const { poolConfig, conn } = loadDb({
    DATABASE_URL: 'mysql://ledger:secret123@db.example.com:3307/daftar_hesab',
  });
  check('the URL still gives host, port, user and database',
    conn.host === 'db.example.com' && conn.port === 3307
    && conn.user === 'ledger' && conn.database === 'daftar_hesab',
    `${conn.user}@${conn.host}:${conn.port}/${conn.database}`);
  check('a URL does not cost us the pool size',
    poolConfig.connectionLimit === 10 && poolConfig.waitForConnections === true,
    `limit=${poolConfig.connectionLimit}`);
  // The one that matters most: without it a DATE column arrives as a JS Date and
  // every txn_date in a response changes shape between local and hosted runs.
  check('dateStrings survives a URL deploy', conn.dateStrings === true);
  check('money stays a string, not a float', conn.decimalNumbers === false);
}

// --- 2. granular variables, the local XAMPP case ------------------------------
{
  const { poolConfig, conn } = loadDb({
    DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_USER: 'root', DB_PASSWORD: 'x', DB_NAME: 'daftar_hesab_app',
  });
  check('DB_* vars are read when there is no URL',
    conn.host === '127.0.0.1' && conn.port === 3306 && conn.user === 'root'
    && conn.database === 'daftar_hesab_app', `${conn.user}@${conn.host}:${conn.port}`);
  check('the same pool options apply either way',
    poolConfig.connectionLimit === 10 && conn.dateStrings === true);
}

// --- 3. the URL wins, but only for what was not set on purpose ----------------
{
  const { conn } = loadDb({
    DATABASE_URL: 'mysql://cloud@hosted.example:3306/cloud_db',
    DB_HOST: '10.0.0.9', DB_NAME: 'ignored',
  });
  check('a URL overrides the local DB_* values',
    conn.host === 'hosted.example' && conn.database === 'cloud_db', `${conn.host}/${conn.database}`);
}

// --- 4. the mistake itself, caught at the source ------------------------------
{
  const src = require('node:fs').readFileSync(DB_MODULE, 'utf8');
  check('createPool is never handed a bare URL as its first argument',
    !/createPool\(\s*(?:cfg\.uri|url|process\.env\.(?:DATABASE_URL|MYSQL_URL|MYSQLURL))\s*,/.test(src));
  check('the URL is passed inside the options object',
    /createPool\(\s*cfg\.uri\s*\?\s*\{\s*\.\.\.cfg\.options,\s*uri:\s*cfg\.uri\s*\}\s*:\s*cfg\.options\s*\)/.test(src));
  check('insecure TLS is still refused in production',
    /DB_SSL=insecure is not allowed in production/.test(src));
}

console.log(`\nconfig: ${pass}/${pass + fail} assertions`);
process.exit(fail ? 1 : 0);
