// -----------------------------------------------------------------------------
//  Auth routes — /api/auth/*
// -----------------------------------------------------------------------------
const express = require('express');
const ctrl = require('../controllers/authController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { registerRules, loginRules, profileRules, passwordRules, pinRules, unlockRules } = require('../validators/authValidator');

const router = express.Router();

router.post('/register', registerRules, validate, ctrl.register);
router.post('/login',    loginRules,  validate, ctrl.login);
router.get('/me',        authenticate,           ctrl.me);
// Own account settings (language, currency, footer text, password).
router.put('/me',        authenticate, profileRules,  validate, ctrl.updateMe);
router.put('/password',  authenticate, passwordRules, validate, ctrl.changePassword);
// The optional app lock (Phase 9). Its own endpoints, because its proof is the
// password and a typo in it must never touch the profile or the password itself.
router.put('/pin',         authenticate, pinRules,    validate, ctrl.setPin);
router.post('/pin/unlock', authenticate, unlockRules, validate, ctrl.unlock);

module.exports = router;
