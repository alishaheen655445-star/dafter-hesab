// -----------------------------------------------------------------------------
//  Report validators — read-only endpoints, so only params + query matter.
// -----------------------------------------------------------------------------
const { param, query } = require('express-validator');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const partyReportRules = [
  param('partyId').isInt({ min: 1 }).withMessage('Invalid party id'),
  query('from').optional({ checkFalsy: true }).matches(DATE_RE).withMessage('from must be YYYY-MM-DD'),
  query('to').optional({ checkFalsy: true }).matches(DATE_RE).withMessage('to must be YYYY-MM-DD'),
];

module.exports = { partyReportRules };
