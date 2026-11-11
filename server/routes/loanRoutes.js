// -----------------------------------------------------------------------------
//  Loan routes — /api/loans/*  (all protected)
// -----------------------------------------------------------------------------
const express = require('express');
const ctrl = require('../controllers/loanController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const v = require('../validators/loanValidator');

const router = express.Router();

router.use(authenticate);

router.get('/',    v.listRules, validate, ctrl.list);
router.post('/',   v.createRules, validate, ctrl.create);

router.get('/:id',    v.idParam, validate, ctrl.get);
router.put('/:id',    v.updateRules, validate, ctrl.update);
router.delete('/:id', v.idParam, validate, ctrl.remove);

// Installment actions live under the loan they belong to.
router.put('/:id/installments/:instId', v.paidRules, validate, ctrl.payInstallment);

module.exports = router;
