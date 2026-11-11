// -----------------------------------------------------------------------------
//  ApiError — a plain Error that also carries an HTTP status code.
//  Anywhere in the code: `throw new ApiError(404, 'Party not found')` and the
//  central error handler will translate it into a clean JSON response.
// -----------------------------------------------------------------------------
class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.details = details;         // optional extra info (e.g. validation errors)
    this.isOperational = true;      // distinguishes expected errors from bugs
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
