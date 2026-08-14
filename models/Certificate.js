const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  certificateId: { type: String, unique: true },
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' },
  masterclassId: { type: mongoose.Schema.Types.ObjectId, ref: 'Masterclass' },
  participantName: String,
  programName: String,
  issueDate: Date,
  pdfPath: String,
  verificationUrl: String
}, { timestamps: true });

module.exports = mongoose.models.Certificate || mongoose.model('Certificate', certificateSchema);
