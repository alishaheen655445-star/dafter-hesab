// -----------------------------------------------------------------------------
//  Transaction routes — /api/parties/:partyId/transactions/*
//  mergeParams keeps :partyId visible to the validators, and every query in the
//  model is scoped by BOTH the party and the logged-in user.
// -----------------------------------------------------------------------------
const express = require('express');
const ctrl = require('../controllers/transactionController');
const attachCtrl = require('../controllers/attachmentController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const v = require('../validators/transactionValidator');

const router = express.Router({ mergeParams: true });

router.use(authenticate);

router.get('/',    v.queryRules, validate, ctrl.statement);
router.post('/',   v.createRules, validate, ctrl.create);

router.get('/:id',    v.txnIdParam, validate, ctrl.get);
router.put('/:id',    v.updateRules, validate, ctrl.update);
router.delete('/:id', v.txnIdParam, validate, ctrl.remove);

// One receipt photo per حركة (Phase 5). multipart field name: "image".
router.post('/:id/image',   v.txnIdParam, validate, uploadImage, attachCtrl.attachTxnImage);
router.delete('/:id/image', v.txnIdParam, validate, attachCtrl.detachTxnImage);

module.exports = router;
