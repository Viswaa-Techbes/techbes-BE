const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const serviceSubcategorySchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' }, // Legacy alias for backward compatibility
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    shortDescription: { type: String, default: '', trim: true },
    overview: { type: String, default: '', trim: true },
    suitableFor: { type: [String], default: [] },
    includedServices: { type: [String], default: [] },
    excludedServices: { type: [String], default: [] },
    installationTime: { type: String, default: '', trim: true },
    warranty: { type: String, default: '', trim: true },
    faqs: { type: [faqSchema], default: [] },
    pricingStartsFrom: { type: Number, default: 0, min: 0 },
    image: { type: String, default: '', trim: true },
    
    // Configurable service types (e.g. New Network Setup, Network Expansion)
    serviceTypes: [
      {
        name: { type: String, required: true },
        price: { type: Number, required: true, default: 0 },
        description: { type: String, default: '' },
      }
    ],

    supportedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CctvProduct' }],
    supportedAddons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CctvAddon' }],
    supportedSpareParts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CctvProduct' }],
    
    formSchema: { type: mongoose.Schema.Types.Mixed, default: null },
    pricingRules: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

serviceSubcategorySchema.index({ serviceId: 1, status: 1, sortOrder: 1 });

module.exports = mongoose.model('ServiceSubcategory', serviceSubcategorySchema);
