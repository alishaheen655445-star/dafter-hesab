// -----------------------------------------------------------------------------
//  Check validators — express-validator chains for /api/checks/*.
// -----------------------------------------------------------------------------
const { body, param, query } = require('express-validator');

const TYPES = ['issued', 'received'];
const STATUSES = ['pending', 'cashed', 'bounced', 'cancelled'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const idParam = [param('id').isInt({ min: 1 }).withMessage('Invalid check id')];

/** "12,500.75" -> "12500.75"; the service turns it into minor units. */
const amountRule = (optional) => {
  const chain = optional ? body('amount').optional({ checkFalsy: true })
    : body('amount').notEmpty().withMessage('Amount is required').bail();
  return chain
    .customSanitizer((v) => String(v).replace(/[\s,]/g, ''))
    .isDecimal().withMessage('Amount must be a number').bail()
    .custom((v) => Number(v) > 0).withMessage('Amount must be greater than zero');
};

const textRule = (field, max) =>
  body(field).optional({ checkFalsy: true }).isLength({ max }).withMessage(`${field} is too long`);

const createRules = [
  body('type').isIn(TYPES).withMessage('Type must be issued or received'),
  amountRule(false),
  body('due_date').notEmpty().withMessage('Due date is required').bail()
    .matches(DATE_RE).withMessage('Due date must be YYYY-MM-DD'),
  body('party_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid party id'),
  textRule('check_number', 50),
  textRule('bank_name', 100),
  textRule('branch_name', 100),
  textRule('note', 2000),
];

const updateRules = [
  ...idParam,
  body('type').optional({ checkFalsy: true }).isIn(TYPES).withMessage('Type must be issued or received'),
  body('status').optional({ checkFalsy: true }).isIn(STATUSES).withMessage('Unknown check status'),
  amountRule(true),
  body('due_date').optional({ checkFalsy: true })
    .matches(DATE_RE).withMessage('Due date must be YYYY-MM-DD'),
  body('party_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid party id'),
  textRule('check_number', 50),
  textRule('bank_name', 100),
  textRule('branch_name', 100),
  textRule('note', 2000),
];

const listRules = [
  query('status').optional({ checkFalsy: true }).isIn(STATUSES).withMessage('Unknown check status'),
  query('type').optional({ checkFalsy: true }).isIn(TYPES).withMessage('Type must be issued or received'),
  query('party_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid party id'),
];

module.exports = { idParam, createRules, updateRules, listRules };
