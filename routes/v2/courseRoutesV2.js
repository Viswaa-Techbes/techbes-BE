const express = require('express');
const courseControllerV2 = require('../../controllers/v2/courseControllerV2');
const rateLimit = require('../../middlewares/rateLimit');

const router = express.Router();

const orderCreationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'courses-order',
  message: 'Too many payment order attempts. Please wait a few minutes before trying again.',
});

const paymentVerifyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyPrefix: 'courses-verify',
  message: 'Too many payment verification attempts. Please wait a few minutes.',
});

router.get('/courses', courseControllerV2.listCourses);
router.post('/courses', courseControllerV2.createCourse);
router.get('/courses/:id', courseControllerV2.getCourse);
router.delete('/courses/:id', courseControllerV2.deleteCourse);

router.get('/course-enrollments', courseControllerV2.listEnrollments);
router.post('/course-enrollments', courseControllerV2.createEnrollment);
router.patch('/course-enrollments/:id', courseControllerV2.updateEnrollment);

router.get('/course-inquiries', courseControllerV2.listInquiries);
router.post('/course-inquiries', courseControllerV2.createInquiry);
router.patch('/course-inquiries/:id', courseControllerV2.updateInquiry);

router.post('/course-admin/login', courseControllerV2.loginCourseAdmin);
router.get('/course-analytics', courseControllerV2.getCourseAnalytics);
router.post('/course-payments/create-order', orderCreationRateLimit, courseControllerV2.createCoursePaymentOrder);
router.post('/course-payments/verify', paymentVerifyRateLimit, courseControllerV2.verifyCoursePayment);

module.exports = router;
