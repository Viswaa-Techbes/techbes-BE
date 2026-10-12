const mongoose = require('mongoose');

const residentSchema = new mongoose.Schema(
  {
    residentId: {
      type: String,
      trim: true,
      default: '',
    },
    flatNumber: {
      type: String,
      required: [true, 'Flat number is required'],
      trim: true,
    },
    block: {
      type: String,
      trim: true,
      default: '',
    },
    floor: {
      type: String,
      trim: true,
      default: '',
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
    residentType: {
      type: String,
      enum: ['owner', 'tenant'],
      default: 'owner',
    },
    status: {
      type: String,
      enum: ['active', 'vacated', 'inactive'],
      default: 'active',
    },
    moveInDate: {
      type: Date,
      default: null,
    },
    emergencyContact: {
      name: { type: String, default: '', trim: true },
      phone: { type: String, default: '', trim: true },
      relation: { type: String, default: '', trim: true },
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    accountStatus: {
      type: String,
      enum: ['unregistered', 'invited', 'active', 'suspended'],
      default: 'unregistered',
    },
    activationCode: {
      type: String,
      default: '',
    },
    activationExpires: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const blockSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  floors: {
    type: Number,
    default: 1,
  },
  flatsCount: {
    type: Number,
    default: 0,
  },
});

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
    state: {
      type: String,
      default: 'Karnataka',
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
    blocks: [blockSchema],
    totalFlats: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
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
