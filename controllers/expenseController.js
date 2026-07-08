const Expense = require('../models/Expense');

/**
 * GET /expenses
 * List expenses based on user role
 */
async function listExpenses(req, res, next) {
  try {
    const { role, id } = req.user;
    const query = {};

    if (role === 'technician') {
      query.technicianId = id;
    } else if (role === 'manager') {
      // In a real app, maybe managers only see their team's expenses
      // For now, let's allow managers/admins to see all for simplicity or filter by jobId if provided
    }

    const expenses = await Expense.find(query)
      .sort({ createdAt: -1 })
      .populate('technicianId', 'name email')
      .populate('jobId', 'title')
      .lean();

    return res.json({
      success: true,
      data: expenses,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /expenses
 * Create a new expense (Technician only)
 */
async function createExpense(req, res, next) {
  try {
    const { description, amount, jobId, receiptUrl } = req.body;

    if (!description || !amount) {
      return res.status(400).json({ success: false, message: 'Description and amount are required' });
    }

    const expense = await Expense.create({
      description,
      amount,
      jobId,
      receiptUrl,
      technicianId: req.user.id,
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      message: 'Expense submitted for approval',
      data: expense,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /expenses/:id/approve
 * Approve or reject an expense (Admin/Manager only)
 */
async function updateExpenseStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const expense = await Expense.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    return res.json({
      success: true,
      message: `Expense ${status} successfully`,
      data: expense,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listExpenses,
  createExpense,
  updateExpenseStatus,
};
