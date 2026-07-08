const express = require('express');
const paymentControllerV2 = require('../../controllers/v2/paymentControllerV2');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.post('/create-order', authenticate, paymentControllerV2.createOrder);
router.post('/verify-payment', authenticate, paymentControllerV2.verifyPayment);
router.post('/webhook', paymentControllerV2.webhookHandler);
router.get('/my', authenticate, paymentControllerV2.myPayments);
router.get('/:id', authenticate, paymentControllerV2.getPaymentById);
router.get('/:id/audit', authenticate, requireRoles('admin'), paymentControllerV2.getPaymentAudit);

// Admin endpoints
router.get('/admin/list', authenticate, requireRoles('admin'), paymentControllerV2.getAllPayments);
router.post('/admin/refund', authenticate, requireRoles('admin'), paymentControllerV2.refundPayment);
router.post('/admin/retry', authenticate, requireRoles('admin'), paymentControllerV2.retryPayment);

// New Flow
router.post('/request', authenticate, paymentControllerV2.requestPayment);
router.get('/requests', authenticate, requireRoles('admin'), paymentControllerV2.getPaymentRequests);
router.post('/approve', authenticate, requireRoles('admin'), paymentControllerV2.approvePaymentRequest);

module.exports = router;
