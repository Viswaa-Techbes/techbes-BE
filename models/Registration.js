const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  enrollmentId: { type: String, index: true, unique: true, sparse: true },
  masterclassId: { type: mongoose.Schema.Types.ObjectId, ref: 'Masterclass', required: true, index: true },
  name: String,
  mobile: String,
  email: String,
  whatsapp: String,
  location: String,
  qualification: String,
  paymentStatus: { type: String, enum: ['PENDING','PAID','FAILED','REFUNDED'], default: 'PENDING' },
  registrationStatus: { type: String, enum: ['PENDING','REGISTERED','ATTENDED','ABSENT','CANCELLED'], default: 'PENDING' },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  amount: Number,
  paidAt: Date,
  attended: { type: Boolean, default: false },
  certificateStatus: { type: String, default: 'NOT_ELIGIBLE' },
  courseType: { type: String, default: 'CCTV_MASTERCLASS' }
}, { timestamps: true });

registrationSchema.index({ email: 1 });
registrationSchema.index({ mobile: 1 });

module.exports = mongoose.models.Registration || mongoose.model('Registration', registrationSchema);
