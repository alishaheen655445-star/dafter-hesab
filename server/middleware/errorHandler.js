// -----------------------------------------------------------------------------
//  Centralized error handling.
//    notFound    : unmatched route -> 404 ApiError
//    errorHandler: single place that formats ALL error responses
//
//  Error shape:  { success: false, message, errors? }
//
//  The message is written in English by whoever threw it, and translated here
//  for the language the client asked for (X-App-Lang). One place does both, so no
//  service or validator has to know anything about languages.
// -----------------------------------------------------------------------------
const ApiError = require('../utils/ApiError');
const { localize } = require('../utils/i18nMessages');

const notFound = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const lang = req && req.headers ? req.headers['x-app-lang'] : '';

  // Never leak internals in production. In dev, still hide stack from body.
  const message =
    statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Something went wrong';

  const body = { success: false, message: localize(message, lang) };
  if (err.details) {
    // Field errors go through the same table: a form shows them under the input.
    body.errors = err.details.map((d) => ({ ...d, message: localize(d.message, lang) }));
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }

  return res.status(statusCode).json(body);
};

module.exports = { notFound, errorHandler };
