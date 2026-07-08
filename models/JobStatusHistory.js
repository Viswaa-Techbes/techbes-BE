const mongoose = require('mongoose');

const jobStatusHistorySchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
  },
  status: {
    type: String,
    required: true,
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  note: {
    type: String,
    default: '',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  }
});

// Indexing for faster history lookups
jobStatusHistorySchema.index({ jobId: 1, timestamp: -1 });

module.exports = mongoose.model('JobStatusHistory', jobStatusHistorySchema);
