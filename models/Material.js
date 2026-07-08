const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, default: "", trim: true, uppercase: true },
    category: { type: String, default: "General" },
    unit: { type: String, default: "each" },
    price: { type: Number, required: true, min: 0, default: 0 },
    stock: { type: Number, default: 0, min: 0 },
    minStock: { type: Number, default: 0, min: 0 },
    image: { type: String, default: "" },
    description: { type: String, default: "" },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    sourceAddonId: { type: mongoose.Schema.Types.ObjectId, ref: 'CctvAddon', default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

materialSchema.index({ status: 1, sortOrder: 1 });

module.exports = mongoose.model('Material', materialSchema);
