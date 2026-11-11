// -----------------------------------------------------------------------------
//  Reminder validators — /api/reminders/*.
// -----------------------------------------------------------------------------
const { body, param, query } = require('express-validator');

// 'YYYY-MM-DD', 'YYYY-MM-DDTHH:MM' or the full 'YYYY-MM-DD HH:MM:SS'
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/;

const idParam = [param('id').isInt({ min: 1 }).withMessage('Invalid reminder id')];

const datetimeRule = (field, required) => {
  const chain = required ? body(field).notEmpty().withMessage('Time is required').bail()
    : body(field).optional({ checkFalsy: true });
  return chain.matches(DATETIME_RE).withMessage('Time must be YYYY-MM-DD HH:MM');
};

const createRules = [
  body('title').notEmpty().withMessage('Title is required').bail()
    .isLength({ max: 200 }).withMessage('Title is too long'),
  datetimeRule('remind_at', true),
  body('message').optional({ checkFalsy: true }).isLength({ max: 2000 }).withMessage('Message is too long'),
  body('party_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid party id'),
];

const updateRules = [
  ...idParam,
  body('title').optional({ checkFalsy: true }).notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title is too long'),
  datetimeRule('remind_at', false),
  body('message').optional({ checkFalsy: true }).isLength({ max: 2000 }).withMessage('Message is too long'),
  body('party_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid party id'),
];

const ackRules = [
  ...idParam,
  body('sent').optional().isBoolean().withMessage('sent must be true or false').toBoolean(),
];

const listRules = [
  query('now').optional({ checkFalsy: true }).matches(DATETIME_RE).withMessage('now must be YYYY-MM-DD HH:MM'),
];

module.exports = { idParam, createRules, updateRules, ackRules, listRules };
