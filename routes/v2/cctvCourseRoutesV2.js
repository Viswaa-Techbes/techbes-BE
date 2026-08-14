const express = require('express');
const cctvCourseControllerV2 = require('../../controllers/v2/cctvCourseControllerV2');

const router = express.Router();

router.post('/registrations', cctvCourseControllerV2.createRegistration);
router.post('/razorpay/create-order', cctvCourseControllerV2.createRazorpayOrder);
router.post('/razorpay/verify', cctvCourseControllerV2.verifyRazorpayPayment);
router.post('/razorpay/webhook', cctvCourseControllerV2.webhookHandler);
router.get('/certificates/:id', cctvCourseControllerV2.getCertificateDetails);
router.get('/admin/masterclass/stats', cctvCourseControllerV2.getAdminStats);

module.exports = router;
