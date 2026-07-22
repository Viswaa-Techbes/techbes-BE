const mongoose = require('mongoose');

const cctvModelSchema = new mongoose.Schema(
  {
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'CctvBrand', required: true },
    cameraType: { type: String, required: true, trim: true }, // e.g. "IP Camera", "Analog Camera", etc.
    name: { type: String, required: true, trim: true }, // e.g. "Normal", "Hybrid", "Hybrid + Smart", "Fixed", "PT", "Single Lens", "Dual Lens", "Quad Lens"
    resolution: { type: String, required: true, trim: true }, // e.g. "2MP", "3MP", "4MP", "5MP"
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CctvModel || mongoose.model('CctvModel', cctvModelSchema);
