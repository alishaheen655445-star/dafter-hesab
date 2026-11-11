// -----------------------------------------------------------------------------
//  Transaction controller — thin HTTP layer over transactionService.
// -----------------------------------------------------------------------------
const txnService = require('../services/transactionService');
const { sendSuccess, sendCreated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/parties/:partyId/transactions?from&to&type&page&limit */
const statement = asyncHandler(async (req, res) => {
  const { from, to, type, page, limit } = req.query;
  const { transactions, meta } = await txnService.statement(req.user.id, req.params.partyId, {
    from, to, type, page, limit,
  });
  return sendSuccess(res, { message: 'Statement', data: { transactions }, meta });
});

/** GET /api/parties/:partyId/transactions/:id */
const get = asyncHandler(async (req, res) => {
  const data = await txnService.getTxn(req.user.id, req.params.partyId, req.params.id);
  return sendSuccess(res, { message: 'Transaction', data });
});

/** POST /api/parties/:partyId/transactions */
const create = asyncHandler(async (req, res) => {
  const data = await txnService.createTxn(req.user.id, req.params.partyId, req.body);
  return sendCreated(res, { message: 'Transaction saved', data });
});

/** PUT /api/parties/:partyId/transactions/:id */
const update = asyncHandler(async (req, res) => {
  const data = await txnService.updateTxn(req.user.id, req.params.partyId, req.params.id, req.body);
  return sendSuccess(res, { message: 'Transaction updated', data });
});

/** DELETE /api/parties/:partyId/transactions/:id */
const remove = asyncHandler(async (req, res) => {
  const data = await txnService.removeTxn(req.user.id, req.params.partyId, req.params.id);
  return sendSuccess(res, { message: 'Transaction deleted', data });
});

module.exports = { statement, get, create, update, remove };
