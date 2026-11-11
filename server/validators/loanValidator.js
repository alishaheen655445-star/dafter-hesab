// -----------------------------------------------------------------------------
//  Loan validators — /api/loans/* (loans + their installments).
// -----------------------------------------------------------------------------
const { body, param, query } = require('express-validator');

const TYPES = ['received', 'given'];
const STATUSES = ['active', 'completed', 'cancelled'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const idParam = [param('id').isInt({ min: 1 }).withMessage('Invalid loan id')];
const installmentParams = [
  ...idParam,
  param('instId').isInt({ min: 1 }).withMessage('Invalid installment id'),
];

/** Major-unit money field; empty string means "not provided" when optional. */
const moneyRule = (field, required) => {
  const chain = required ? body(field).notEmpty().withMessage(`${field} is required`).bail()
    : body(field).optional({ checkFalsy: true });
  return chain
    .customSanitizer((v) => String(v).replace(/[\s,]/g, ''))
    .isDecimal().withMessage(`${field} must be a number`).bail()
    .custom((v) => Number(v) > 0).withMessage(`${field} must be greater than zero`);
};

const createRules = [
  body('type').isIn(TYPES).withMessage('Type must be received or given'),
  moneyRule('principal', true),
  body('start_date').notEmpty().withMessage('Start date is required').bail()
    .matches(DATE_RE).withMessage('Start date must be YYYY-MM-DD'),
  moneyRule('monthly_payment', false),
  body('total_installments').optional({ checkFalsy: true })
    .isInt({ min: 1, max: 600 }).withMessage('Installments must be between 1 and 600'),
  body('party_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid party id'),
  body('note').optional({ checkFalsy: true }).isLength({ max: 2000 }).withMessage('Note is too long'),
];

const updateRules = [
  ...idParam,
  body('status').optional({ checkFalsy: true }).isIn(STATUSES).withMessage('Unknown loan status'),
  body('party_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid party id'),
  body('note').optional({ checkFalsy: true }).isLength({ max: 2000 }).withMessage('Note is too long'),
];

const paidRules = [
  ...installmentParams,
  body('paid').optional().isBoolean().withMessage('paid must be true or false').toBoolean(),
];

const listRules = [
  query('status').optional({ checkFalsy: true }).isIn(STATUSES).withMessage('Unknown loan status'),
  query('type').optional({ checkFalsy: true }).isIn(TYPES).withMessage('Type must be received or given'),
  query('party_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid party id'),
];

module.exports = { idParam, installmentParams, createRules, updateRules, paidRules, listRules };
