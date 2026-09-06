const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

/**
 * Verifies JWT and attaches req.user { id, role } and full user doc on req.authUser.
 * Enforces session activity, account deletion checks, and role-specific inactivity timeouts.
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
    if (!user || user.isDeleted) {
      return res.status(401).json({ success: false, message: 'User account does not exist or has been disabled' });
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
    };
    req.authUser = user;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const lastSeen = user.lastSeen ? new Date(user.lastSeen) : now;
    const lastSeenStr = lastSeen.toISOString().split('T')[0];

    // Check inactivity timeout for admin accounts (30 minutes)
    if (user.role === 'admin' && user.lastSeen) {
      const inactiveMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
      if (inactiveMinutes > 30) {
        user.sessionActive = false;
        user.isOnline = false;
        await user.save({ validateBeforeSave: false });
        return res.status(401).json({
          success: false,
          message: 'Admin session expired due to inactivity (30 minutes). Please sign in again.',
        });
      }
    }

    // Daily Session Check for standard users
    if (!user.sessionActive || (lastSeenStr !== todayStr)) {
      user.sessionActive = false;
      user.isOnline = false;
      await user.save({ validateBeforeSave: false });
      return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
    }

    user.lastSeen = now;
    await user.save({ validateBeforeSave: false });
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
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
      return res.status(403).json({ success: false, message: 'Insufficient permissions to access this resource' });
    }
    next();
  };
}

/**
 * Optional authentication: attaches req.user if token is valid without blocking guests.
 */
async function optionalAuthenticate(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return next();
    const secret = process.env.JWT_SECRET;
    if (!secret) return next();
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.sub).select('-password');
    if (user && !user.isDeleted) {
      req.user = { id: user._id.toString(), role: user.role, email: user.email };
      req.authUser = user;
    }
    next();
  } catch {
    // Invalid token – proceed as guest
    next();
  }
}

/**
 * CSRF defense for browser-initiated state changes (POST, PUT, PATCH, DELETE).
 * Requires custom header or bearer authorization.
 */
function verifyCsrf(req, res, next) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return next();
  }

  const customHeader =
    req.headers['x-requested-with'] ||
    req.headers['x-csrf-protection'] ||
    req.headers['x-csrf-token'];

  const hasBearer = req.headers.authorization?.startsWith('Bearer ');

  if (!customHeader && !hasBearer) {
    return res.status(403).json({
      success: false,
      message: 'Missing required CSRF protection headers for state-changing request.',
    });
  }

  next();
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireRoles,
  verifyCsrf,
  getBearerToken,
};
