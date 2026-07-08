const User = require('../../models/User');

async function listTechnicians(req, res, next) {
  try {
    const techs = await User.find({ role: 'technician', isDeleted: { $ne: true } }).select('-password').sort({ name: 1 }).lean();
    res.json({ success: true, data: techs });
  } catch (err) { next(err); }
}

async function updateStatus(req, res, next) {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const update = {};
    if (body.status) update.status = body.status;
    if (typeof body.isOnline === 'boolean') update.isOnline = body.isOnline;
    if (typeof body.lat === 'number') update.lat = body.lat;
    if (typeof body.lng === 'number') update.lng = body.lng;
    if (!Object.keys(update).length) return res.status(400).json({ success: false, message: 'No valid fields to update' });
    const user = await User.findByIdAndUpdate(id, update, { new: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Technician not found' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
}

async function assignManager(req, res, next) {
  try {
    const id = req.params.id;
    const { managerId } = req.body;
    const user = await User.findByIdAndUpdate(id, { assignedManager: managerId || null }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Technician not found' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
}

module.exports = { listTechnicians, updateStatus, assignManager };
