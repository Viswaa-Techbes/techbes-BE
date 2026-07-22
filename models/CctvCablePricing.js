const mongoose = require('mongoose');

const cctvCablePricingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true }, // e.g. "CAT6 Cable", "3+1 CCTV Cable"
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CctvCablePricing || mongoose.model('CctvCablePricing', cctvCablePricingSchema);
