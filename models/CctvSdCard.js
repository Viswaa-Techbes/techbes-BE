const mongoose = require('mongoose');

const cctvSdCardSchema = new mongoose.Schema(
  {
    capacity: { type: String, required: true, unique: true, trim: true }, // e.g. "32GB", "64GB", "128GB", "256GB"
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CctvSdCard || mongoose.model('CctvSdCard', cctvSdCardSchema);
