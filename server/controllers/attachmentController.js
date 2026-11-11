// -----------------------------------------------------------------------------
//  attachmentController — HTTP layer for the "one picture per row" feature.
//  Two families of routes share this file because the service is identical and
//  only the ids differ: a transaction needs partyId + id, a check needs id.
// -----------------------------------------------------------------------------
const attachmentService = require('../services/attachmentService');
const { sendSuccess } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const txnIds = (req) => ({ partyId: Number(req.params.partyId), id: Number(req.params.id) });
const checkIds = (req) => ({ id: Number(req.params.id) });

/** POST /api/parties/:partyId/transactions/:id/image  (multipart field: image) */
const attachTxnImage = asyncHandler(async (req, res) => {
  const data = await attachmentService.attach(req.user.id, 'txn', txnIds(req), req.file);
  return sendSuccess(res, { message: 'Image attached', data });
});

/** DELETE /api/parties/:partyId/transactions/:id/image */
const detachTxnImage = asyncHandler(async (req, res) => {
  const data = await attachmentService.detach(req.user.id, 'txn', txnIds(req));
  return sendSuccess(res, { message: 'Image removed', data });
});

/** POST /api/checks/:id/image  (multipart field: image) */
const attachCheckImage = asyncHandler(async (req, res) => {
  const data = await attachmentService.attach(req.user.id, 'check', checkIds(req), req.file);
  return sendSuccess(res, { message: 'Image attached', data });
});

/** DELETE /api/checks/:id/image */
const detachCheckImage = asyncHandler(async (req, res) => {
  const data = await attachmentService.detach(req.user.id, 'check', checkIds(req));
  return sendSuccess(res, { message: 'Image removed', data });
});

module.exports = { attachTxnImage, detachTxnImage, attachCheckImage, detachCheckImage };
