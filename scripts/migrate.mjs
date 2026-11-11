// -----------------------------------------------------------------------------
//  migrate.mjs — applies the Phase 9 columns WITHOUT dropping anything.
//
//  database/schema.sql is a reload script: every table starts with
//  `DROP TABLE IF EXISTS`, so running it against a database that already holds a
//  real ledger would erase it. New columns therefore get their own path, and this
//  runner is idempotent — it asks information_schema what is already there and
//  only alters what is missing, so it can be run again after every pull.
//
//  A fresh install still only needs `npm run db:load` (schema.sql carries these
//  columns too); this is for databases that already have data in them.
//
//  Run with: node scripts/migrate.mjs      (or: npm run db:migrate)
// -----------------------------------------------------------------------------
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { pool } = require('../server/config/db');

/** Everything Phase 9 needs, in the order a person reading the table expects. */
const ADDS = [
  {
    table: 'users',
    column: 'pin_hash',
    sql: "ALTER TABLE users ADD COLUMN pin_hash VARCHAR(255) DEFAULT NULL " +
         "COMMENT 'bcrypt of the optional app-lock PIN (Phase 9)' AFTER footer_text",
    why: 'app lock (the PIN never leaves the server in plain text)',
  },
  {
    table: 'backups',
    column: 'kind',
    sql: "ALTER TABLE backups ADD COLUMN kind ENUM('auto','manual') NOT NULL DEFAULT 'manual' " +
         "COMMENT 'who asked for this copy' AFTER size_bytes",
    why: 'automatic backup can be pruned without eating the copies you saved yourself',
  },
];

const hasColumn = async (table, column) => {
  const [rows] = await pool.query(
    'SELECT 1 FROM information_schema.COLUMNS ' +
    'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
};

async function main() {
  let applied = 0;
  let present = 0;

  for (const a of ADDS) {
    if (await hasColumn(a.table, a.column)) {
      present += 1;
      console.log(`skip  ${a.table}.${a.column} — already there`);
      continue;
    }
    await pool.query(a.sql);
    applied += 1;
    console.log(`apply ${a.table}.${a.column}  (${a.why})`);
  }

  console.log(`\nmigrate: ${applied} applied, ${present} already present`);
  await pool.end();
}

main().catch((err) => {
  console.error('migrate failed:', err.message);
  process.exit(1);
});
