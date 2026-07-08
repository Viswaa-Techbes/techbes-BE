const express = require('express');
const courseControllerV2 = require('../../controllers/v2/courseControllerV2');

const router = express.Router();

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
router.post('/course-payments/create-order', courseControllerV2.createCoursePaymentOrder);
router.post('/course-payments/verify', courseControllerV2.verifyCoursePayment);

module.exports = router;
