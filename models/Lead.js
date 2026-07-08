const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    leadId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    company: { type: String, trim: true },
    address: { type: String, trim: true },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      mapLink: { type: String, default: '' },
    },
    source: { type: String, default: 'web' },
    requiredService: { type: String, trim: true },
    budget: { type: Number, default: 0 },
    priority: { type: String, enum: ['low','medium','high'], default: 'medium' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['New','Contacted','Qualified','Proposal Sent','Negotiation','Won','Lost','Project Created'], default: 'New' },
    lostReason: {
      type: String,
      required: [
        function() { return this.status === 'Lost'; },
        'Reason is required when lead is Lost'
      ]
    },
    customerId: { type: String, default: '' },
    remarks: { type: String, default: '' },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

leadSchema.pre('validate', function(next) {
  if (!this.leadId) {
    const timestamp = Math.floor(Date.now() / 1000);
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.leadId = `LD-${timestamp}-${randomSuffix}`;
  }
  next();
});

module.exports = mongoose.model('Lead', leadSchema);
