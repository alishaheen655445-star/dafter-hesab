// -----------------------------------------------------------------------------
//  Authentication middleware — verifies the Bearer JWT and attaches req.user.
//  This app has ONE role (the account owner). No authorize() needed for now.
// -----------------------------------------------------------------------------
const ApiError = require('../utils/ApiError');
const { verifyToken } = require('../utils/jwt');

/**
 * Reads "Authorization: Bearer <token>", verifies it, and attaches the decoded
 * user to req.user. Rejects with 401 when missing/invalid/expired.
 */
const authenticate = (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Authentication required. Provide a Bearer token.'));
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, phone: payload.phone, name: payload.name };
    return next();
  } catch (_err) {
    // Expired or tampered token — a generic message avoids leaking internals.
    return next(new ApiError(401, 'Invalid or expired token'));
  }
};

module.exports = { authenticate };
