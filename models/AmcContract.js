const mongoose = require('mongoose');

const amcContractSchema = new mongoose.Schema(
  {
    contractId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    customerPhone: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    amcPlan: {
      type: String, // 'Silver', 'Gold', 'Diamond'
      required: true,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    totalVisits: {
      type: Number,
      required: true,
    },
    completedVisits: {
      type: Number,
      default: 0,
    },
    remainingVisits: {
      type: Number,
      required: true,
    },
    assignedEngineer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Suspended', 'Cancelled', 'Expired'],
      default: 'Active',
      index: true,
    },
    visits: [
      {
        visitDate: { type: Date, required: true },
        status: {
          type: String,
          enum: ['Scheduled', 'Completed', 'Skipped', 'Cancelled', 'Missed'],
          default: 'Scheduled',
        },
        remarks: {
          type: String,
          default: '',
        },
        completionDetails: {
          completedAt: { type: Date },
          notes: { type: String, default: '' },
          images: [{ type: String }],
          partsUsed: [{ type: String }],
          recommendations: { type: String, default: '' },
          customerSignature: { type: String, default: '' },
          technicianSignature: { type: String, default: '' },
        },
      },
    ],
  },
  { timestamps: true }
);

amcContractSchema.pre('validate', async function(next) {
  if (!this.contractId) {
    const timestamp = Math.floor(Date.now() / 1000);
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.contractId = `TB-AMC-${timestamp}-${rand}`;
  }
  next();
});

module.exports = mongoose.model('AmcContract', amcContractSchema);
