const mongoose = require('mongoose');

const cctvInstallationChargeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true }, // e.g. "Camera Installation Charge"
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CctvInstallationCharge || mongoose.model('CctvInstallationCharge', cctvInstallationChargeSchema);
