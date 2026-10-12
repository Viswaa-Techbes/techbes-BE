const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  images: [{
    type: String, // Cloudinary URLs
  }],
}, { timestamps: true });

const supportTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
      index: true,
      sparse: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Apartment / Association fields
    apartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Apartment',
      default: null,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Apartment',
      default: null,
    },
    apartmentName: {
      type: String,
      default: '',
      trim: true,
    },
    raisedByType: {
      type: String,
      enum: ['association', 'resident', 'customer'],
      default: 'customer',
      index: true,
    },
    raisedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    raisedByName: {
      type: String,
      default: '',
      trim: true,
    },
    raisedByPhone: {
      type: String,
      default: '',
      trim: true,
    },
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    flatNumber: {
      type: String,
      default: '',
      trim: true,
    },
    flatId: {
      type: String,
      default: '',
      trim: true,
    },
    block: {
      type: String,
      default: '',
      trim: true,
    },
    floor: {
      type: String,
      default: '',
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    voiceNote: {
      url: { type: String, default: '' },
      duration: { type: Number, default: 0 },
      filename: { type: String, default: '' },
    },
    attachments: [
      {
        type: String,
      },
    ],
    category: {
      type: String,
      enum: [
        'Plumbing/Water',
        'Electrical',
        'Lift',
        'Security',
        'Cleaning',
        'Waste Management',
        'Internet',
        'Civil Maintenance',
        'Technical',
        'Payment',
        'Booking',
        'Complaint',
        'AMC',
        'CCTV',
        'Networking',
        'Other',
      ],
      default: 'Other',
    },
    status: {
      type: String,
      enum: [
        'New',
        'Open',
        'Acknowledged',
        'Assigned',
        'In Progress',
        'Resolved',
        'Closed',
        'Escalated',
        'Reopened',
      ],
      default: 'New',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Emergency', 'Urgent'],
      default: 'Medium',
    },
    // Staff assignment
    assignedStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedStaffName: {
      type: String,
      default: '',
      trim: true,
    },
    assignedStaffPhone: {
      type: String,
      default: '',
      trim: true,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    // Internal notes (visible only to admin & association committee)
    internalNotes: [
      {
        text: { type: String, required: true },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        addedByName: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // Resolution details
    resolutionNotes: {
      type: String,
      default: '',
      trim: true,
    },
    resolutionPhotos: [
      {
        type: String,
      },
    ],
    resolvedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    // Reopening record
    isReopened: {
      type: Boolean,
      default: false,
    },
    reopenReason: {
      type: String,
      default: '',
      trim: true,
    },
    reopenedAt: {
      type: Date,
      default: null,
    },
    reopenedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Status transition audit history
    statusHistory: [
      {
        status: { type: String, required: true },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changedByName: { type: String, default: '' },
        reason: { type: String, default: '' },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
    },
    messages: [messageSchema],
  },
  { timestamps: true }
);

supportTicketSchema.pre('validate', async function (next) {
  if (!this.ticketId) {
    try {
      const Counter = require('./Counter');
      const counter = await Counter.findOneAndUpdate(
        { id: 'support_ticket_id' },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      this.ticketId = `TKT-${String(counter.seq).padStart(5, '0')}`;
    } catch (err) {
      this.ticketId = `TKT-${Math.floor(Date.now() / 1000)}`;
    }
  }
  if (this.apartmentId && !this.companyId) {
    this.companyId = this.apartmentId;
  }
  next();
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);

