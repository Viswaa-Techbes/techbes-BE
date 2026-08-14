const mongoose = require('mongoose');

const masterclassSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  price: { type: Number, required: true, default: 499 },
  date: { type: Date, required: true },
  startTime: String,
  endTime: String,
  duration: String,
  maxSeats: Number,
  registrationOpen: { type: Boolean, default: true },
  certificateEnabled: { type: Boolean, default: true },
  status: { type: String, default: 'draft' }
}, { timestamps: true });

module.exports = mongoose.models.Masterclass || mongoose.model('Masterclass', masterclassSchema);
