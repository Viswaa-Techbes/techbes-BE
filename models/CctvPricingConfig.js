const mongoose = require('mongoose');

const adjustableAmountSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['none', 'flat', 'percentage'], default: 'none' },
    value: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
  },
  { _id: false }
);

const cctvPricingConfigSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Default CCTV Pricing', trim: true },
    baseCharge: { type: Number, default: 0, min: 0 },
    indoorCharge: { type: Number, default: 0, min: 0 },
    outdoorCharge: { type: Number, default: 0, min: 0 },
    wirePricePerMeter: { type: Number, default: 0, min: 0 },
    discount: { type: adjustableAmountSchema, default: () => ({}) },
    coupon: {
      code: { type: String, default: '', trim: true, uppercase: true },
      type: { type: String, enum: ['none', 'flat', 'percentage'], default: 'none' },
      value: { type: Number, default: 0, min: 0 },
      status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
    },
    offer: {
      offerPrice: { type: Number, default: 0, min: 0 },
      status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
    },
    tax: {
      label: { type: String, default: 'GST', trim: true },
      percentage: { type: Number, default: 0, min: 0 },
      status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CctvPricingConfig', cctvPricingConfigSchema);
