const mongoose = require('mongoose');

const quoteRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      unique: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },
    whatsapp: {
      type: String,
      trim: true,
      default: '',
    },
    serviceCategory: {
      type: String,
      required: [true, 'Service Category is required'],
      default: 'CCTV',
    },
    companyName: {
      type: String,
      trim: true,
      default: '',
    },
    googleMapsUrl: {
      type: String,
      trim: true,
      default: '',
    },
    source: {
      type: String,
      default: 'Website Quote Request',
    },
    locality: {
      type: String,
      required: [true, 'Bangalore Area/Locality is required'],
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      required: [true, 'Full address is required'],
      trim: true,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    propertyType: {
      type: String,
      default: '',
    },
    requirementType: {
      type: String,
      default: '',
    },
    cameraCount: {
      type: String,
      default: '',
    },
    cameraRequirement: {
      type: String,
      default: '',
    },
    features: {
      type: [String],
      default: [],
    },
    recorder: {
      type: String,
      default: '',
    },
    storage: {
      type: String,
      default: '',
    },
    additionalRequirements: {
      type: String,
      default: '',
    },
    preferredContact: {
      type: String,
      default: '',
    },
    subcategory: {
      type: String,
      default: '',
      trim: true,
    },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', default: null },
        brand: { type: String, default: '', trim: true },
        sku: { type: String, default: '', trim: true },
        variant: { type: String, default: '', trim: true },
        productName: { type: String, required: true, trim: true },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, default: null },
        gstRate: { type: Number, default: 18 },
        gstAmount: { type: Number, default: 0 },
        lineTotal: { type: Number, default: null },
      },
    ],
    voiceNote: {
      url: { type: String, default: '' },
      duration: { type: Number, default: 0 },
      filename: { type: String, default: '' },
      mimeType: { type: String, default: '' },
    },
    images: {
      type: [String],
      default: [],
    },
    subtotal: {
      type: Number,
      default: 0,
    },
    gstRate: {
      type: Number,
      default: 18,
    },
    gstAmount: {
      type: Number,
      default: 0,
    },
    finalAmount: {
      type: Number,
      default: 0,
    },
    pricingBreakdown: {
      labourCharge: { type: Number, default: 0 },
      serviceCharge: { type: Number, default: 0 },
      accessoriesCharge: { type: Number, default: 0 },
      miscCharge: { type: Number, default: 0 },
    },
    advancePercentage: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    advanceAmount: {
      type: Number,
      default: 0,
    },
    advancePaidAmount: {
      type: Number,
      default: 0,
    },
    balanceAmount: {
      type: Number,
      default: 0,
    },
    balancePaidAmount: {
      type: Number,
      default: 0,
    },
    quotePaymentStatus: {
      type: String,
      enum: ['unpaid', 'advance_pending', 'advance_paid', 'balance_due', 'balance_pending', 'fully_paid'],
      default: 'unpaid',
    },
    validityDays: {
      type: Number,
      default: 15,
    },
    validUntil: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    paymentDetails: {
      razorpayOrderId: { type: String, default: '' },
      razorpayPaymentId: { type: String, default: '' },
      razorpaySignature: { type: String, default: '' },
      paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
      amountPaid: { type: Number, default: 0 },
    },
    advancePaymentDetails: {
      razorpayOrderId: { type: String, default: '' },
      razorpayPaymentId: { type: String, default: '' },
      razorpaySignature: { type: String, default: '' },
      paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
      amountPaid: { type: Number, default: 0 },
      paidAt: { type: Date, default: null },
    },
    balancePaymentDetails: {
      razorpayOrderId: { type: String, default: '' },
      razorpayPaymentId: { type: String, default: '' },
      razorpaySignature: { type: String, default: '' },
      paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
      amountPaid: { type: Number, default: 0 },
      paidAt: { type: Date, default: null },
    },
    quoteVersions: [
      {
        version: { type: Number, default: 1 },
        savedAt: { type: Date, default: Date.now },
        savedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        items: { type: Array, default: [] },
        pricingBreakdown: { type: Object, default: {} },
        subtotal: Number,
        gstRate: Number,
        gstAmount: Number,
        finalAmount: Number,
        advancePercentage: Number,
        advanceAmount: Number,
        balanceAmount: Number,
        terms: String,
        adminNotes: String,
        status: String,
      },
    ],
    orderNumber: {
      type: String,
      default: '',
      sparse: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      default: null,
    },
    preferredVisitDate: {
      type: Date,
      default: null,
    },
    preferredVisitTime: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: [
        'quotation_requested',
        'quotation_draft',
        'quotation_sent',
        'quotation_accepted',
        'advance_paid',
        'payment_pending',
        'balance_pending',
        'paid',
        'converted_to_order',
        'cancelled',
        'expired',
        'New',
        'Contacted',
        'Requirement Verified',
        'Site Survey Scheduled',
        'Quote Prepared',
        'Quote Sent',
        'Quotation Sent',
        'Accepted',
        'Converted to Booking',
        'Converted',
        'Closed',
        'Rejected',
      ],
      default: 'quotation_requested',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    adminNotes: {
      type: String,
      default: '',
    },
    terms: {
      type: String,
      default: '',
    },
    followUpDate: {
      type: Date,
      default: null,
    },
    pdfUrl: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

quoteRequestSchema.pre('validate', async function (next) {
  if (!this.requestId) {
    try {
      const Counter = require('./Counter');
      const year = new Date().getFullYear();
      const counterId = `quote_request_id_${year}`;

      const counter = await Counter.findOneAndUpdate(
        { id: counterId },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );

      const sequenceStr = String(counter.seq).padStart(5, '0');
      this.requestId = `QT-${year}-${sequenceStr}`;
    } catch (err) {
      console.error('Failed to generate sequential requestId, falling back', err);
      const timestamp = Math.floor(Date.now() / 1000);
      this.requestId = `QT-${new Date().getFullYear()}-${timestamp}`;
    }
  }
  next();
});

module.exports = mongoose.model('QuoteRequest', quoteRequestSchema);
