const mongoose = require('mongoose');

const cctvAccessorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true }, // e.g. "DVR Installation", "NVR Installation", "Network Rack Mount", "Monitor Mount"
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CctvAccessory || mongoose.model('CctvAccessory', cctvAccessorySchema);
