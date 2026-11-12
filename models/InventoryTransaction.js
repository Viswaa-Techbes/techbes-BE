const mongoose = require('mongoose');

const TRANSACTION_TYPES = [
  'initial_stock',
  'addition',
  'adjustment',
  'reduction',
  'quote_allocation',
  'job_allocation',
  'allocation_release',
  'return',
  'correction',
];

const REFERENCE_TYPES = ['manual', 'quotation', 'job', 'purchase_order', 'system'];

const inventoryTransactionSchema = new mongoose.Schema(
  {
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material',
      required: true,
      index: true,
    },
    itemName: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, default: '', index: true },
    serviceCategory: { type: String, trim: true, default: '' },
    unit: { type: String, trim: true, default: 'Piece' },

    previousQuantity: { type: Number, required: true, min: 0 },
    updatedQuantity: { type: Number, required: true, min: 0 },
    quantityChange: { type: Number, required: true },

    transactionType: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    referenceType: {
      type: String,
      enum: [...REFERENCE_TYPES, null],
      default: 'manual',
    },
    referenceId: { type: String, trim: true, default: '' },
    referenceObjectId: { type: mongoose.Schema.Types.ObjectId, default: null },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    performedByName: { type: String, trim: true, default: 'Admin' },
    performedByEmail: { type: String, trim: true, default: '' },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
  }
);

inventoryTransactionSchema.index({ createdAt: -1 });
inventoryTransactionSchema.index({ materialId: 1, createdAt: -1 });

module.exports =
  mongoose.models.InventoryTransaction ||
  mongoose.model('InventoryTransaction', inventoryTransactionSchema);
module.exports.TRANSACTION_TYPES = TRANSACTION_TYPES;
module.exports.REFERENCE_TYPES = REFERENCE_TYPES;
