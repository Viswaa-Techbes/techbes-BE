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
        'Cancelled',
      ],
      default: 'New',
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
    followUpDate: {
      type: Date,
      default: null,
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
