const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

/**
 * Verifies JWT and attaches req.user { id, role } and full user doc on req.authUser when needed.
 */
async function authenticate(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, message: 'Server JWT configuration error' });
    }

    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.sub).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
    };
    req.authUser = user;

    // Daily Session Check
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const lastSeenStr = user.lastSeen ? user.lastSeen.toISOString().split('T')[0] : '';
    
    if (!user.sessionActive || (lastSeenStr !== todayStr)) {
      user.sessionActive = false;
      user.isOnline = false;
      await user.save();
      return res.status(401).json({ success: false, message: 'Session expired. Please login daily.' });
    }

    user.lastSeen = now;
    await user.save({ validateBeforeSave: false });
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    next(err);
  }
}

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Like authenticate but never blocks – attaches req.user if token valid, otherwise req.user = null.
 */
async function optionalAuthenticate(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return next();
    const secret = process.env.JWT_SECRET;
    if (!secret) return next();
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.sub).select('-password');
    if (user) {
      req.user = { id: user._id.toString(), role: user.role };
      req.authUser = user;
    }
    next();
  } catch {
    // Invalid token – proceed as guest
    next();
  }
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireRoles,
  getBearerToken,
};
