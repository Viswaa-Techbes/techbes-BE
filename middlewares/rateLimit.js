const buckets = new Map();

function rateLimit({ windowMs = 60_000, max = 5, keyPrefix = 'default' } = {}) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip}:${(req.body?.email || req.body?.mobileNumber || '').toString().toLowerCase()}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      return res.status(429).json({ success: false, message: 'Too many attempts. Please try again shortly.' });
    }

    next();
  };
}

module.exports = rateLimit;
