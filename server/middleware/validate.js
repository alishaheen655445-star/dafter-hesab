// -----------------------------------------------------------------------------
//  express-validator result collector — runs after a chain of validators and
//  turns any failures into a single 422 ApiError with a details array.
// -----------------------------------------------------------------------------
const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

module.exports = function validate(req, _res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.path || e.param, message: e.msg }));
    return next(new ApiError(422, 'Validation failed', details));
  }
  return next();
};
