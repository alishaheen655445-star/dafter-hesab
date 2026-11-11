// -----------------------------------------------------------------------------
//  Report controller — hands the printable data to the client.
// -----------------------------------------------------------------------------
const reportService = require('../services/reportService');
const { sendSuccess } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/reports/party/:partyId?from&to */
const party = asyncHandler(async (req, res) => {
  const data = await reportService.partyStatement(req.user.id, req.params.partyId, {
    from: req.query.from || '',
    to: req.query.to || '',
  });
  return sendSuccess(res, { message: 'Report', data });
});

/** GET /api/reports/book */
const book = asyncHandler(async (req, res) => {
  const data = await reportService.bookSummary(req.user.id);
  return sendSuccess(res, { message: 'Ledger summary', data });
});

module.exports = { party, book };
