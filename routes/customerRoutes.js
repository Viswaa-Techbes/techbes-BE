const express = require('express');
const customerController = require('../controllers/customerController');
const { authenticate, requireRoles } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate, requireRoles('admin', 'manager'));

router.get('/', customerController.listCustomers);
router.post('/', customerController.createCustomer);

module.exports = router;
