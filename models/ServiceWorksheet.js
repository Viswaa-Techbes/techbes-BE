const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Item Name
  category: { type: String, default: '' },
  quantity: { type: Number, default: 1, min: 1 },
  unit: { type: String, default: 'Piece' }, // Meter, Piece, Box, etc.
  unitPrice: { type: Number, default: 0, min: 0 },
  total: { type: Number, default: 0, min: 0 },
  
  // Legacy fields for backward compatibility
  brand: { type: String, default: '' },
  model: { type: String, default: '' },
  serialNumber: { type: String, default: '' },
  unitCost: { type: Number, default: 0, min: 0 },
  totalCost: { type: Number, default: 0, min: 0 }
});

const serviceWorksheetSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true
    },
    bookingId: {
      type: String,
      required: true
    },
    customerId: {
      type: String,
      required: true
    },
    technicianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    worksheetNumber: {
      type: String,
      unique: true,
      sparse: true
    },
    customerName: { type: String, default: '' },
    customerMobile: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    serviceType: { type: String, default: '' },
    serviceCategory: { type: String, default: '' },
    jobCreatedDate: { type: Date, default: Date.now },
    arrivalTime: { type: Date },
    workStartTime: { type: Date },
    workEndTime: { type: Date },
    requestedWorkDescription: { type: String, default: '' },
    technicianObservations: { type: String, default: '' },
    additionalComments: { type: String, default: '' },
    materialsUsed: {
      type: [materialSchema],
      default: []
    },
    partsInstalled: {
      type: [String],
      default: []
    },
    beforePhotos: {
      type: [String],
      default: []
    },
    duringPhotos: {
      type: [String],
      default: []
    },
    afterPhotos: {
      type: [String],
      default: []
    },
    customerSignatureUrl: { type: String, default: '' },
    technicianSignatureUrl: { type: String, default: '' },
    completionOtpVerified: { type: Boolean, default: false },
    labourCost: { type: Number, default: 0 },
    materialCost: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'in_progress', 'submitted', 'approved'],
      default: 'draft',
      index: true
    },
    pdfUrl: { type: String, default: '' },
    submittedAt: { type: Date },
    approvedAt: { type: Date }
  },
  { timestamps: true }
);

// Pre-save validation hook to auto-generate sequential worksheet number
serviceWorksheetSchema.pre('validate', async function (next) {
  if (!this.worksheetNumber) {
    try {
      const Counter = require('./Counter');
      const counter = await Counter.findOneAndUpdate(
        { id: 'worksheet_number' },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      this.worksheetNumber = `WS-${String(counter.seq).padStart(6, '0')}`;
    } catch (err) {
      console.error('Error generating sequential worksheetNumber, falling back:', err);
      const ts = Math.floor(Date.now() / 1000);
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      this.worksheetNumber = `WS-${ts}-${rand}`;
    }
  }
  next();
});

module.exports = mongoose.model('ServiceWorksheet', serviceWorksheetSchema);
