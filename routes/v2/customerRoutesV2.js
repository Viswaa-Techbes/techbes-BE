const express = require('express');
const router = express.Router();
const customerController = require('../../controllers/v2/customerControllerV2');
const { authenticate } = require('../../middlewares/auth');

router.use(authenticate);

// Wallet
router.get('/wallet', customerController.getWallet);
router.post('/wallet/add', customerController.addFunds);

// Tickets
router.get('/tickets', customerController.getTickets);
router.post('/tickets', customerController.createTicket);
router.put('/tickets/:id/reply', customerController.replyTicket);

// Dashboard
router.get('/dashboard-stats', customerController.getDashboardStats);

module.exports = router;
