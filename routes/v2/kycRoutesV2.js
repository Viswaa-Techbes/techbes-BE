const express = require('express');
const controller = require('../../controllers/v2/kycControllerV2');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

// Authenticate all routes
router.use(authenticate);

// ─── Technician Routes ────────────────────────────────────────────────────────
router.get('/me', requireRoles('technician', 'manager', 'admin'), controller.getMyKyc);
router.put('/submit', requireRoles('technician'), controller.submitKyc);

// ─── Admin/Manager Routes ─────────────────────────────────────────────────────
router.get('/admin/pending', requireRoles('admin', 'manager'), controller.getPendingKyc);
router.put('/admin/:id/approve', requireRoles('admin', 'manager'), controller.approveKyc);
router.put('/admin/:id/reject', requireRoles('admin', 'manager'), controller.rejectKyc);

module.exports = router;
