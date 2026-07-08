const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authenticate } = require('../middlewares/auth');

router.post('/mark-attendance', authenticate, attendanceController.markAttendance);
router.post('/mark-logout', authenticate, attendanceController.markLogout);
router.get('/all', authenticate, attendanceController.getAllAttendance);
router.get('/:userId', authenticate, attendanceController.getAttendanceByUser);

module.exports = router;
