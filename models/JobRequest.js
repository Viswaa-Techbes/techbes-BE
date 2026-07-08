const mongoose = require('mongoose');

/**
 * JobRequest — tracks individual dispatch requests sent to technicians in fallback mode.
 * When auto-assignment fails, we broadcast to multiple technicians.
 * First one to accept wins. Others get expired.
 */
const jobRequestSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    },
    technicianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'expired'],
      default: 'pending',
      index: true,
    },
    // Distance from technician to customer (in km) at time of dispatch
    distanceKm: {
      type: Number,
      default: 0,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 60 * 1000), // 60 second window
    },
    rejectionReason: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Compound index to prevent duplicate requests to same tech for same job
jobRequestSchema.index({ jobId: 1, technicianId: 1 }, { unique: true });
jobRequestSchema.index({ jobId: 1, status: 1 });
jobRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL for cleanup

module.exports = mongoose.model('JobRequest', jobRequestSchema);
