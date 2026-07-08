const Notification = require('../models/Notification');

/**
 * GET /notifications
 * Get current user notifications
 */
async function getNotifications(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await Notification.countDocuments({ userId: req.user.id });
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.json({
      success: true,
      data: notifications,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /notifications/:id/read
 * Mark notification as read
 */
async function markAsRead(req, res, next) {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    // Emit updated unread count
    const io = req.app.get('io') || global._socketIo || null;
    if (io) {
      const unreadCount = await Notification.countDocuments({ userId: req.user.id, isRead: false });
      io.to(req.user.id.toString()).emit('unread_count', { count: unreadCount });
    }

    return res.json({
      success: true,
      data: notification,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /notifications/read-all
 * Mark all notifications for current user as read
 */
async function markAllAsRead(req, res, next) {
  try {
    const result = await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { isRead: true }
    );

    // Emit updated unread count (which is 0)
    const io = req.app.get('io') || global._socketIo || null;
    if (io) {
      io.to(req.user.id.toString()).emit('unread_count', { count: 0 });
    }

    return res.json({
      success: true,
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
