const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  technician: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job', // Change from Booking to Job to match actual database model
  },
  serviceRating: {
    type: Number,
    min: 1,
    max: 5,
  },
  technicianRating: {
    type: Number,
    min: 1,
    max: 5,
  },
  overallRating: {
    type: Number,
    min: 1,
    max: 5,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 5,
  },
  technicianId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
  },
  clientName: {
    type: String,
    default: 'Customer',
  },
  comment: {
    type: String,
    maxLength: 1000,
  },
  images: [{
    type: String, // Cloudinary/storage URLs
  }],
  videos: [{
    type: String, // Video attachment URLs
  }],
}, { timestamps: true });

// Pre-validate hook to map properties
reviewSchema.pre('validate', function(next) {
  if (this.technicianId && !this.technician) {
    this.technician = this.technicianId;
  }
  if (this.technician && !this.technicianId) {
    this.technicianId = this.technician;
  }
  if (this.jobId && !this.booking) {
    this.booking = this.jobId;
  }
  if (this.booking && !this.jobId) {
    this.jobId = this.booking;
  }
  if (this.rating !== undefined) {
    if (this.overallRating === undefined) this.overallRating = this.rating;
    if (this.serviceRating === undefined) this.serviceRating = this.rating;
    if (this.technicianRating === undefined) this.technicianRating = this.rating;
  } else if (this.overallRating !== undefined) {
    this.rating = this.overallRating;
  }
  next();
});

// Ensure one review per booking (check either booking or jobId)
reviewSchema.index({ booking: 1, customer: 1 }, { unique: true, sparse: true });
reviewSchema.index({ jobId: 1, customer: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Review', reviewSchema);
