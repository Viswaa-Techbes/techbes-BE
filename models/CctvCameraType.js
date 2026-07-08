const mongoose = require('mongoose');

const cctvCameraTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: '', trim: true },
    installationPrice: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

cctvCameraTypeSchema.index({ status: 1, sortOrder: 1 });

module.exports = mongoose.model('CctvCameraType', cctvCameraTypeSchema);
