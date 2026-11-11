// -----------------------------------------------------------------------------
//  Transaction validators — express-validator chains for the ledger endpoints.
//  Money arrives as a decimal string/number in MAJOR units and is converted to
//  minor units inside the service (never here — this layer only rejects garbage).
// -----------------------------------------------------------------------------
const { body, param, query } = require('express-validator');

const TYPES = ['credit', 'debit'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const partyIdParam = [param('partyId').isInt({ min: 1 }).withMessage('Invalid party id')];
const idParam = [...partyIdParam, param('id').isInt({ min: 1 }).withMessage('Invalid transaction id')];

/** "12,500.75" -> "12500.75" so a pasted/grouped number still parses. */
const cleanAmount = () =>
  body('amount')
    .customSanitizer((v) => String(v).replace(/[\s,]/g, ''))
    .isDecimal().withMessage('Amount must be a number').bail()
    .custom((v) => Number(v) > 0).withMessage('Amount must be greater than zero').bail()
    .custom((v) => Number(v) <= 1e12).withMessage('Amount is too large');

/** txn_date is always optional: an empty field means "today" (service decides). */
const dateRule = () =>
  body('txn_date').optional({ checkFalsy: true })
    .matches(DATE_RE).withMessage('Date must be YYYY-MM-DD');

const createRules = [
  ...partyIdParam,
  body('type').isIn(TYPES).withMessage('Type must be credit or debit'),
  cleanAmount(),
  dateRule(),
  body('description').optional({ checkFalsy: true })
    .isLength({ max: 500 }).withMessage('Description is too long (max 500 chars)'),
];

// PUT: everything optional — the service only touches the keys that were sent.
const updateRules = [
  ...idParam,
  body('type').optional({ checkFalsy: true }).isIn(TYPES).withMessage('Type must be credit or debit'),
  body('amount').optional({ checkFalsy: true })
    .customSanitizer((v) => String(v).replace(/[\s,]/g, ''))
    .isDecimal().withMessage('Amount must be a number').bail()
    .custom((v) => Number(v) > 0).withMessage('Amount must be greater than zero'),
  dateRule(),
  body('description').optional({ checkFalsy: true })
    .isLength({ max: 500 }).withMessage('Description is too long (max 500 chars)'),
];

const txnIdParam = [...idParam];

// Query string filters for the statement. Invalid values are ignored downstream,
// but a typo in a date should not silently return the whole history.
const queryRules = [
  ...partyIdParam,
  query('from').optional({ checkFalsy: true }).matches(DATE_RE).withMessage('from must be YYYY-MM-DD'),
  query('to').optional({ checkFalsy: true }).matches(DATE_RE).withMessage('to must be YYYY-MM-DD'),
  query('type').optional({ checkFalsy: true }).isIn(TYPES).withMessage('Type must be credit or debit'),
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 200 }),
];

module.exports = { createRules, updateRules, txnIdParam, queryRules, partyIdParam };
