// -----------------------------------------------------------------------------
//  asyncHandler — wraps an async route handler so any rejected promise is
//  forwarded to Express' error middleware via next(err). Removes try/catch noise.
// -----------------------------------------------------------------------------
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
