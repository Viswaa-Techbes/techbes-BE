const express = require('express');
const cctvCourseControllerV2 = require('../../controllers/v2/cctvCourseControllerV2');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

// ─── Public Routes ───────────────────────────────────────────────────────────
router.post('/registrations', cctvCourseControllerV2.createRegistration);
router.post('/razorpay/create-order', cctvCourseControllerV2.createRazorpayOrder);
router.post('/razorpay/verify', cctvCourseControllerV2.verifyRazorpayPayment);
router.post('/razorpay/webhook', cctvCourseControllerV2.webhookHandler);
router.get('/certificates/:id', cctvCourseControllerV2.getCertificateDetails);

// ─── Admin Routes (require admin auth) ───────────────────────────────────────
router.get('/admin/masterclass/stats', cctvCourseControllerV2.getAdminStats);
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

module.exports = router;
