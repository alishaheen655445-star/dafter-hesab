// -----------------------------------------------------------------------------
//  Backup routes — /api/backup/*  (all protected)
// -----------------------------------------------------------------------------
const express = require('express');
const ctrl = require('../controllers/backupController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const v = require('../validators/backupValidator');

const router = express.Router();

router.use(authenticate);

router.get('/export', ctrl.exportSnapshot);
router.post('/import', v.importRules, validate, ctrl.importSnapshot);

router.get('/online', ctrl.listOnline);
router.post('/online', v.onlineRules, validate, ctrl.save);
router.get('/online/:id/download', v.idParam, validate, ctrl.download);
router.post('/online/:id/restore', v.restoreRules, validate, ctrl.restoreOnline);
router.delete('/online/:id', v.idParam, validate, ctrl.remove);

module.exports = router;
