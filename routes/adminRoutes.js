const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticate, requireRoles, verifyCsrf } = require('../middlewares/auth');
const rateLimit = require('../middlewares/rateLimit');

const router = express.Router();

// Public Admin Auth with Rate Limiting (5 requests / min on login, 5 / 5 min on MFA)
router.post(
  '/login',
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'admin-login', message: 'Too many login attempts. Please wait a minute before trying again.' }),
  adminController.adminLogin
);

router.post(
  '/mfa-verify',
  rateLimit({ windowMs: 5 * 60_000, max: 8, keyPrefix: 'admin-mfa-verify', message: 'Too many verification attempts. Please wait a few minutes.' }),
  adminController.verifyAdminMfa
);

router.post(
  '/mfa-resend',
  rateLimit({ windowMs: 60_000, max: 3, keyPrefix: 'admin-mfa-resend', message: 'Too many resend attempts. Please wait 60 seconds.' }),
  adminController.resendAdminMfa
);

// Protected Admin Routes (Require Admin Auth + CSRF Header verification on mutations)
router.use(authenticate, requireRoles('admin'), verifyCsrf);

router.get('/dashboard', adminController.dashboard);
router.get('/users', adminController.listUsers);
router.get('/technicians', adminController.listTechnicians);
router.get('/jobs', adminController.listJobs);
router.post('/jobs', adminController.createJob);
router.get('/completion-requests', adminController.listCompletionRequests);
router.patch('/completion-requests/:taskId', adminController.updateCompletionRequest);
router.get('/payment-requests', adminController.listPaymentRequests);
router.patch('/payment-requests/:jobId', adminController.updatePaymentRequest);
router.post('/managers', adminController.createManager);
router.post('/technicians', adminController.createTechnician);
router.get('/reviews', adminController.listReviews);
router.get('/tracking', adminController.getTracking);

module.exports = router;
