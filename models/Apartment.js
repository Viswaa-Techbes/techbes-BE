const mongoose = require('mongoose');

const residentSchema = new mongoose.Schema(
  {
    flatNumber: {
      type: String,
      required: [true, 'Flat number is required'],
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Resident name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Resident phone number is required'],
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  { timestamps: true }
);

const apartmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Apartment/Company name is required'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Apartment address is required'],
      trim: true,
    },
    locality: {
      type: String,
      trim: true,
      default: '',
    },
    city: {
      type: String,
      default: 'Bangalore',
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
      default: '',
    },
    contactPerson: {
      type: String,
      trim: true,
      default: '',
    },
    contactPhone: {
      type: String,
      trim: true,
      default: '',
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    // Up to 3 standard association login users
    associationUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    residents: [residentSchema],
  },
  { timestamps: true }
);

apartmentSchema.index({ name: 1 });
apartmentSchema.index({ status: 1 });

module.exports = mongoose.model('Apartment', apartmentSchema);
