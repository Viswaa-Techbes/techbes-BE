const express = require('express');

const paymentController = require('../controllers/paymentController');
const { authenticate, requireRoles } = require('../middlewares/auth');

const router = express.Router();

router.post('/create-order', authenticate, requireRoles('manager', 'admin'), paymentController.createOrder);
router.post('/verify-payment', authenticate, requireRoles('manager', 'admin', 'technician'), paymentController.verifyPayment);

module.exports = router;
