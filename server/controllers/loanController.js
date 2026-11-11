// -----------------------------------------------------------------------------
//  Loan controller — thin HTTP layer over loanService.
// -----------------------------------------------------------------------------
const loanService = require('../services/loanService');
const { sendSuccess, sendCreated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/loans?status&type&party_id */
const list = asyncHandler(async (req, res) => {
  const { loans, meta } = await loanService.list(req.user.id, {
    status: req.query.status || '',
    type: req.query.type || '',
    partyId: req.query.party_id || '',
  });
  return sendSuccess(res, { message: 'Loans', data: { loans }, meta });
});

/** GET /api/loans/:id — loan + installment schedule */
const get = asyncHandler(async (req, res) => {
  const data = await loanService.get(req.user.id, req.params.id);
  return sendSuccess(res, { message: 'Loan', data });
});

/** POST /api/loans */
const create = asyncHandler(async (req, res) => {
  const data = await loanService.create(req.user.id, req.body);
  return sendCreated(res, { message: 'Loan saved', data });
});

/** PUT /api/loans/:id */
const update = asyncHandler(async (req, res) => {
  const data = await loanService.update(req.user.id, req.params.id, req.body);
  return sendSuccess(res, { message: 'Loan updated', data });
});

/** PUT /api/loans/:id/installments/:instId — pay / un-pay one installment */
const payInstallment = asyncHandler(async (req, res) => {
  const paid = req.body.paid === undefined ? true : req.body.paid;
  const data = await loanService.setInstallmentPaid(req.user.id, req.params.id, req.params.instId, paid);
  return sendSuccess(res, { message: paid ? 'Installment paid' : 'Installment reopened', data });
});

/** DELETE /api/loans/:id */
const remove = asyncHandler(async (req, res) => {
  await loanService.remove(req.user.id, req.params.id);
  return sendSuccess(res, { message: 'Loan deleted' });
});

module.exports = { list, get, create, update, payInstallment, remove };
