const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  enrollmentId: { type: String, index: true, unique: true, sparse: true },
  registrationId: { type: String, index: true, sparse: true },
  masterclassId: { type: mongoose.Schema.Types.ObjectId, ref: 'Masterclass', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, index: true },
  courseName: { type: String, default: 'TechBes CCTV Installation & Networking Masterclass', index: true },
  name: { type: String, required: true, trim: true },
  mobile: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  whatsapp: { type: String, trim: true },
  location: { type: String, trim: true },
  qualification: { type: String, trim: true },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'],
    default: 'PENDING',
    index: true,
  },
  registrationStatus: {
    type: String,
    enum: ['PENDING', 'REGISTERED', 'ATTENDED', 'ABSENT', 'CANCELLED'],
    default: 'PENDING',
    index: true,
  },
  razorpayOrderId: { type: String, index: true, sparse: true },
  razorpayPaymentId: { type: String, index: true, sparse: true },
  razorpaySignature: { type: String },
  amount: { type: Number, default: 499 },
  currency: { type: String, default: 'INR' },
  paidAt: { type: Date },
  attended: { type: Boolean, default: false },
  certificateStatus: { type: String, default: 'NOT_ELIGIBLE' },
  courseType: { type: String, default: 'CCTV_MASTERCLASS', index: true },

  // Zoom Link Tracking
  zoomLinkSent: { type: Boolean, default: false, index: true },
  zoomLinkSentAt: { type: Date },
  zoomLinkEmailStatus: {
    type: String,
    enum: ['NOT_SENT', 'SENT', 'FAILED'],
    default: 'NOT_SENT',
    index: true,
  },
  zoomLinkEmailError: { type: String, default: '' },
  zoomMeetingLink: { type: String, default: '' },
  zoomClassTitle: { type: String, default: '' },
  zoomClassDate: { type: String, default: '' },
  zoomClassTime: { type: String, default: '' },
  lastZoomSentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

registrationSchema.index({ email: 1 });
registrationSchema.index({ mobile: 1 });
registrationSchema.index({ createdAt: -1 });
registrationSchema.index({ masterclassId: 1, paymentStatus: 1 });

module.exports = mongoose.models.Registration || mongoose.model('Registration', registrationSchema);
