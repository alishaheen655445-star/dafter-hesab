// -----------------------------------------------------------------------------
//  Report routes — /api/reports/*  (read-only, all protected)
// -----------------------------------------------------------------------------
const express = require('express');
const ctrl = require('../controllers/reportController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const v = require('../validators/reportValidator');

const router = express.Router();

router.use(authenticate);

router.get('/party/:partyId', v.partyReportRules, validate, ctrl.party);
router.get('/book', ctrl.book);

module.exports = router;
