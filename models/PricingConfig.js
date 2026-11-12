const mongoose = require('mongoose');

const CHARGE_TYPES = [
  'labour',
  'installation',
  'service',
  'accessory',
  'miscellaneous',
  'material_rate',
  'category_default',
  'gst_config',
];

const PRICING_UNITS = [
  'per_piece',
  'per_camera',
  'per_meter',
  'per_point',
  'per_visit',
  'per_hour',
  'per_unit',
  'flat',
  'percentage',
];

const pricingConfigSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true, sparse: true, unique: true },
    serviceCategory: { type: String, required: true, trim: true, index: true },
    subcategory: { type: String, trim: true, default: '' },

    chargeType: {
      type: String,
      enum: CHARGE_TYPES,
      required: true,
      default: 'service',
      index: true,
    },
    pricingUnit: {
      type: String,
      enum: PRICING_UNITS,
      default: 'flat',
    },
    unitLabel: { type: String, trim: true, default: 'Unit' },

    rate: { type: Number, required: true, min: 0 },
    costRate: { type: Number, min: 0, default: 0 },
    minCharge: { type: Number, min: 0, default: 0 },

    gstRate: { type: Number, min: 0, max: 100, default: 18 },
    isTaxInclusive: { type: Boolean, default: false },
    hsnSacCode: { type: String, trim: true, default: '' },

    allowQuoteOverride: { type: Boolean, default: true },
    maxDiscountPercent: { type: Number, min: 0, max: 100, default: 25 },

    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material',
      default: null,
    },
    description: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    sortOrder: { type: Number, default: 0 },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, trim: true, default: '' },
    lastPriceUpdatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

pricingConfigSchema.index({ serviceCategory: 1, chargeType: 1, status: 1 });

module.exports =
  mongoose.models.PricingConfig || mongoose.model('PricingConfig', pricingConfigSchema);
module.exports.CHARGE_TYPES = CHARGE_TYPES;
module.exports.PRICING_UNITS = PRICING_UNITS;
