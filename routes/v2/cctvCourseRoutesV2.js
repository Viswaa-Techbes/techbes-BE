const express = require('express');
const cctvCourseControllerV2 = require('../../controllers/v2/cctvCourseControllerV2');
const { authenticate, requireRoles } = require('../../middlewares/auth');
const rateLimit = require('../../middlewares/rateLimit');

const router = express.Router();

const registrationRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  keyPrefix: 'cctv-course-reg',
  message: 'Too many registration requests. Please wait a moment.',
});

const bulkEmailRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'cctv-zoom-bulk',
  message: 'Bulk email dispatch in progress. Please wait a minute before sending again.',
});

// ─── Public Routes ───────────────────────────────────────────────────────────
router.post('/registrations', registrationRateLimit, cctvCourseControllerV2.createRegistration);
router.get('/registrations/:id', cctvCourseControllerV2.getPublicRegistrationDetails);
router.post('/razorpay/create-order', cctvCourseControllerV2.createRazorpayOrder);
router.post('/razorpay/verify', cctvCourseControllerV2.verifyRazorpayPayment);
router.post('/cancel-payment', cctvCourseControllerV2.cancelPayment);
router.post('/razorpay/webhook', cctvCourseControllerV2.webhookHandler);
router.get('/certificates/:id', cctvCourseControllerV2.getCertificateDetails);

// ─── Admin Routes (require admin auth) ───────────────────────────────────────
router.get(
  '/admin/masterclass/stats',
  authenticate,
  requireRoles('admin'),
  cctvCourseControllerV2.getAdminStats
);
router.get(
  '/admin/registrations',
  authenticate,
  requireRoles('admin'),
  cctvCourseControllerV2.getAdminRegistrations
);
router.get(
  '/admin/registrations/:id',
  authenticate,
  requireRoles('admin'),
  cctvCourseControllerV2.getAdminRegistrationById
);
router.post(
  '/admin/registrations/bulk-send-zoom',
  authenticate,
  requireRoles('admin'),
  bulkEmailRateLimit,
  cctvCourseControllerV2.bulkSendZoomLink
);
router.post(
  '/admin/registrations/:id/send-zoom',
  authenticate,
  requireRoles('admin'),
  cctvCourseControllerV2.sendSingleZoomLink
);

module.exports = router;
