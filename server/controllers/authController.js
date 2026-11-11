// -----------------------------------------------------------------------------
//  Auth controller — thin HTTP layer: reads request, calls service, sends reply.
// -----------------------------------------------------------------------------
const authService = require('../services/authService');
const { sendSuccess, sendCreated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

/** POST /api/auth/register */
const register = asyncHandler(async (req, res) => {
  const { phone, password, name, currency, lang } = req.body;
  const { token, user } = await authService.register({ phone, password, name, currency, lang });
  return sendCreated(res, { message: 'Account created', data: { token, user } });
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const { token, user } = await authService.login({ phone, password });
  return sendSuccess(res, { message: 'Login successful', data: { token, user } });
});

/** GET /api/auth/me  (protected — returns the currently authenticated user) */
const me = asyncHandler(async (req, res) => {
  const user = await authService.me(req.user.id);
  return sendSuccess(res, { message: 'Current user', data: { user } });
});

/** PUT /api/auth/me — the owner edits own name / currency / lang / footer text. */
const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user.id, req.body);
  return sendSuccess(res, { message: 'Profile updated', data: { user } });
});

/** PUT /api/auth/password — change password with the current one as proof. */
const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  return sendSuccess(res, { message: 'Password changed' });
});

/** PUT /api/auth/pin — set / change (or with pin:null, remove) the app-lock code. */
const setPin = asyncHandler(async (req, res) => {
  const data = await authService.setPin(req.user.id, req.body);
  return sendSuccess(res, { message: 'Lock code updated', data });
});

/** POST /api/auth/pin/unlock — the lock screen asking once for the code. */
const unlock = asyncHandler(async (req, res) => {
  const data = await authService.unlock(req.user.id, req.body);
  return sendSuccess(res, { message: 'Unlocked', data });
});

module.exports = { register, login, me, updateMe, changePassword, setPin, unlock };
