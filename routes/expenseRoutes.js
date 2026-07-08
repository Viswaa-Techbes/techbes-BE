const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { authenticate, requireRoles } = require('../middlewares/auth');

router.use(authenticate);

router.get('/', expenseController.listExpenses);
router.post('/', requireRoles('technician'), expenseController.createExpense);
router.patch('/:id/status', requireRoles('admin', 'manager'), expenseController.updateExpenseStatus);

module.exports = router;
