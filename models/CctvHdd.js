const mongoose = require('mongoose');

const cctvHddSchema = new mongoose.Schema(
  {
    capacity: { type: String, required: true, unique: true, trim: true }, // e.g. "500GB", "1TB", etc.
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CctvHdd || mongoose.model('CctvHdd', cctvHddSchema);
