const buckets = new Map();

/**
 * Robust IP and account based rate-limiter middleware.
 */
function rateLimit({
  windowMs = 60_000,
  max = 5,
  keyPrefix = 'default',
  message = 'Too many attempts. Please try again shortly.',
  skipSuccessfulRequests = false,
} = {}) {
  // Periodically clean up stale buckets (every 10 minutes)
  if (!rateLimit._cleanupTimer) {
    rateLimit._cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) {
          buckets.delete(key);
        }
      }
    }, 10 * 60_000);
    if (rateLimit._cleanupTimer.unref) {
      rateLimit._cleanupTimer.unref();
    }
  }

  return (req, res, next) => {
    const rawIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      '127.0.0.1';

    const accountIdentifier = (
      req.body?.email ||
      req.body?.mobileNumber ||
      req.body?.identifier ||
      ''
    )
      .toString()
      .toLowerCase()
      .trim();

    const key = `${keyPrefix}:${rawIp}:${accountIdentifier}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        success: false,
        message,
        retryAfter: retryAfterSec,
      });
    }

    if (skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode < 400 && bucket.count > 0) {
          bucket.count -= 1;
        }
      });
    }

    next();
  };
}

module.exports = rateLimit;
