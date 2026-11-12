const mongoose = require('mongoose');

const ITEM_TYPES = ['product', 'material', 'service', 'labour', 'accessory', 'misc'];

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
    purchasePrice: { type: Number, min: 0, default: 0 },
    itemType: { type: String, enum: ITEM_TYPES, default: 'product' },
    gstRate: { type: Number, default: 18, min: 0, max: 100 },
    isTaxInclusive: { type: Boolean, default: false },
    hsnSacCode: { type: String, default: '', trim: true },
    stock: { type: Number, default: 0, min: 0 },
    minStock: { type: Number, default: 0, min: 0 },
    compatibleCategories: { type: [String], default: [] },
    compatibleSkus: { type: [String], default: [] },
    supplier: { type: String, default: '', trim: true },
    warrantyMonths: { type: Number, min: 0, default: 0 },
    image: { type: String, default: '' },
    description: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastPriceUpdatedAt: { type: Date, default: null },
    lastPriceUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastStockUpdatedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    variants: [
      {
        name: { type: String, trim: true },
        sku: { type: String, trim: true },
        purchasePrice: { type: Number, min: 0, default: 0 },
        price: { type: Number, min: 0 },
        stock: { type: Number, default: 0, min: 0 },
        specifications: { type: String, default: '' },
      },
    ],
    sourceAddonId: { type: mongoose.Schema.Types.ObjectId, ref: 'CctvAddon', default: null },
    sortOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

materialSchema.virtual('sellingPrice').get(function () {
  if (this.basePrice !== undefined && this.basePrice !== null) {
    return this.basePrice;
  }
  return this.price || 0;
});

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
materialSchema.index({ status: 1, isArchived: 1, stock: 1 });
materialSchema.index({ name: 'text', brand: 'text', modelNumber: 'text', sku: 'text', variant: 'text', category: 'text' });

module.exports = mongoose.models.Material || mongoose.model('Material', materialSchema);
module.exports.ITEM_TYPES = ITEM_TYPES;
