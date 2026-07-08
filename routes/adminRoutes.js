const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticate, requireRoles } = require('../middlewares/auth');

const router = express.Router();

// Public Admin Auth
router.post('/login', adminController.adminLogin);

// Protected Admin Routes
router.use(authenticate, requireRoles('admin'));

router.get('/dashboard', adminController.dashboard);
router.get('/users', adminController.listUsers);
router.get('/technicians', adminController.listTechnicians);
router.get('/jobs', adminController.listJobs);
router.post('/jobs', adminController.createJob);
router.get('/completion-requests', adminController.listCompletionRequests);
router.patch('/completion-requests/:taskId', adminController.updateCompletionRequest);
router.get('/payment-requests', adminController.listPaymentRequests);
router.patch('/payment-requests/:jobId', adminController.updatePaymentRequest);
router.post('/managers', adminController.createManager);
router.post('/technicians', adminController.createTechnician);
router.get('/reviews', adminController.listReviews);
router.get('/tracking', adminController.getTracking);

module.exports = router;
