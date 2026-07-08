const mongoose = require('mongoose');

const technicianLocationSchema = new mongoose.Schema(
  {
    technicianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    lat: {
      type: Number,
      required: true,
    },
    lng: {
      type: Number,
      required: true,
    },
    heading: Number,
    isMoving: Boolean,
  },
  { timestamps: true }
);

module.exports = mongoose.model('TechnicianLocation', technicianLocationSchema);
