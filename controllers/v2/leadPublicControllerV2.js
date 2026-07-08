const Lead = require('../../models/Lead');

async function createLead(req, res, next) {
  try {
    const payload = req.body || {};
    if (!payload.name || !payload.phone) return res.status(400).json({ success: false, message: 'name and phone are required' });
    const lead = await Lead.create({
      name: payload.name.trim(),
      phone: payload.phone.trim(),
      email: payload.email?.trim()?.toLowerCase(),
      company: payload.company?.trim(),
      address: payload.address?.trim(),
      location: payload.location || {},
      source: payload.source || 'web',
      requiredService: payload.requiredService?.trim(),
      budget: Number(payload.budget) || 0,
      priority: payload.priority || 'medium',
      remarks: payload.remarks || '',
    });
    res.status(201).json({ success: true, data: lead });
  } catch (err) { next(err); }
}

async function listPublic(req, res, next) {
  try {
    const query = { isDeleted: { $ne: true } };
    if (req.query.phone) query.phone = req.query.phone;
    const leads = await Lead.find(query).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, data: leads });
  } catch (err) { next(err); }
}

module.exports = { createLead, listPublic };
