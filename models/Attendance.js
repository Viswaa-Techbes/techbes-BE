const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: String, // Cached for easier reporting
    role: String, // Cached for easier reporting
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    loginTime: {
      type: Date,
      required: true,
    },
    logoutTime: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['present', 'absent'],
      default: 'present',
    },
    workingHours: {
      type: Number,
      default: 0, // in hours
    },
  },
  { timestamps: true }
);

// Ensure one record per user per day
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
