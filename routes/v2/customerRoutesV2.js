const express = require('express');
const router = express.Router();
const customerController = require('../../controllers/v2/customerControllerV2');
const { authenticate } = require('../../middlewares/auth');

router.use(authenticate);

// Wallet
router.get('/wallet', customerController.getWallet);
router.post('/wallet/add', customerController.addFunds);

// Tickets (Unified Role-Scoped: Customer, Association, Resident)
const apartmentController = require('../../controllers/v2/apartmentControllerV2');
router.get('/tickets', apartmentController.getTickets);
router.post('/tickets', apartmentController.createTicket);
router.get('/tickets/:id', apartmentController.getTicketById);
router.put('/tickets/:id/reply', apartmentController.replyToTicket);

// Dashboard
router.get('/dashboard-stats', customerController.getDashboardStats);

module.exports = router;
