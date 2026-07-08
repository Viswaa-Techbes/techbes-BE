const express = require('express');
const router = express.Router();
const walletController = require('../../controllers/v2/walletControllerV2');
const { authenticate } = require('../../middlewares/auth');

router.use(authenticate);

// Wallet Razorpay Flow
router.post('/create-order', walletController.createOrder);
router.post('/verify-payment', walletController.verifyPayment);

// Wallet Info
router.get('/', walletController.getWallet);
router.get('/transactions', walletController.getTransactions);

module.exports = router;
