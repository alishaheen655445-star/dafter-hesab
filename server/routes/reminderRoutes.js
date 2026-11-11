// -----------------------------------------------------------------------------
//  Reminder routes — /api/reminders/*  (all protected)
// -----------------------------------------------------------------------------
const express = require('express');
const ctrl = require('../controllers/reminderController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const v = require('../validators/reminderValidator');

const router = express.Router();

router.use(authenticate);

router.get('/',       v.listRules, validate, ctrl.list);
router.get('/due',    v.listRules, validate, ctrl.due);
router.post('/',      v.createRules, validate, ctrl.create);

router.put('/:id',       v.updateRules, validate, ctrl.update);
router.post('/:id/ack',  v.ackRules, validate, ctrl.ack);
router.delete('/:id',    v.idParam, validate, ctrl.remove);

module.exports = router;
