const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendPushNotification } = require('../utils/notification');
const channelService = require('./channelNotificationService');

/**
 * Create and persist a notification, then dispatch via all configured channels.
 *
 * @param {string} userId - Recipient user ID
 * @param {string} title - Notification title
 * @param {string} message - Notification body text
 * @param {string} type - Notification type (maps to omnichannel templates)
 * @param {object|null} io - Socket.io instance for real-time push
 * @param {object} [extraData] - Additional data passed to omnichannel templates
 * @param {string[]} [channels] - Override channels ['push','email','sms','whatsapp']
 */
async function createNotification(userId, title, message, type = 'general', io = null, extraData = {}, channels = null) {
  try {
    const user = await User.findById(userId).select('role').lean();
    let recipientType = 'customer';
    if (user) {
      if (user.role === 'admin' || user.role === 'manager') {
        recipientType = 'admin';
      } else if (user.role === 'technician') {
        recipientType = 'technician';
      }
    }

    const bookingId = extraData?.jobId || extraData?.bookingId || null;

    // Deduplication check: check if an identical notification was created within the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existingNotification = await Notification.findOne({
      userId,
      title,
      message,
      createdAt: { $gte: fiveMinutesAgo }
    }).lean();

    if (existingNotification) {
      console.log(`[NotificationService] Deduplicated notification for user ${userId}: "${title}"`);
      return existingNotification;
    }

    // Persist to DB
    const notification = await Notification.create({
      userId,
      recipientId: userId,
      recipientType,
      bookingId,
      title,
      message,
      type,
    });

    // Real-time socket delivery
    if (io) {
      Notification.countDocuments({ userId, isRead: false }).then(unreadCount => {
        io.to(userId.toString()).emit('notification', {
          id: notification._id,
          title,
          message,
          type,
          createdAt: notification.createdAt,
          unreadCount,
        });
        io.to(userId.toString()).emit('unread_count', { count: unreadCount });
      }).catch(err => {
        console.error('Error counting unread notifications for socket:', err.message);
      });
      io.to(userId.toString()).emit('refresh_data', { type });
    }

    // Omnichannel dispatch (non-blocking)
    setImmediate(async () => {
      try {
        const user = await User.findById(userId).select('name email phone mobileNumber role').lean();
        if (user) {
          await channelService.dispatch({
            type,
            data: { ...extraData, customerName: user.name },
            recipient: {
              userId: userId.toString(),
              name: user.name,
              email: user.email,
              phone: user.phone || user.mobileNumber,
              role: user.role,
            },
            channels,
          });
        }
      } catch (dispatchErr) {
        console.error('[NotificationService] Omnichannel dispatch failed:', dispatchErr.message);
      }
    });

    return notification;
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

module.exports = {
  createNotification,
};
