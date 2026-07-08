const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  serviceSlug: { type: String, required: true },
  serviceName: { type: String, required: true },
  categoryId: { type: String },
  subcategoryId: { type: String },
  input: { type: mongoose.Schema.Types.Mixed },
  price: { type: mongoose.Schema.Types.Mixed },
  notes: { type: String, default: '' }
});

const cartSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    items: [cartItemSchema],
    totalAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cart', cartSchema);
