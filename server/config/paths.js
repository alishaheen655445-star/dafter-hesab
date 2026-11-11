// -----------------------------------------------------------------------------
//  paths.js — the ONE place that decides where files live on disk.
//
//  Two different folders on purpose:
//    UPLOAD_DIR  is INSIDE the static client folder, so Express serves the
//                ledger pictures for free at /uploads/<name> (and the Capacitor
//                build finds them next to the HTML).
//    BACKUP_DIR  is deliberately OUTSIDE it. A backup is the user's whole book;
//                it must never be reachable by guessing a URL. It is only ever
//                sent through the authenticated /api/backup routes.
// -----------------------------------------------------------------------------
require('dotenv').config();

const path = require('path');
const fs = require('fs');

const CLIENT_DIR = path.resolve(process.env.CLIENT_DIR || path.join(__dirname, '..', '..', 'client'));
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(CLIENT_DIR, 'uploads'));
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', '..', 'storage'));
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Create on require, so a fresh clone never 500s on the first upload.
[UPLOAD_DIR, BACKUP_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/** Absolute path -> public URL for an uploaded image. */
const publicUrl = (fileName) => `/uploads/${fileName}`;

/** Public URL (or absolute path) -> basename inside UPLOAD_DIR, or '' if foreign. */
function uploadBasename(url) {
  const name = path.basename(String(url || ''));
  if (!name || name.includes('..')) return '';
  return name;
}

module.exports = { CLIENT_DIR, UPLOAD_DIR, DATA_DIR, BACKUP_DIR, publicUrl, uploadBasename };
