const mongoose = require('mongoose');

const admissionDocumentSchema = new mongoose.Schema(
  {
    admissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admission',
      required: true,
      index: true,
    },
    documentType: {
      type: String,
      enum: ['aadhaar', 'resume', 'certificate', 'passport_photo', 'other'],
      required: true,
      index: true,
    },
    fileUrl: { type: String, required: true, trim: true },
    originalName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number, min: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

admissionDocumentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdmissionDocument', admissionDocumentSchema, 'admissionDocuments');
