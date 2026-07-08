const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, default: '', trim: true },
    mobile: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    landmark: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    pincode: { type: String, default: '', trim: true },
    googleMapLink: { type: String, default: '', trim: true },
    isDefault: { type: Boolean, default: false },
    // Compatibility fields
    label: { type: String, default: 'Address', trim: true },
    addressLine1: { type: String, default: '', trim: true },
    addressLine2: { type: String, default: '', trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    formattedAddress: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

addressSchema.pre('validate', function(next) {
  if (this.address && !this.addressLine1) {
    this.addressLine1 = this.address;
  } else if (this.addressLine1 && !this.address) {
    this.address = this.addressLine1;
  }
  if (this.name && (!this.label || this.label === 'Address')) {
    this.label = this.name;
  }
  
  this.formattedAddress = [
    this.address || this.addressLine1,
    this.addressLine2,
    this.landmark,
    this.city,
    this.state,
    this.pincode
  ].filter(Boolean).join(', ');
  
  next();
});

module.exports = mongoose.model('Address', addressSchema);
