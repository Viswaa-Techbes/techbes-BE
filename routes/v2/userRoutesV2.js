const express = require('express');
const controller = require('../../controllers/v2/userDashboardControllerV2');
const { authenticate } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', controller.getDashboard);
router.get('/dashboard', controller.getDashboard);
router.get('/profile', controller.getProfile);
router.put('/profile', controller.updateProfile);
router.get('/addresses', controller.listAddresses);
router.post('/address', controller.createAddress);
router.put('/address/:id', controller.updateAddress);
router.delete('/address/:id', controller.deleteAddress);
router.get('/bookings', controller.getBookings);
router.get('/payments', controller.getPayments);
router.get('/service-reports', controller.getServiceReports);

module.exports = router;
