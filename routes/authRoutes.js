const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const rateLimit = require('../middlewares/rateLimit');

const router = express.Router();

// POST /auth/login or /login
router.post('/login', authController.login);

router.post('/send-otp', rateLimit({ windowMs: 60_000, max: 3, keyPrefix: 'send-otp' }), authController.sendOtp);

router.post('/verify-otp', rateLimit({ windowMs: 5 * 60_000, max: 8, keyPrefix: 'verify-otp' }), authController.verifyOtp);

// POST /auth/register or /register
router.post('/register', authController.register);

// GET /auth/me or /me
router.get('/me', authenticate, authController.me);

// POST /auth/fcm-token
router.post('/fcm-token', authenticate, authController.updateFcmToken);

// POST /auth/logout
router.post('/logout', authenticate, authController.logout);

// GET /session to retrieve current authenticated session data
router.get('/session', authenticate, (req, res) => {
  // Assuming authUser is attached by authenticate middleware
  const user = req.authUser?.toSafeObject?.() || null;
  // Token may be stored in cookie/local storage; include if available
  const token = req.authUser?.token || null;
  res.json({ authenticated: true, user, token });
});

module.exports = router;
