// -----------------------------------------------------------------------------
//  Backup validators — a restore is the most destructive call in the app, so it
//  is validated twice: the SHAPE here, the CONTENT in backupService.validate.
// -----------------------------------------------------------------------------
const { body, param } = require('express-validator');

const idParam = [param('id').isInt({ min: 1 }).withMessage('Invalid backup id')];

/** POST /api/backup/import — { snapshot: <the file you downloaded>, mode, confirm } */
const importRules = [
  body('snapshot').isObject().withMessage('snapshot must be the JSON object from a backup file').bail(),
  body('mode').isIn(['replace', 'merge']).withMessage('mode must be replace or merge').bail()
    .custom((value, { req }) => {
      // Wiping the book must never happen by accident (or by an old client).
      if (value === 'replace' && req.body.confirm !== true) {
        throw new Error('Replacing all data needs confirm=true');
      }
      return true;
    }),
];

/** POST /api/backup/online — who asked for this copy (default: the user). */
const onlineRules = [
  body('kind').optional({ checkFalsy: true }).isIn(['auto', 'manual'])
    .withMessage('kind must be auto or manual'),
];

/** POST /api/backup/online/:id/restore */
const restoreRules = [
  ...idParam,
  body('mode').optional({ checkFalsy: true }).isIn(['replace', 'merge']).withMessage('mode must be replace or merge'),
  body('confirm').custom((value, { req }) => {
    if ((req.body.mode || 'replace') === 'replace' && value !== true) {
      throw new Error('Replacing all data needs confirm=true');
    }
    return true;
  }),
];

module.exports = { idParam, importRules, onlineRules, restoreRules };
