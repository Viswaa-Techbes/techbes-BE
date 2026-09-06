/**
 * Central error handler — keeps responses consistent and prevents leaking internals in production.
 */
function errorHandler(err, req, res, next) {
  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join(', ') || 'Validation error',
    });
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    const duplicateField = err.keyPattern ? Object.keys(err.keyPattern)[0] : 'field';
    return res.status(409).json({
      success: false,
      message: `${duplicateField.charAt(0).toUpperCase() + duplicateField.slice(1)} already registered or in use.`,
    });
  }

  // Malformed MongoDB ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid resource identifier format',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication session',
    });
  }

  // Log full error internally on server
  console.error('[Unhandled Error]', {
    method: req.method,
    path: req.originalUrl,
    message: err.message,
    stack: err.stack,
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = err.status || err.statusCode || 500;
  
  // Suppress sensitive internals in production
  const responseMessage =
    statusCode < 500
      ? err.message
      : isProduction
        ? 'An unexpected error occurred. Please try again later.'
        : err.message || 'Internal server error';

  return res.status(statusCode).json({
    success: false,
    message: responseMessage,
    ...(!isProduction && err.stack ? { debugStack: err.stack } : {}),
  });
}

module.exports = errorHandler;
