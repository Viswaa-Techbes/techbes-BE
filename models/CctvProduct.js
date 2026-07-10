const mongoose = require('mongoose');

const cctvProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    type: { type: String, trim: true, default: 'product' },
    price: { type: Number, required: true, min: 0 },
    variants: [
      {
        name: { type: String, required: true },
        price: { type: Number, required: true }
      }
    ],
    image: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

cctvProductSchema.index({ status: 1, sortOrder: 1 });

module.exports = mongoose.model('CctvProduct', cctvProductSchema);
