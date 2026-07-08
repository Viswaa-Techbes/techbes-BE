const mongoose = require('mongoose');

const serviceMaterialSchema = new mongoose.Schema(
  {
    subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceSubcategory', required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    price: { type: Number, required: true, default: 0 },
    unit: { type: String, default: 'each' },
    image: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    isLabour: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

serviceMaterialSchema.index({ subcategoryId: 1, status: 1 });

module.exports = mongoose.model('ServiceMaterial', serviceMaterialSchema);
