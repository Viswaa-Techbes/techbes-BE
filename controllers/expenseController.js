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

    if (!description || amount === undefined || amount === null) {
      return res.status(400).json({ success: false, message: 'Description and amount are required' });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a valid positive number greater than ₹0' });
    }

    if (numAmount > 50000) {
      return res.status(400).json({ success: false, message: 'Expense amount exceeds single claim maximum limit of ₹50,000' });
    }

    const cleanDesc = description.trim();
    if (cleanDesc.length < 3) {
      return res.status(400).json({ success: false, message: 'Description must be at least 3 characters long' });
    }

    if (jobId) {
      const Job = require('../models/Job');
      const jobExists = await Job.findById(jobId).select('_id title customerName');
      if (!jobExists) {
        return res.status(400).json({ success: false, message: 'Linked project/job not found' });
      }
    }

    const expense = await Expense.create({
      description: cleanDesc,
      amount: numAmount,
      jobId: jobId || undefined,
      receiptUrl: receiptUrl || undefined,
      technicianId: req.user.id,
      status: 'pending',
    });

    const io = req.app.get('io') || global._socketIo;
    if (io) {
      io.to('admin_room').emit('newExpenseSubmission', {
        expenseId: expense._id,
        technicianId: req.user.id,
        technicianName: req.user.name,
        amount: numAmount,
        description: cleanDesc,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Expense submitted for approval successfully',
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
