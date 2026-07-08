const VisitorAnalytics = require('../models/VisitorAnalytics');

function extractIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function parseUserAgent(ua = '') {
  const lower = String(ua).toLowerCase();
  const browser = lower.includes('edg') ? 'Edge' : lower.includes('chrome') ? 'Chrome' : lower.includes('firefox') ? 'Firefox' : lower.includes('safari') ? 'Safari' : 'Unknown';
  const device = /mobile|android|iphone|ipad/.test(lower) ? 'Mobile' : 'Desktop';
  return { browser, device };
}

// Legacy visitor analytics disabled — now handled by GA4. Keep file for safety
// to avoid breaking imports; middleware is intentionally a no-op.
function visitorAnalyticsMiddleware(req, res, next) {
  return next();
}

module.exports = { visitorAnalyticsMiddleware };
