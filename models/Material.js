const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: String, default: '', trim: true },
    category: { type: String, default: 'General', trim: true }, // 'CCTV', 'Networking', 'General', etc.
    subcategory: { type: String, default: '', trim: true },
    modelNumber: { type: String, default: '', trim: true },
    sku: { type: String, default: '', trim: true, uppercase: true },
    variant: { type: String, default: '', trim: true }, // e.g. "2MP", "4MP", "8-Port Gigabit"
    specifications: { type: String, default: '', trim: true },
    unit: { type: String, default: 'each', trim: true },
    price: { type: Number, required: true, min: 0, default: 0 },
    basePrice: { type: Number, min: 0 },
    gstRate: { type: Number, default: 18, min: 0, max: 100 },
    isTaxInclusive: { type: Boolean, default: false },
    stock: { type: Number, default: 0, min: 0 },
    minStock: { type: Number, default: 0, min: 0 },
    image: { type: String, default: '' },
    description: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    variants: [
      {
        name: { type: String, trim: true },
        sku: { type: String, trim: true },
        price: { type: Number, min: 0 },
        stock: { type: Number, default: 0 },
        specifications: { type: String, default: '' },
      },
    ],
    sourceAddonId: { type: mongoose.Schema.Types.ObjectId, ref: 'CctvAddon', default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Keep basePrice and price in sync
materialSchema.pre('save', function (next) {
  if (this.basePrice === undefined || this.basePrice === null) {
    this.basePrice = this.price || 0;
  }
  if (this.price === undefined || this.price === null) {
    this.price = this.basePrice || 0;
  }
  next();
});

materialSchema.index({ status: 1, sortOrder: 1 });
materialSchema.index({ status: 1, category: 1 });
materialSchema.index({ name: 'text', brand: 'text', modelNumber: 'text', sku: 'text', variant: 'text', category: 'text' });

module.exports = mongoose.model('Material', materialSchema);
