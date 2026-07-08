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

const supportTicketSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ['Technical', 'Payment', 'Booking', 'Complaint', 'AMC', 'Other'],
    default: 'Other',
  },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved', 'Closed', 'Escalated'],
    default: 'Open',
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium',
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking', // Link to a specific booking if applicable
  },
  messages: [messageSchema],
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
