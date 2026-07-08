const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  ipAddress: { type: String },
  location: { type: String },
  device: { type: String },
  browser: { type: String },
  visitedPages: [{
    path: String,
    timestamp: { type: Date, default: Date.now }
  }],
  isReturning: { type: Boolean, default: false },
  enquirySubmitted: { type: Boolean, default: false },
  name: { type: String },
  phone: { type: String },
  email: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Visitor', visitorSchema);
