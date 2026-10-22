const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const rateLimit = require('../middlewares/rateLimit');

const router = express.Router();

// POST /auth/login or /login (rate-limited to 5 attempts per minute per IP/account)
router.post(
  '/login',
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'auth-login', message: 'Too many login attempts. Please wait a minute.' }),
  authController.login
);

router.post(
  '/send-otp',
  rateLimit({ windowMs: 60_000, max: 3, keyPrefix: 'send-otp' }),
  authController.sendOtp
);

router.post(
  '/verify-otp',
  rateLimit({ windowMs: 5 * 60_000, max: 8, keyPrefix: 'verify-otp' }),
  authController.verifyOtp
);

// POST /auth/register or /register
router.post(
  '/register',
  rateLimit({ windowMs: 5 * 60_000, max: 5, keyPrefix: 'auth-register' }),
  authController.register
);

// GET /auth/me or /me
router.get('/me', authenticate, authController.me);

// POST /auth/fcm-token
router.post('/fcm-token', authenticate, authController.updateFcmToken);

// POST /auth/logout
router.post('/logout', authenticate, authController.logout);

// Password recovery routes
router.post(
  '/forgot-password',
  rateLimit({ windowMs: 5 * 60_000, max: 3, keyPrefix: 'forgot-password', message: 'Too many password reset requests. Please wait a few minutes.' }),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  rateLimit({ windowMs: 5 * 60_000, max: 5, keyPrefix: 'reset-password', message: 'Too many password reset attempts. Please wait a few minutes.' }),
  authController.resetPassword
);

// GET /session to retrieve current authenticated session data
router.get('/session', authenticate, async (req, res) => {
  const user = req.authUser?.toSafeObject?.() || null;
  const token = req.authUser?.token || null;

  if (user && user.apartmentId) {
    try {
      const Apartment = require('../models/Apartment');
      const apt = await Apartment.findById(user.apartmentId).select('name address locality city pincode contactPerson contactPhone');
      if (apt) {
        user.apartment = {
          id: apt._id.toString(),
          name: apt.name,
          address: apt.address,
          locality: apt.locality,
          city: apt.city,
          pincode: apt.pincode,
          contactPerson: apt.contactPerson,
          contactPhone: apt.contactPhone,
        };
        user.apartmentName = apt.name;
      }
    } catch (err) {
      // Non-critical enrichment
    }
  }

  res.json({ authenticated: true, user, token });
});

module.exports = router;
