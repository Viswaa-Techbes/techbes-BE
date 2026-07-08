const User = require('../models/User');

/**
 * GET /managers/:id/team
 * List technicians under a manager
 */
async function listTeam(req, res, next) {
  try {
    const { id } = req.params;
    
    // Authorization: only the manager themselves or admin can view
    if (req.user.role === 'manager' && req.user.id !== id) {
        return res.status(403).json({ success: false, message: 'Unauthorized access to manager team' });
    }

    const team = await User.find({ role: 'technician', assignedManager: id }).sort({ name: 1 }).lean();

    return res.json({
      success: true,
      data: team.map(u => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        phone: u.phone,
        status: u.status,
        isOnline: u.isOnline,
        specialty: u.specialty,
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listTeam,
};
