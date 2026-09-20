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

    const now = Date.now();

    // 1. Mandatory IP-level bucket to prevent IP-based bot abuse regardless of email rotation
    const ipKey = `${keyPrefix}:ip:${rawIp}`;
    const ipBucket = buckets.get(ipKey) || { count: 0, resetAt: now + windowMs };
    if (ipBucket.resetAt <= now) {
      ipBucket.count = 0;
      ipBucket.resetAt = now + windowMs;
    }
    ipBucket.count += 1;
    buckets.set(ipKey, ipBucket);

    // 2. Secondary account-level bucket if account identifier is provided
    let accountBucket = null;
    let accKey = null;
    if (accountIdentifier) {
      accKey = `${keyPrefix}:acc:${accountIdentifier}`;
      accountBucket = buckets.get(accKey) || { count: 0, resetAt: now + windowMs };
      if (accountBucket.resetAt <= now) {
        accountBucket.count = 0;
        accountBucket.resetAt = now + windowMs;
      }
      accountBucket.count += 1;
      buckets.set(accKey, accountBucket);
    }

    // 3. Enforce limit if either IP or account exceeds threshold
    const isIpBlocked = ipBucket.count > max;
    const isAccBlocked = accountBucket && accountBucket.count > max;

    if (isIpBlocked || isAccBlocked) {
      const resetTime = isIpBlocked ? ipBucket.resetAt : accountBucket.resetAt;
      const retryAfterSec = Math.max(Math.ceil((resetTime - now) / 1000), 1);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        success: false,
        message,
        retryAfter: retryAfterSec,
      });
    }

    if (skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode < 400) {
          if (ipBucket.count > 0) ipBucket.count -= 1;
          if (accountBucket && accountBucket.count > 0) accountBucket.count -= 1;
        }
      });
    }

    next();
  };
}

module.exports = rateLimit;
