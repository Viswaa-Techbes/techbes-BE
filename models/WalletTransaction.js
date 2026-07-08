const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  wallet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true,
  },
  category: {
    type: String,
    enum: ['topup', 'refund', 'cashback', 'referral', 'payment', 'adjustment'],
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'referenceModel', // Optional polymorphic reference (e.g., to a Booking or Payment)
  },
  referenceModel: {
    type: String,
    enum: ['Booking', 'Payment', 'Order'],
  },
}, { timestamps: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
