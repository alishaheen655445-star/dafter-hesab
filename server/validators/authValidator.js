// -----------------------------------------------------------------------------
//  Auth validators — express-validator chains for /api/auth/*.
//  Phone: accepts E.164-ish (+98..., +964...) or local (09xx). Stored normalised.
//  Password: min 6 chars. (Reference app is a personal ledger, not a bank.)
// -----------------------------------------------------------------------------
const { body } = require('express-validator');

// Normalise: strip spaces/dashes, keep leading + if present, then digits only.
const normalisePhone = (v) => {
  if (!v) return '';
  const s = String(v).trim().replace(/[\s\-().]/g, '');
  // Reject anything that isn't optional + followed by 7-15 digits.
  return /^\+?\d{7,15}$/.test(s) ? s : '';
};

const registerRules = [
  body('phone')
    .customSanitizer(normalisePhone)
    .notEmpty().withMessage('Phone is required and must be 7-15 digits'),
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Name is required (max 100 chars)'),
  body('currency')
    .optional({ checkFalsy: true })
    .isIn(['toman', 'rial', 'dinar', 'dollar', 'dirham', 'euro', 'afghani'])
    .withMessage('Unsupported currency'),
  body('lang')
    .optional({ checkFalsy: true })
    .isIn(['fa', 'ar']).withMessage('Language must be fa or ar'),
];

const loginRules = [
  body('phone')
    .customSanitizer(normalisePhone)
    .notEmpty().withMessage('Phone is required'),
  body('password')
    .notEmpty().withMessage('Password is required'),
];

// Own profile: everything optional, but each value must be valid if present.
// `name` is the one that must NOT be silent about blanks: sending an empty name
// is a mistake, while leaving the field out is how you keep the old one.
const profileRules = [
  body('name').optional()
    .trim().notEmpty().withMessage('Name must be 1-100 chars')
    .isLength({ max: 100 }).withMessage('Name must be 1-100 chars'),
  body('currency').optional({ checkFalsy: true })
    .isIn(['toman', 'rial', 'dinar', 'dollar', 'dirham', 'euro', 'afghani'])
    .withMessage('Unsupported currency'),
  body('lang').optional({ checkFalsy: true })
    .isIn(['fa', 'ar']).withMessage('Language must be fa or ar'),
  body('footer_text').optional({ checkFalsy: true })
    .isLength({ max: 500 }).withMessage('Footer text is too long (max 500)'),
];

const passwordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters'),
];

// The app lock (Phase 9): 4 to 8 digits. `pin` may be null/empty — that is how the
// owner switches the lock off — but the password always has to be there, because
// the password is what proves the request is allowed to touch the lock at all.
const pinRules = [
  body('pin').optional({ checkFalsy: true }).matches(/^\d{4,8}$/)
    .withMessage('The code must be 4 to 8 digits'),
  body('password').notEmpty().withMessage('Password is required'),
];

const unlockRules = [
  body('pin').matches(/^\d{4,8}$/).withMessage('The code must be 4 to 8 digits').bail(),
];

module.exports = {
  registerRules, loginRules, profileRules, passwordRules, pinRules, unlockRules, normalisePhone,
};
