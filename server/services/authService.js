// -----------------------------------------------------------------------------
//  authService — business logic for register / login / profile.
//  Controllers stay thin; models stay dumb; everything else lives here.
// -----------------------------------------------------------------------------
const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');
const { signToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');

const BCRYPT_ROUNDS = 10;

/**
 * Register a new user with phone + password + name.
 * Returns { token, user } on success.
 */
async function register({ phone, password, name, currency, lang }) {
  const existing = await userModel.findByPhoneWithSecret(phone);
  if (existing) {
    // Generic message — do NOT reveal that the phone is already registered.
    throw new ApiError(409, 'Could not create account with these details');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const id = await userModel.create({
    phone,
    passwordHash,
    name,
    currency: currency || 'toman',
    lang: lang || process.env.DEFAULT_LANG || 'fa',
  });

  const user = await userModel.findByIdSafe(id);
  const token = signToken(user);
  return { token, user: shape(user) };
}

/**
 * Login with phone + password.
 * Returns { token, user } on success.
 * Uses generic error messages to avoid enumeration.
 */
async function login({ phone, password }) {
  const user = await userModel.findByPhoneWithSecret(phone);

  // Compare against a fixed dummy hash when the user is missing so the response
  // time is similar whether or not the phone exists (timing-attack mitigation).
  const hashToCheck = user ? user.password_hash : '$2b$10$C6UyWq0k0dummydummydummydummydummydummydu1';
  const ok = await bcrypt.compare(password, hashToCheck);

  if (!user || !ok) {
    throw new ApiError(401, 'Invalid phone or password');
  }

  // Strip the password_hash before returning / signing.
  const { password_hash: _drop, ...safe } = user;
  const token = signToken(safe);
  return { token, user: shape(safe) };
}

/** Fetch the current user profile by id. */
async function me(id) {
  const user = await userModel.findByIdSafe(id);
  if (!user) throw new ApiError(404, 'User not found');
  return shape(user);
}

/** MySQL gives a boolean expression back as 1/0 — a screen should see true/false. */
function shape(user) {
  if (!user) return user;
  return { ...user, has_pin: !!user.has_pin };
}

const CURRENCIES = ['toman', 'rial', 'dinar', 'dollar', 'dirham', 'euro', 'afghani'];
const LANGS = ['fa', 'ar'];

/**
 * Update the account owner's own profile (name / currency / lang / footer_text).
 * Only known fields are passed on — the model whitelists them again.
 */
async function updateProfile(id, payload) {
  const fields = {};
  if (payload.name !== undefined && String(payload.name).trim() !== '') fields.name = String(payload.name).trim();
  if (payload.currency !== undefined) {
    if (!CURRENCIES.includes(payload.currency)) throw new ApiError(422, 'Unsupported currency');
    fields.currency = payload.currency;
  }
  if (payload.lang !== undefined) {
    if (!LANGS.includes(payload.lang)) throw new ApiError(422, 'Language must be fa or ar');
    fields.lang = payload.lang;
  }
  if (payload.footer_text !== undefined) fields.footer_text = payload.footer_text || null;

  const user = await userModel.updateProfile(id, fields);
  if (!user) throw new ApiError(404, 'User not found');
  return shape(user);
}

// --- the app lock (Phase 9) ---------------------------------------------------

const PIN_RE = /^\d{4,8}$/;
const PIN_ROUNDS = 8;
const PIN_MAX_FAILS = 5;
const PIN_COOLDOWN_MS = 60 * 1000;

/**
 * Wrong-code attempts are counted in memory per user, so guessing a 4-digit code
 * by script takes hours instead of minutes. It lives in the process (not the DB)
 * on purpose: a restart clearing the count is acceptable for a ledger lock, while
 * writing a counter on every typo is not.
 */
const pinFails = new Map();

function pinCooldown(id) {
  const rec = pinFails.get(id);
  return rec && rec.until > Date.now() ? rec : null;
}

function pinFailed(id) {
  const rec = pinFails.get(id) || { fails: 0, until: 0 };
  rec.fails += 1;
  if (rec.fails >= PIN_MAX_FAILS) {
    rec.until = Date.now() + PIN_COOLDOWN_MS;
    rec.fails = 0;
  }
  pinFails.set(id, rec);
}

/**
 * PUT /api/auth/pin — set, change or remove the app-lock code.
 * The account PASSWORD is the proof, never the old code: a lock you can change
 * with the code alone is not a lock. Send pin: null (or empty) to switch it off.
 */
async function setPin(id, { pin, password }) {
  const existing = await userModel.findByPhoneWithSecret((await userModel.findByIdSafe(id)).phone);
  if (!existing) throw new ApiError(404, 'User not found');
  const ok = await bcrypt.compare(String(password || ''), existing.password_hash);
  if (!ok) {
    // 422, not 401 — the session is fine; only this proof is wrong.
    throw new ApiError(422, 'Current password is wrong', [
      { field: 'password', message: 'Current password is wrong' },
    ]);
  }

  const removing = pin === null || pin === undefined || String(pin).trim() === '';
  if (removing) {
    await userModel.setPinHash(id, null);
    pinFails.delete(id);
    return { has_pin: false };
  }

  const code = String(pin).trim();
  if (!PIN_RE.test(code)) throw new ApiError(422, 'The code must be 4 to 8 digits');
  await userModel.setPinHash(id, await bcrypt.hash(code, PIN_ROUNDS));
  pinFails.delete(id);
  return { has_pin: true };
}

/** POST /api/auth/pin/unlock — one check of the code against the stored hash. */
async function unlock(id, { pin }) {
  if (pinCooldown(id)) throw new ApiError(429, 'Too many wrong attempts — try again later');
  const hash = await userModel.findPinHash(id);
  if (hash === undefined) throw new ApiError(404, 'User not found');
  if (!hash) throw new ApiError(422, 'This account has no lock code');
  if (!PIN_RE.test(String(pin).trim())) throw new ApiError(422, 'The code must be 4 to 8 digits');

  const ok = await bcrypt.compare(String(pin).trim(), hash);
  if (!ok) {
    pinFailed(id);
    if (pinCooldown(id)) throw new ApiError(429, 'Too many wrong attempts — try again later');
    throw new ApiError(422, 'The code is wrong');
  }
  pinFails.delete(id);
  return { unlocked: true };
}

/** Change the password — the old one must match first. */
async function changePassword(id, { currentPassword, newPassword }) {
  if (!newPassword || String(newPassword).length < 6) {
    throw new ApiError(422, 'New password must be at least 6 characters');
  }
  const user = await userModel.findByPhoneWithSecret((await userModel.findByIdSafe(id)).phone);
  const ok = user && await bcrypt.compare(String(currentPassword || ''), user.password_hash);
  if (!ok) {
    // 422 and NOT 401: the session is still valid, only this answer is wrong. A
    // 401 tells the client "your token died" and bounces a logged-in user back to
    // the login screen for one typo in the settings sheet.
    throw new ApiError(422, 'Current password is wrong', [
      { field: 'currentPassword', message: 'Current password is wrong' },
    ]);
  }
  await userModel.updatePassword(id, await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS));
}

module.exports = { register, login, me, updateProfile, changePassword, setPin, unlock };
