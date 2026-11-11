// -----------------------------------------------------------------------------
//  Check controller — thin HTTP layer over checkService.
// -----------------------------------------------------------------------------
const checkService = require('../services/checkService');
const { sendSuccess, sendCreated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/checks?status&type&party_id */
const list = asyncHandler(async (req, res) => {
  const { checks, meta } = await checkService.list(req.user.id, {
    status: req.query.status || '',
    type: req.query.type || '',
    partyId: req.query.party_id || '',
  });
  return sendSuccess(res, { message: 'Checks', data: { checks }, meta });
});

/** GET /api/checks/:id */
const get = asyncHandler(async (req, res) => {
  const data = await checkService.get(req.user.id, req.params.id);
  return sendSuccess(res, { message: 'Check', data });
});

/** POST /api/checks */
const create = asyncHandler(async (req, res) => {
  const data = await checkService.create(req.user.id, req.body);
  return sendCreated(res, { message: 'Check saved', data });
});

/** PUT /api/checks/:id */
const update = asyncHandler(async (req, res) => {
  const data = await checkService.update(req.user.id, req.params.id, req.body);
  return sendSuccess(res, { message: 'Check updated', data });
});

/** DELETE /api/checks/:id */
const remove = asyncHandler(async (req, res) => {
  await checkService.remove(req.user.id, req.params.id);
  return sendSuccess(res, { message: 'Check deleted' });
});

module.exports = { list, get, create, update, remove };
