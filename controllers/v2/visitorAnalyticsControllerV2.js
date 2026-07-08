const VisitorAnalytics = require('../../models/VisitorAnalytics');
const geoip = require('geoip-lite');

// Simple in-memory cache to reduce DB load
const _cache = {};

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function parseUserAgent(ua = '') {
  const raw = String(ua).toLowerCase();
  const browser = raw.includes('edg') ? 'Edge' : raw.includes('chrome') ? 'Chrome' : raw.includes('firefox') ? 'Firefox' : raw.includes('safari') ? 'Safari' : 'Unknown';
  const device = /mobile|android|iphone|ipad/.test(raw) ? 'Mobile' : 'Desktop';
  const os = raw.includes('windows') ? 'Windows' : raw.includes('macintosh') || raw.includes('mac os') ? 'macOS' : raw.includes('linux') ? 'Linux' : raw.includes('android') ? 'Android' : raw.includes('iphone') || raw.includes('ipad') ? 'iOS' : 'Unknown';
  return { browser, device, os };
}

async function trackVisitor(req, res, next) {
  try {
    const safeIp = getClientIp(req);
    console.log(`[Analytics] Track Request: IP=${safeIp} Domain=${req.body?.domain} Page=${req.body?.page}`);
    
    const { page = '/', eventType, domain, sessionId, referral, os, metadata } = req.body || {};
    const { browser, device, os: detectedOs } = parseUserAgent(req.headers['user-agent']);

    // Geolocation resolution
    let country = 'Unknown', state = 'Unknown', city = 'Unknown';
    if (safeIp && safeIp !== 'unknown' && safeIp !== '127.0.0.1' && safeIp !== '::1') {
      const geo = geoip.lookup(safeIp);
      if (geo) {
        country = geo.country || 'Unknown';
        state = geo.region || 'Unknown';
        city = geo.city || 'Unknown';
      }
    }

    // Strict domain assignment
    const targetDomain = domain || 'unknown';

    await VisitorAnalytics.create({
      domain: targetDomain,
      hostname: targetDomain, // full hostname
      sessionId: sessionId || 'unknown',
      referral: referral || '',
      os: os || detectedOs || 'unknown',
      ip: safeIp,
      country,
      state,
      city,
      browser,
      device,
      page,
      eventType: eventType || 'page_view',
      visitedAt: new Date(),
      metadata: metadata || {},
    });

    return res.status(202).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

async function getDashboard(req, res, next) {
  try {
    const domain = req.query.domain || 'all';
    const cacheKey = `dashboard_${domain}`;
    const nowTs = Date.now();
    
    // Cache check: 8 seconds TTL
    if (_cache[cacheKey] && (nowTs - _cache[cacheKey].ts) < 8000) {
      return res.json({ success: true, data: _cache[cacheKey].data });
    }
    
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    // Strict match filter
    const matchDomain = domain === 'all' ? {} : { domain: domain };

    const [totalVisitors, todayVisitors, topPages, topCities, leadsCount, returningAgg] = await Promise.all([
      VisitorAnalytics.countDocuments(matchDomain),
      VisitorAnalytics.countDocuments({ ...matchDomain, visitedAt: { $gte: startOfDay } }),
      VisitorAnalytics.aggregate([
        { $match: matchDomain },
        { $group: { _id: '$page', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      VisitorAnalytics.aggregate([
        { $match: matchDomain },
        { $group: { _id: '$city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      VisitorAnalytics.countDocuments({ ...matchDomain, eventType: 'lead_submitted' }),
      VisitorAnalytics.aggregate([
        { $match: matchDomain },
        { $group: { _id: '$sessionId', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 }, _id: { $ne: 'unknown' } } },
        { $count: "returning" }
      ])
    ]);

    const trends = await VisitorAnalytics.aggregate([
      { $match: { ...matchDomain, visitedAt: { $gte: startOfWeek } } },
      {
        $group: {
          _id: {
            year: { $year: '$visitedAt' },
            month: { $month: '$visitedAt' },
            day: { $dayOfMonth: '$visitedAt' },
          },
          visitors: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);

    const payload = {
      totalVisitors,
      todayVisitors,
      leads: leadsCount,
      returningVisitors: returningAgg[0]?.returning || 0,
      topPages: topPages.map((x) => ({ page: x._id || '/', visitors: x.count })),
      topCities: topCities.map((x) => ({ city: x._id || 'Unknown', visitors: x.count })),
      trafficTrends: trends.map((t) => ({ date: `${t._id.day}/${t._id.month}`, visitors: t.visitors })),
    };
    
    _cache[cacheKey] = { ts: Date.now(), data: payload };
    return res.json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  trackVisitor,
  getDashboard,
};

// City-level detail: top pages & trends for a specific city
async function getCityDetail(req, res, next) {
  try {
    const city = req.params.city || 'unknown';
    const now = new Date();
    // support optional query range: ?from=YYYY-MM-DD&to=YYYY-MM-DD
    const fromQ = req.query.from;
    const toQ = req.query.to;
    const startOfWeek = fromQ ? new Date(fromQ) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const endDate = toQ ? new Date(toQ) : now;

    const [topPages, trends] = await Promise.all([
      VisitorAnalytics.aggregate([
        { $match: { city: city, visitedAt: { $gte: startOfWeek, $lte: endDate } } },
        { $group: { _id: '$page', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]),
      VisitorAnalytics.aggregate([
        { $match: { city: city, visitedAt: { $gte: startOfWeek, $lte: endDate } } },
        { $group: { _id: { year: { $year: '$visitedAt' }, month: { $month: '$visitedAt' }, day: { $dayOfMonth: '$visitedAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]),
    ]);

    const trendFormatted = trends.map(t => ({ date: `${t._id.day}/${t._id.month}`, visitors: t.count }));

    // Additional aggregates: avg session duration, unique visitors, returning vs new
    const extraAgg = await VisitorAnalytics.aggregate([
      { $match: { city: city, visitedAt: { $gte: startOfWeek, $lte: endDate } } },
      {
        $group: {
          _id: null,
          avgSession: { $avg: '$metadata.sessionDuration' },
          total: { $sum: 1 },
          uniqueIPs: { $addToSet: '$ip' },
        },
      },
    ]);

    const extras = (extraAgg && extraAgg[0]) ? {
      avgSessionDuration: extraAgg[0].avgSession || 0,
      totalHits: extraAgg[0].total || 0,
      uniqueVisitors: (extraAgg[0].uniqueIPs || []).length,
    } : { avgSessionDuration: 0, totalHits: 0, uniqueVisitors: 0 };

    return res.json({ success: true, data: { city, topPages: topPages.map(p => ({ page: p._id, visitors: p.count })), trends: trendFormatted, extras } });
  } catch (err) { return next(err); }
}

module.exports.getCityDetail = getCityDetail;
