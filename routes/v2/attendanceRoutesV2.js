const express = require('express');
const attendanceControllerV2 = require('../../controllers/v2/attendanceControllerV2');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.post('/clock-in', authenticate, async (req, res, next) => {
  // Allow authenticated technician to clock in for themselves
  req.body.userId = req.user.id;
  return attendanceControllerV2.adminClockIn(req, res, next);
});

router.post('/clock-out', authenticate, async (req, res, next) => {
  req.body.userId = req.user.id;
  return attendanceControllerV2.adminClockOut(req, res, next);
});

// Publicly mark attendance on login (handled internally or via endpoint)
router.post('/mark-login', authenticate, attendanceControllerV2.handleMarkAttendance);
router.post('/mark-logout', authenticate, attendanceControllerV2.handleLogoutAttendance);

// Admin reporting
router.get('/today', authenticate, requireRoles('admin'), attendanceControllerV2.getTodayAttendance);
router.get('/range', authenticate, requireRoles('admin'), attendanceControllerV2.getAttendanceRange);
router.get('/month', authenticate, requireRoles('admin'), attendanceControllerV2.getMonthlyAttendance);
router.patch('/:id', authenticate, requireRoles('admin'), attendanceControllerV2.updateAttendanceRecord);

// Legacy/Compatibility: GET base returns today's attendance for admin
router.get('/', authenticate, requireRoles('admin'), attendanceControllerV2.getTodayAttendance);

module.exports = router;

