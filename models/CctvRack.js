const mongoose = require('mongoose');

const cctvRackSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, unique: true, trim: true }, // e.g. "Mini 2U", "2U", etc.
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CctvRack || mongoose.model('CctvRack', cctvRackSchema);
