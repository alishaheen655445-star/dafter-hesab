// -----------------------------------------------------------------------------
//  upload.js — multipart handling for ledger pictures (Phase 5).
//
//  Rules, all deliberate:
//    * ONE file per request, MAX_UPLOAD_MB big (default 5).
//    * Extension comes from OUR whitelist, never from the client's filename, so
//      nobody can push a `.js`/`.html`/`.php` name into a publicly served folder.
//    * Filename is generated (user id + time + random hex) — unguessable, and it
//      makes "who owns this file" readable straight off the disk.
//    * The declared mime type is only a first filter; the real check is the file
//      signature (see sniffImage), done by the service after the bytes land.
// -----------------------------------------------------------------------------
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ApiError = require('../utils/ApiError');
const { UPLOAD_DIR } = require('../config/paths');

const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 5);

/** mime -> extension we write. Only images the browser can show inline. */
const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED[file.mimetype] || '.bin';
    const rand = crypto.randomBytes(6).toString('hex');
    cb(null, `${req.user.id}-${Date.now()}-${rand}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED[file.mimetype]) {
    // Remove the partial file multer may already have opened, then reject.
    return cb(new ApiError(422, 'Only JPEG, PNG or WebP images are allowed'));
  }
  return cb(null, true);
}

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
});

/** Multer's own errors are cryptic -> translate them into clean 4xx ApiErrors. */
function uploadImage(req, res, next) {
  uploader.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(422, `Image is too large (max ${MAX_MB} MB)`));
      }
      if (err instanceof ApiError) return next(err);
      return next(new ApiError(422, err.message || 'Upload failed'));
    }
    return next();
  });
}

/**
 * Real content check: read the first bytes and match a known image signature.
 * Returns the detected type, or '' when the file is not actually an image.
 */
function sniffImage(filePath) {
  let fd;
  try {
    const head = Buffer.alloc(16);
    fd = fs.openSync(filePath, 'r');
    const read = fs.readSync(fd, head, 0, 16, 0);
    if (read < 12) return '';
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png';
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
    if (head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
    return '';
  } catch (_err) {
    return '';
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Best-effort delete — a missing leftover file must never fail a request. */
function safeUnlink(filePath) {
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_err) { /* ignore */ }
}

/** Absolute path of the file multer just wrote, or null. */
const filePathOf = (req) => (req.file ? path.join(UPLOAD_DIR, req.file.filename) : null);

module.exports = { uploadImage, sniffImage, safeUnlink, filePathOf, ALLOWED, MAX_MB };
