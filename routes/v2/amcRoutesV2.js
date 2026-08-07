const express = require('express');
const router = express.Router();
const amcController = require('../../controllers/v2/amcControllerV2');
const { authenticate, requireRoles } = require('../../middlewares/auth');

router.use(authenticate);

// Customer specific
router.post('/purchase', amcController.purchaseAmc);
router.get('/customer/contracts', amcController.getCustomerContracts);

// Technician specific
router.get('/technician/visits', amcController.getTechnicianVisits);

// Admin dashboard/analytics & management
router.get('/dashboard', requireRoles('admin', 'manager'), amcController.getDashboardStats);
router.get('/contracts', amcController.getContracts);
router.get('/contracts/:id', amcController.getContractById);
router.put('/contracts/:id', amcController.updateContract);
router.delete('/contracts/:id', requireRoles('admin'), amcController.deleteContract);

// Visits scheduling
router.post('/contracts/:id/schedule', amcController.scheduleVisit);
router.post('/contracts/:id/reschedule', amcController.rescheduleVisit);
router.post('/contracts/:id/cancel-visit', amcController.cancelVisit);
router.post('/contracts/:id/complete-visit', amcController.completeVisit);
router.post('/contracts/:id/renew', amcController.renewContract);

module.exports = router;
