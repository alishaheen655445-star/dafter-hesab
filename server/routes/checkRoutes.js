// -----------------------------------------------------------------------------
//  Check routes — /api/checks/*  (all protected)
// -----------------------------------------------------------------------------
const express = require('express');
const ctrl = require('../controllers/checkController');
const attachCtrl = require('../controllers/attachmentController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const v = require('../validators/checkValidator');

const router = express.Router();

router.use(authenticate);

router.get('/',    v.listRules, validate, ctrl.list);
router.post('/',   v.createRules, validate, ctrl.create);

router.get('/:id',    v.idParam, validate, ctrl.get);
router.put('/:id',    v.updateRules, validate, ctrl.update);
router.delete('/:id', v.idParam, validate, ctrl.remove);

// Photo of the physical cheque (Phase 5). multipart field name: "image".
router.post('/:id/image',   v.idParam, validate, uploadImage, attachCtrl.attachCheckImage);
router.delete('/:id/image', v.idParam, validate, attachCtrl.detachCheckImage);

module.exports = router;
