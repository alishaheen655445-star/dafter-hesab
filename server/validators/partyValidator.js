// -----------------------------------------------------------------------------
//  Party validators — express-validator chains for /api/parties/*.
//  Phone normalisation is shared with auth (same rule for the user and parties).
// -----------------------------------------------------------------------------
const { body, param } = require('express-validator');
const { normalisePhone } = require('./authValidator');

const optionalPhone = (field) =>
  body(field)
    .optional({ checkFalsy: true })
    .customSanitizer(normalisePhone)
    .custom((v) => v === '' || v === undefined || /^\+?\d{7,15}$/.test(v))
    .withMessage('Phone must be 7-15 digits');

const createRules = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Party name is required (max 100 chars)'),
  optionalPhone('phone'),
  body('note')
    .optional({ checkFalsy: true })
    .isLength({ max: 2000 }).withMessage('Note is too long (max 2000 chars)'),
];

// PUT accepts the same fields, all optional — the service ignores undefined ones.
const updateRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid party id'),
  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Party name must be 1-100 chars'),
  optionalPhone('phone'),
  body('note')
    .optional({ checkFalsy: true })
    .isLength({ max: 2000 }).withMessage('Note is too long (max 2000 chars)'),
];

const idParam = [param('id').isInt({ min: 1 }).withMessage('Invalid party id')];

const bankRules = [
  ...idParam,
  body('bank_name').optional({ checkFalsy: true }).isLength({ max: 100 }),
  // Card numbers are typed with spaces in the field; we store digits only.
  body('card_number').optional({ checkFalsy: true })
    .customSanitizer((v) => String(v).replace(/[\s\-]/g, ''))
    .isNumeric().withMessage('Card number must be digits').bail()
    .isLength({ max: 25 }).withMessage('Card number is too long'),
  body('account_number').optional({ checkFalsy: true }).isLength({ max: 35 }),
  body('iban').optional({ checkFalsy: true })
    .customSanitizer((v) => String(v).replace(/\s/g, '').toUpperCase())
    .isLength({ max: 34 }).withMessage('IBAN is too long'),
  body('branch').optional({ checkFalsy: true }).isLength({ max: 50 }),
  body('account_holder').optional({ checkFalsy: true }).isLength({ max: 100 }),
];

const noteRules = [
  ...idParam,
  body('note').trim().isLength({ min: 1, max: 5000 }).withMessage('Note text is required'),
];

const noteIdRules = [
  ...idParam,
  param('noteId').isInt({ min: 1 }).withMessage('Invalid note id'),
];

// Closing an account (Phase 9) carries no amount on purpose — the service reads
// the balance itself, so a tampered body cannot settle for less than what is due.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const settleRules = [
  ...idParam,
  body('txn_date').optional({ checkFalsy: true })
    .matches(DATE_RE).withMessage('Date must be YYYY-MM-DD'),
  body('description').optional({ checkFalsy: true })
    .isLength({ max: 500 }).withMessage('Description is too long (max 500 chars)'),
];

module.exports = { createRules, updateRules, idParam, bankRules, noteRules, noteIdRules, settleRules };
