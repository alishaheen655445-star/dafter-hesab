// -----------------------------------------------------------------------------
//  attachmentService — the picture behind one ledger row (🖼 Phase 5).
//  A transaction or a check can carry ONE image (a receipt, a cheque photo).
//
//  Responsibilities, in this order:
//    1. prove the row belongs to the logged-in user (404 otherwise),
//    2. prove the uploaded bytes really are an image (signature, not mime),
//    3. write the URL onto the row,
//    4. remove the PREVIOUS file — but only when its name proves it belongs to
//       this same user, so a tampered image_url can never delete someone else's
//       picture (or any arbitrary file on disk).
// -----------------------------------------------------------------------------
const path = require('path');

const txnModel = require('../models/transactionModel');
const checkModel = require('../models/checkModel');
const ApiError = require('../utils/ApiError');
const { UPLOAD_DIR, publicUrl, uploadBasename } = require('../config/paths');
const { sniffImage, safeUnlink } = require('../middleware/upload');

/** Absolute path of a stored image, or '' when the URL is not ours to touch. */
function ownedPath(url, userId) {
  const name = uploadBasename(url);
  if (!name || !name.startsWith(`${userId}-`)) return '';
  const full = path.resolve(UPLOAD_DIR, name);
  // Belt and braces: the resolved path must still sit inside UPLOAD_DIR.
  return full.startsWith(path.resolve(UPLOAD_DIR)) ? full : '';
}

const TARGETS = {
  txn: {
    find: (userId, { id, partyId }) => txnModel.findById(userId, partyId, id),
    setImage: (userId, { id, partyId }, url) => txnModel.setImage(userId, partyId, id, url),
    key: 'transaction',
  },
  check: {
    find: (userId, { id }) => checkModel.findById(userId, id),
    setImage: (userId, { id }, url) => checkModel.update(userId, id, { image_url: url }),
    key: 'check',
  },
};

async function rowOr404(target, userId, ids) {
  const row = await TARGETS[target].find(userId, ids);
  if (!row) throw new ApiError(404, `${target === 'txn' ? 'Transaction' : 'Check'} not found`);
  return row;
}

/**
 * PUT the image onto a row. `file` is the multer file object already written to
 * disk by the upload middleware.
 */
async function attach(userId, target, ids, file) {
  const spec = TARGETS[target];
  if (!spec) throw new ApiError(422, 'Unknown attachment target');
  if (!file) throw new ApiError(422, 'No image was sent');

  const savedPath = path.join(UPLOAD_DIR, file.filename);
  try {
    // Multer already put the bytes on disk, so every refusal below has to take
    // that file back with it — a rejected upload must never litter the folder.
    const row = await rowOr404(target, userId, ids);

    if (!sniffImage(savedPath)) {
      // Declared mime said image, the bytes say otherwise — drop it and refuse.
      throw new ApiError(422, 'That file is not a real image');
    }

    const fresh = await spec.setImage(userId, ids, publicUrl(file.filename));
    if (row.image_url && row.image_url !== fresh.image_url) {
      const old = ownedPath(row.image_url, userId);
      if (old) safeUnlink(old);
    }
    return { [spec.key]: fresh };
  } catch (err) {
    safeUnlink(savedPath);
    throw err;
  }
}

/** Remove the image from a row and delete the file. Idempotent. */
async function detach(userId, target, ids) {
  const spec = TARGETS[target];
  if (!spec) throw new ApiError(422, 'Unknown attachment target');

  const row = await rowOr404(target, userId, ids);
  const old = row.image_url ? ownedPath(row.image_url, userId) : '';
  const fresh = await spec.setImage(userId, ids, null);
  if (old) safeUnlink(old);
  return { [spec.key]: fresh };
}

module.exports = { attach, detach, ownedPath, TARGETS };
