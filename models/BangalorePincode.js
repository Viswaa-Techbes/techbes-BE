const mongoose = require('mongoose');

const bangalorePincodeSchema = new mongoose.Schema(
  {
    pincode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    areaName: {
      type: String,
      required: true,
      trim: true,
    },
    district: {
      type: String,
      default: 'Bangalore Urban',
      trim: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    zone: {
      type: String,
      enum: ['North', 'South', 'East', 'West', 'Central'],
      default: 'Central',
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

bangalorePincodeSchema.index({ latitude: 1, longitude: 1 });
bangalorePincodeSchema.index({ active: 1 });

module.exports = mongoose.model('BangalorePincode', bangalorePincodeSchema);
