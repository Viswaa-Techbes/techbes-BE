const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    mobileNumber: {
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
    addresses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Address',
      },
    ],
    bookingHistory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
      },
    ],
    cancellationHistory: [
      {
        jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
        reason: String,
        cancelledAt: Date,
        cancelledBy: String,
      },
    ],
    paymentHistory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment',
      },
    ],
    feedbackHistory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Review',
      },
    ],
  },
  { timestamps: true }
);

customerSchema.pre('validate', async function(next) {
  if (!this.customerId) {
    try {
      const Counter = require('./Counter');
      const year = new Date().getFullYear();
      const counterId = `customer_id_${year}`;
      
      const counter = await Counter.findOneAndUpdate(
        { id: counterId },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      
      const sequenceStr = String(counter.seq).padStart(6, '0');
      this.customerId = `CUS-${year}-${sequenceStr}`;
    } catch (err) {
      console.error('Failed to generate sequential customerId, falling back', err);
      const timestamp = Math.floor(Date.now() / 1000);
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      this.customerId = `CUST-${timestamp}-${randomSuffix}`;
    }
  }
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
