const mongoose = require('mongoose');

const admissionPaymentSchema = new mongoose.Schema(
  {
    admissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admission',
      required: true,
      index: true,
    },
    totalFees: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    pendingAmount: { type: Number, default: 0, min: 0 },
    emiStatus: { type: String, enum: ['active', 'inactive', 'completed'], default: 'inactive' },
    paymentStatus: { type: String, enum: ['paid', 'partially_paid', 'pending'], default: 'pending', index: true },
    transactionLogs: [
      {
        amount: { type: Number, min: 0 },
        mode: { type: String, trim: true },
        transactionId: { type: String, trim: true },
        status: { type: String, enum: ['success', 'failed', 'pending'], default: 'success' },
        note: { type: String, trim: true },
        paidAt: { type: Date, default: Date.now },
      },
    ],
    adminNotes: [{ note: { type: String, trim: true }, addedAt: { type: Date, default: Date.now } }],
  },
  { timestamps: true }
);

admissionPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdmissionPayment', admissionPaymentSchema, 'admissionPayments');
