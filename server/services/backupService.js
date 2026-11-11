// -----------------------------------------------------------------------------
//  backupService — one JSON snapshot of the WHOLE book, both directions.
//
//  Two ways to be safe, exactly like the reference app:
//    * OFFLINE: the client downloads the snapshot as a file and re-uploads it
//      later. Nothing about it needs a server.
//    * ONLINE: the same snapshot is kept on the server (storage/backups, a
//      folder that is NOT web-served) and is listed/Downloaded/restored only
//      through authenticated routes.
//
//  Restore modes:
//    * replace — wipe the user's rows and put the snapshot back (true restore).
//    * merge   — keep what exists, add only what is missing (safe after a phone
//                change, or when two devices were used in parallel).
//
//  A snapshot never trusts the file it was given: validateSnapshot() rebuilds a
//  clean structure and rejects anything else with a normal 422 + field details.
// -----------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const { pool } = require('../config/db');
const backupModel = require('../models/backupModel');
const userModel = require('../models/userModel');
const ApiError = require('../utils/ApiError');
const { BACKUP_DIR } = require('../config/paths');
const { ownedPath } = require('./attachmentService');
const { safeUnlink } = require('../middleware/upload');

const VERSION = 1;
const APP_TAG = 'daftar-hesab';
const KEEP_COPIES = Number(process.env.BACKUP_KEEP || 10);
// Automatic copies are pruned on their own schedule (Phase 9). If they shared the
// manual quota, the app would quietly push the copies you saved yourself off the
// list every time it made one for you.
const KEEP_AUTO = Number(process.env.BACKUP_KEEP_AUTO || 5);
const KINDS = ['auto', 'manual'];

const MAX = { parties: 2000, transactions: 20000, checks: 5000, loans: 2000, reminders: 2000, notesPerParty: 100 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STAMP_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;

const txt = (v, max) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
};
const int = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

// -----------------------------------------------------------------------------
//  building a snapshot
// -----------------------------------------------------------------------------

async function snapshot(userId) {
  const [book, user] = await Promise.all([backupModel.readBook(userId), userModel.findByIdSafe(userId)]);

  const bankByParty = new Map();
  book.bank.forEach((b) => {
    bankByParty.set(b.party_id, {
      bank_name: b.bank_name, card_number: b.card_number, account_number: b.account_number,
      iban: b.iban, branch: b.branch, account_holder: b.account_holder,
    });
  });
  const notesByParty = new Map();
  book.notes.forEach((n) => {
    if (!notesByParty.has(n.party_id)) notesByParty.set(n.party_id, []);
    notesByParty.get(n.party_id).push({ note: n.note, created_at: n.created_at });
  });
  const instByLoan = new Map();
  book.installments.forEach((i) => {
    if (!instByLoan.has(i.loan_id)) instByLoan.set(i.loan_id, []);
    instByLoan.get(i.loan_id).push({
      installment_number: Number(i.installment_number),
      due_date: i.due_date,
      amount_minor: Number(i.amount_minor),
      paid: Number(i.paid),
      paid_date: i.paid_date,
    });
  });

  const parties = book.parties.map((p) => ({
    ref: Number(p.id),
    name: p.name,
    phone: p.phone,
    avatar_url: p.avatar_url,
    note: p.note,
    bank: bankByParty.get(Number(p.id)) || null,
    notes: notesByParty.get(Number(p.id)) || [],
  }));

  // A check/loan/reminder whose party is gone must still be backed up, but the
  // file has to be SELF-CONSISTENT: a reference the file cannot resolve would be
  // rejected on import. So a dangling reference is normalised to "no party".
  const liveRefs = new Set(parties.map((p) => p.ref));
  const keepRef = (raw) => (raw === null || raw === undefined ? null
    : (liveRefs.has(Number(raw)) ? Number(raw) : null));

  return {
    app: APP_TAG,
    version: VERSION,
    exported_at: new Date().toISOString(),
    user: {
      name: user.name, phone: user.phone, currency: user.currency,
      lang: user.lang, footer_text: user.footer_text,
    },
    data: {
      parties,
      transactions: book.transactions.map((t) => ({
        ref: Number(t.id), party_ref: Number(t.party_id), type: t.type,
        amount_minor: Number(t.amount_minor), description: t.description,
        image_url: t.image_url, txn_date: t.txn_date,
      })),
      checks: book.checks.map((c) => ({
        ref: Number(c.id), party_ref: keepRef(c.party_id), type: c.type,
        check_number: c.check_number, bank_name: c.bank_name, branch_name: c.branch_name,
        amount_minor: Number(c.amount_minor), due_date: c.due_date, status: c.status,
        image_url: c.image_url, note: c.note,
      })),
      loans: book.loans.map((l) => ({
        ref: Number(l.id), party_ref: keepRef(l.party_id), type: l.type,
        principal_minor: Number(l.principal_minor), monthly_payment_minor: l.monthly_payment_minor === null
          ? null : Number(l.monthly_payment_minor),
        total_installments: l.total_installments === null ? null : Number(l.total_installments),
        paid_installments: Number(l.paid_installments), start_date: l.start_date,
        status: l.status, note: l.note,
        installments: instByLoan.get(Number(l.id)) || [],
      })),
      reminders: book.reminders.map((r) => ({
        ref: Number(r.id), party_ref: keepRef(r.party_id),
        title: r.title, message: r.message, remind_at: r.remind_at, sent: Number(r.sent),
      })),
    },
    counts: {
      parties: parties.length,
      transactions: book.transactions.length,
      checks: book.checks.length,
      loans: book.loans.length,
      reminders: book.reminders.length,
    },
  };
}

// -----------------------------------------------------------------------------
//  validating an incoming snapshot
// -----------------------------------------------------------------------------

function fail(field, message) {
  throw new ApiError(422, 'Backup file is not valid', [{ field, message }]);
}

function withinLimits(arr, key) {
  if (!Array.isArray(arr)) fail(`data.${key}`, 'Must be an array');
  if (arr.length > MAX[key]) fail(`data.${key}`, `Too many rows (max ${MAX[key]})`);
  return arr;
}

const checkType = (v, allowed, field) => {
  if (!allowed.includes(v)) fail(field, `Must be one of: ${allowed.join(', ')}`);
  return v;
};

const minorAmount = (v, field) => {
  const n = int(v);
  if (!Number.isInteger(n) || n < 0) fail(field, 'Must be a whole number of minor units');
  if (!(n > 0)) fail(field, 'Amount must be greater than zero');
  return n;
};

const dateOnly = (v, field) => {
  const s = String(v || '').slice(0, 10);
  if (!DATE_RE.test(s)) fail(field, 'Must be YYYY-MM-DD');
  return s;
};

function validateSnapshot(input) {
  if (!input || typeof input !== 'object') fail('file', 'Not a JSON object');
  if (input.app !== APP_TAG) fail('app', 'This is not a دفتر حساب backup file');
  const version = int(input.version);
  if (version !== VERSION) fail('version', `Unsupported backup version (${input.version})`);
  if (!input.data || typeof input.data !== 'object') fail('data', 'Missing backup data');

  const d = input.data;

  // --- parties first: every other row points back at them -------------------
  const parties = withinLimits(d.parties, 'parties').map((p, i) => {
    const name = txt(p.name, 100);
    if (!name) fail(`parties[${i}].name`, 'Party name is required');
    const notesRaw = Array.isArray(p.notes) ? p.notes.slice(0, MAX.notesPerParty) : [];
    return {
      ref: int(p.ref) || i + 1,
      name,
      phone: txt(p.phone, 20),
      avatar_url: txt(p.avatar_url, 255),
      note: txt(p.note, 20000),
      bank: p.bank && typeof p.bank === 'object'
        ? {
          bank_name: txt(p.bank.bank_name, 100), card_number: txt(p.bank.card_number, 25),
          account_number: txt(p.bank.account_number, 35), iban: txt(p.bank.iban, 34),
          branch: txt(p.bank.branch, 50), account_holder: txt(p.bank.account_holder, 100),
        }
        : null,
      notes: notesRaw.map((n, j) => {
        const note = txt(n && n.note, 5000);
        if (!note) fail(`parties[${i}].notes[${j}]`, 'Empty note');
        return { note };
      }),
    };
  });

  const refSet = new Set();
  const partyMap = new Map();
  parties.forEach((p) => {
    if (refSet.has(p.ref)) fail(`parties[${p.ref}]`, 'Duplicate party ref in the file');
    refSet.add(p.ref);
    partyMap.set(p.ref, p);
  });

  // party_ref may be absent (a check/loan without a party) but never unknown.
  const resolvePartyRef = (raw, field) => {
    if (raw === undefined || raw === null || raw === '') return null;
    const ref = int(raw);
    if (!partyMap.has(ref)) fail(field, 'Points at a party that is not in the file');
    return ref;
  };

  const transactions = withinLimits(d.transactions, 'transactions').map((t, i) => ({
    party_ref: resolvePartyRef(t.party_ref, `transactions[${i}].party_ref`),
    type: checkType(t.type, ['credit', 'debit'], `transactions[${i}].type`),
    amount_minor: minorAmount(t.amount_minor, `transactions[${i}].amount_minor`),
    description: txt(t.description, 500),
    image_url: txt(t.image_url, 255),
    txn_date: dateOnly(t.txn_date, `transactions[${i}].txn_date`),
  }));
  transactions.forEach((t) => { if (!(t.amount_minor > 0)) fail('transactions', 'Amount must be greater than zero'); });
  const checks = withinLimits(d.checks, 'checks').map((c, i) => {
    const status = c.status === undefined ? 'pending' : checkType(c.status, ['pending', 'cashed', 'bounced', 'cancelled'], `checks[${i}].status`);
    return {
      party_ref: resolvePartyRef(c.party_ref, `checks[${i}].party_ref`),
      type: checkType(c.type, ['issued', 'received'], `checks[${i}].type`),
      check_number: txt(c.check_number, 50),
      bank_name: txt(c.bank_name, 100),
      branch_name: txt(c.branch_name, 100),
      amount_minor: minorAmount(c.amount_minor, `checks[${i}].amount_minor`),
      due_date: dateOnly(c.due_date, `checks[${i}].due_date`),
      status,
      image_url: txt(c.image_url, 255),
      note: txt(c.note, 5000),
    };
  });

  const loans = withinLimits(d.loans, 'loans').map((l, i) => {
    const installments = Array.isArray(l.installments) ? l.installments : [];
    return {
      party_ref: resolvePartyRef(l.party_ref, `loans[${i}].party_ref`),
      type: checkType(l.type, ['received', 'given'], `loans[${i}].type`),
      principal_minor: minorAmount(l.principal_minor, `loans[${i}].principal_minor`),
      monthly_payment_minor: l.monthly_payment_minor == null ? null : minorAmount(l.monthly_payment_minor, `loans[${i}].monthly_payment_minor`),
      total_installments: l.total_installments == null ? null : int(l.total_installments),
      paid_installments: int(l.paid_installments) || 0,
      start_date: dateOnly(l.start_date, `loans[${i}].start_date`),
      status: l.status === undefined ? 'active' : checkType(l.status, ['active', 'completed', 'cancelled'], `loans[${i}].status`),
      note: txt(l.note, 5000),
      installments: installments.map((x, j) => ({
        installment_number: int(x.installment_number) || j + 1,
        due_date: dateOnly(x.due_date, `loans[${i}].installments[${j}].due_date`),
        amount_minor: minorAmount(x.amount_minor, `loans[${i}].installments[${j}].amount_minor`),
        paid: x.paid ? 1 : 0,
        paid_date: x.paid_date ? dateOnly(x.paid_date, `loans[${i}].installments[${j}].paid_date`) : null,
      })),
    };
  });

  const reminders = withinLimits(d.reminders, 'reminders').map((r, i) => {
    const title = txt(r.title, 200);
    if (!title) fail(`reminders[${i}].title`, 'Title is required');
    const when = String(r.remind_at || '').trim().replace('T', ' ');
    if (!STAMP_RE.test(when)) fail(`reminders[${i}].remind_at`, 'Must be YYYY-MM-DD HH:MM(:SS)');
    return {
      party_ref: resolvePartyRef(r.party_ref, `reminders[${i}].party_ref`),
      title,
      message: txt(r.message, 5000),
      remind_at: when.length === 16 ? `${when}:00` : when,
      sent: r.sent ? 1 : 0,
    };
  });

  return {
    app: APP_TAG,
    version: VERSION,
    exported_at: txt(input.exported_at, 40),
    user: {
      name: txt((input.user || {}).name, 100),
      footer_text: txt((input.user || {}).footer_text, 500),
    },
    data: { parties, transactions, checks, loans, reminders },
    counts: {
      parties: parties.length, transactions: transactions.length, checks: checks.length,
      loans: loans.length, reminders: reminders.length,
    },
  };
}

// -----------------------------------------------------------------------------
//  restoring
// -----------------------------------------------------------------------------

/** "Same row already there" keys for merge mode — loose on purpose (a backup
 *  from another device will not carry our ids). */
const txnSig = (t) => `${t.type}|${t.amount_minor}|${t.txn_date}|${t.description || ''}`;
const chkSig = (c) => `${c.type}|${c.amount_minor}|${c.due_date}|${c.check_number || ''}`;
const loanSig = (l) => `${l.type}|${l.principal_minor}|${l.start_date}`;
const remSig = (r) => `${r.title}|${r.remind_at}`;

async function restore(userId, rawSnapshot, mode = 'replace') {
  const snap = validateSnapshot(rawSnapshot);
  const merge = mode === 'merge';

  const conn = await pool.getConnection();
  const counts = { parties: 0, transactions: 0, checks: 0, loans: 0, reminders: 0, skipped: 0 };
  let orphans = []; // pictures the wipe is about to leave without a row
  try {
    await conn.beginTransaction();

    let existing = null;
    if (merge) {
      existing = await backupModel.readSignatures(userId);
      existing = {
        transactions: new Set(existing.transactions.map(txnSig)),
        checks: new Set(existing.checks.map(chkSig)),
        loans: new Set(existing.loans.map(loanSig)),
        reminders: new Set(existing.reminders.map(remSig)),
      };
    } else {
      // The rows go away for good, so their files must go with them.
      orphans = await backupModel.listImageUrls(conn, userId);
      await backupModel.wipe(conn, userId);
    }

    // parties: replace always inserts fresh rows; merge reuses a same-named party
    // and leaves ITS OWN bank info / notes untouched, so merging twice is harmless.
    const refToId = new Map();
    for (const p of snap.data.parties) {
      const knownId = merge ? await backupModel.findPartyByName(conn, userId, p.name) : null;
      const id = knownId || await backupModel.insertParty(conn, userId, p);
      refToId.set(p.ref, id);
      if (!knownId) {
        counts.parties += 1;
        if (p.bank) await backupModel.insertBank(conn, id, p.bank);
        for (const n of p.notes) await backupModel.insertNote(conn, id, n);
      }
    }

    const partyIdOf = (ref) => (ref === null ? null : refToId.get(ref) || null);
    const seen = (set, sig) => (merge && set.has(sig));

    for (const t of snap.data.transactions) {
      if (seen(existing && existing.transactions, txnSig(t))) counts.skipped += 1;
      else { await backupModel.insertTxn(conn, userId, partyIdOf(t.party_ref), t); counts.transactions += 1; }
    }
    for (const c of snap.data.checks) {
      if (seen(existing && existing.checks, chkSig(c))) counts.skipped += 1;
      else { await backupModel.insertCheck(conn, userId, partyIdOf(c.party_ref), c); counts.checks += 1; }
    }
    for (const l of snap.data.loans) {
      if (seen(existing && existing.loans, loanSig(l))) counts.skipped += 1;
      else {
        const id = await backupModel.insertLoan(conn, userId, partyIdOf(l.party_ref), l);
        await backupModel.insertInstallments(conn, id, l.installments);
        counts.loans += 1;
      }
    }
    for (const r of snap.data.reminders) {
      if (seen(existing && existing.reminders, remSig(r))) counts.skipped += 1;
      else { await backupModel.insertReminder(conn, userId, partyIdOf(r.party_ref), r); counts.reminders += 1; }
    }

    await conn.commit();
    // Only after the commit: if the transaction rolls back the rows (and their
    // pictures) are still there and must not be touched.
    for (const url of orphans) {
      const full = ownedPath(url, userId);
      if (full) safeUnlink(full);
    }
    return { mode: merge ? 'merge' : 'replace', restored: counts, in_file: snap.counts };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// -----------------------------------------------------------------------------
//  server-side copies (the "online backup")
// -----------------------------------------------------------------------------

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/**
 * Write the snapshot into storage/backups and remember it in the DB.
 * Two copies made in the same second get a `-2`, `-3`… suffix, because the
 * filename is the primary key of the file on disk and must stay unique.
 * `kind` is 'manual' for a copy the user asked for and 'auto' for one the app
 * made in the background; each kind keeps its own newest few.
 */
async function saveOnline(userId, kind = 'manual') {
  if (!KINDS.includes(kind)) throw new ApiError(422, 'Backup kind must be auto or manual');
  const snap = await snapshot(userId);
  const base = `backup-${userId}-${stamp()}`;
  let name = `${base}.json`;
  for (let n = 2; fs.existsSync(path.join(BACKUP_DIR, name)); n += 1) name = `${base}-${n}.json`;

  const json = JSON.stringify(snap, null, 2);
  fs.writeFileSync(path.join(BACKUP_DIR, name), json, 'utf8');
  const id = await backupModel.create(userId, name, Buffer.byteLength(json, 'utf8'), kind);

  // Keep only the newest copies of this kind — a phone backup should not grow
  // forever, and it must never evict the other kind's history.
  const sameKind = (await backupModel.listByUser(userId)).filter((r) => r.kind === kind);
  const limit = kind === 'auto' ? KEEP_AUTO : KEEP_COPIES;
  for (const row of sameKind.slice(limit)) {
    await backupModel.remove(userId, row.id);
    fs.unlink(path.join(BACKUP_DIR, path.basename(row.file_path)), () => {});
  }

  return {
    backup: { id, name, size_bytes: Buffer.byteLength(json, 'utf8'), kind },
    counts: snap.counts,
  };
}

async function listOnline(userId) {
  const rows = await backupModel.listByUser(userId);
  return {
    backups: rows.map((r) => ({
      id: r.id, name: path.basename(r.file_path), size_bytes: Number(r.size_bytes),
      kind: r.kind, created_at: r.created_at,
    })),
    meta: {
      count: rows.length,
      auto: rows.filter((r) => r.kind === 'auto').length,
      manual: rows.filter((r) => r.kind === 'manual').length,
      keep_auto: KEEP_AUTO,
      keep_manual: KEEP_COPIES,
    },
  };
}

/** Absolute path of a stored copy, only if it belongs to this user. */
async function filePathFor(userId, id) {
  const row = await backupModel.findById(userId, id);
  if (!row) throw new ApiError(404, 'Backup not found');
  const full = path.join(BACKUP_DIR, path.basename(row.file_path));
  if (!full.startsWith(BACKUP_DIR) || !fs.existsSync(full)) throw new ApiError(404, 'Backup file is missing');
  return { row, full };
}

async function readOnline(userId, id) {
  const { full } = await filePathFor(userId, id);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

async function removeOnline(userId, id) {
  const { full } = await filePathFor(userId, id);
  await backupModel.remove(userId, id);
  fs.unlinkSync(full);
}

/** Restore straight from a server-side copy. */
async function restoreOnline(userId, id, mode) {
  const snap = await readOnline(userId, id);
  return restore(userId, snap, mode);
}

module.exports = {
  VERSION, APP_TAG,
  snapshot, validateSnapshot, restore,
  saveOnline, listOnline, readOnline, removeOnline, restoreOnline, filePathFor,
};
