// -----------------------------------------------------------------------------
//  Party routes — /api/parties/*  (all protected: one owner per account)
// -----------------------------------------------------------------------------
const express = require('express');
const ctrl = require('../controllers/partyController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const v = require('../validators/partyValidator');

const router = express.Router();

// Everything below needs a valid Bearer token.
router.use(authenticate);

router.get('/',            ctrl.list);
router.post('/',           v.createRules, validate, ctrl.create);

router.get('/:id',         v.idParam, validate, ctrl.get);
router.put('/:id',         v.updateRules, validate, ctrl.update);
router.delete('/:id',      v.idParam, validate, ctrl.remove);

router.put('/:id/bank',    v.bankRules, validate, ctrl.saveBank);

// One-press closing of an account (free here, paid in the reference app).
router.post('/:id/settle', v.settleRules, validate, ctrl.settle);

router.post('/:id/notes',       v.noteRules, validate, ctrl.addNote);
router.delete('/:id/notes/:noteId', v.noteIdRules, validate, ctrl.removeNote);

module.exports = router;
