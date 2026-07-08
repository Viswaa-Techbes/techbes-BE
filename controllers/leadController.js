const bcrypt = require('bcryptjs');
const Lead = require('../models/Lead');

async function listLeads(req, res, next) {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: leads });
  } catch (err) {
    next(err);
  }
}

async function createLead(req, res, next) {
  try {
    const { name, email, phone, password, service, plan, pincode, paymentId, role, status } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'name, email, and phone are required',
      });
    }

    const existing = await Lead.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Lead already exists' });
    }

    const lead = await Lead.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password: password ? await bcrypt.hash(password, 10) : undefined,
      service: service ? service.trim() : undefined,
      plan: plan ? plan.trim() : undefined,
      pincode: pincode ? String(pincode).trim() : undefined,
      paymentId: paymentId ? paymentId.trim() : undefined,
      role: role || 'user',
      status: status || 'Active',
    });

    return res.status(201).json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listLeads,
  createLead,
};
