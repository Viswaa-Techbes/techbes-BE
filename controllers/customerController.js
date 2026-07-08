const Customer = require('../models/Customer');

async function listCustomers(req, res, next) {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: customers });
  } catch (err) {
    next(err);
  }
}

async function createCustomer(req, res, next) {
  try {
    const { name, email, phone, pincode, service, status, role } = req.body;
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'name, email, and phone are required',
      });
    }

    const existing = await Customer.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const customer = await Customer.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      pincode: pincode ? pincode.trim() : undefined,
      service: service ? service.trim() : null,
      role: role || 'user',
      status: status || 'Pending',
    });

    return res.status(201).json({
      success: true,
      message: 'Customer created',
      data: customer,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCustomers,
  createCustomer,
};
