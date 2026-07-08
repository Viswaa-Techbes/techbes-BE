const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  technician: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
  },
  serviceRating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
  },
  technicianRating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
  },
  overallRating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
  },
  comment: {
    type: String,
    maxLength: 1000,
  },
  images: [{
    type: String, // Cloudinary URLs
  }],
}, { timestamps: true });

// Ensure one review per booking
reviewSchema.index({ booking: 1, customer: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
