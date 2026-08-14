const mongoose = require('mongoose');

const cctvPaymentSchema = new mongoose.Schema({
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  amount: Number,
  currency: { type: String, default: 'INR' },
  status: String,
  signatureVerified: { type: Boolean, default: false },
  webhookVerified: { type: Boolean, default: false },
  paidAt: Date
}, { timestamps: true });

module.exports = mongoose.models.CctvPayment || mongoose.model('CctvPayment', cctvPaymentSchema);
