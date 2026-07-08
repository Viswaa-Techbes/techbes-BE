const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipientType: {
      type: String,
      enum: ['customer', 'technician', 'admin'],
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    customerId: {
      type: String,
      default: '',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

notificationSchema.pre('validate', async function(next) {
  const targetId = this.recipientId || this.userId;
  if (targetId && !this.customerId) {
    try {
      const User = mongoose.model('User');
      const u = await User.findById(targetId);
      if (u && u.customerId) {
        this.customerId = u.customerId;
      }
    } catch (err) {
      console.error('Error looking up customerId in Notification pre-validate:', err);
    }
  }
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);
