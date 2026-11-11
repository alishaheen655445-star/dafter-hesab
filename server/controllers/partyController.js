// -----------------------------------------------------------------------------
//  Party controller — thin HTTP layer over partyService.
// -----------------------------------------------------------------------------
const partyService = require('../services/partyService');
// Settling writes a LEDGER entry, so it goes to the ledger service — the route
// lives under /parties because that is how the screen thinks about it.
const transactionService = require('../services/transactionService');
const { sendSuccess, sendCreated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/parties?search= */
const list = asyncHandler(async (req, res) => {
  const { parties, meta } = await partyService.listParties(req.user.id, { search: req.query.search || '' });
  return sendSuccess(res, { message: 'Parties', data: { parties }, meta });
});

/** GET /api/parties/:id */
const get = asyncHandler(async (req, res) => {
  const data = await partyService.getParty(req.user.id, req.params.id);
  return sendSuccess(res, { message: 'Party', data });
});

/** POST /api/parties */
const create = asyncHandler(async (req, res) => {
  const data = await partyService.createParty(req.user.id, req.body);
  return sendCreated(res, { message: 'Party created', data });
});

/** PUT /api/parties/:id */
const update = asyncHandler(async (req, res) => {
  const data = await partyService.updateParty(req.user.id, req.params.id, req.body);
  return sendSuccess(res, { message: 'Party updated', data });
});

/** DELETE /api/parties/:id */
const remove = asyncHandler(async (req, res) => {
  await partyService.deleteParty(req.user.id, req.params.id);
  return sendSuccess(res, { message: 'Party deleted' });
});

/** PUT /api/parties/:id/bank */
const saveBank = asyncHandler(async (req, res) => {
  const data = await partyService.saveBank(req.user.id, req.params.id, req.body);
  return sendSuccess(res, { message: 'Bank info saved', data });
});

/** POST /api/parties/:id/notes */
const addNote = asyncHandler(async (req, res) => {
  const data = await partyService.addNote(req.user.id, req.params.id, req.body.note);
  return sendCreated(res, { message: 'Note added', data });
});

/** DELETE /api/parties/:id/notes/:noteId */
const removeNote = asyncHandler(async (req, res) => {
  await partyService.removeNote(req.user.id, req.params.id, req.params.noteId);
  return sendSuccess(res, { message: 'Note deleted' });
});

/** POST /api/parties/:id/settle — close the account with one balancing entry. */
const settle = asyncHandler(async (req, res) => {
  const data = await transactionService.settleTxn(req.user.id, req.params.id, req.body);
  return sendCreated(res, { message: 'Account settled', data });
});

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  saveBank,
  addNote,
  removeNote,
  settle,
};
