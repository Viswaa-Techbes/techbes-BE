const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');
const {
  getSummary,
  getRevenue,
  getJobsBreakdown,
  getTechnicianPerformance,
  getBookingFunnel,
} = require('../../controllers/v2/analyticsControllerV2');
const { getAdmissionSummary, getCoursePopularity, getGeo, getConversion } = require('../../controllers/v2/admissionAnalyticsControllerV2');

// All analytics routes require admin or manager role + canViewReports permission
router.use(authenticate, requireRoles('admin', 'manager'), requirePermission('canViewReports'));

router.get('/summary', getSummary);
router.get('/revenue', getRevenue);
router.get('/jobs', getJobsBreakdown);
router.get('/technicians', getTechnicianPerformance);
router.get('/funnel', getBookingFunnel);

// Admission-specific analytics
router.get('/admissions/summary', getAdmissionSummary);
router.get('/admissions/course-popularity', getCoursePopularity);
router.get('/admissions/geo', getGeo);
router.get('/admissions/conversion', getConversion);

module.exports = router;
