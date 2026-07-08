const admin = require('../config/firebase');
const User = require('../models/User');

/**
 * Send a push notification to a specific user
 * @param {string} userId - ID of the user to notify
 * @param {Object} payload - { title, body, data }
 */
async function sendPushNotification(userId, { title, body, data = {} }) {
  try {
    const user = await User.findById(userId).select('fcmToken');
    if (!user || !user.fcmToken) {
      console.log(`No FCM token found for user ${userId}, skipping push notification`);
      return;
    }

    const message = {
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      token: user.fcmToken,
    };

    const response = await admin.messaging().send(message);
    console.log(`Successfully sent push notification to ${userId}:`, response);
    return response;
  } catch (error) {
    console.error(`Error sending push notification to ${userId}:`, error);
  }
}

/**
 * Send notification to multiple users
 * @param {Array} userIds 
 * @param {Object} payload 
 */
async function sendMulticastNotification(userIds, payload) {
  return Promise.all(userIds.map(id => sendPushNotification(id, payload)));
}

module.exports = {
  sendPushNotification,
  sendMulticastNotification,
};
