const mongoose = require('mongoose');

const cctvBrandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CctvBrand || mongoose.model('CctvBrand', cctvBrandSchema);
