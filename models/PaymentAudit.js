const mongoose = require('mongoose');

const paymentAuditSchema = new mongoose.Schema({
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: false },
  orderId: { type: String, required: false },
  event: { type: String, required: true },
  payload: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: false });

module.exports = mongoose.model('PaymentAudit', paymentAuditSchema);
