const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    profilePhoto: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserProfile', userProfileSchema);
