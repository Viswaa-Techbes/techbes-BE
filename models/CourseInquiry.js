const mongoose = require('mongoose');

const courseInquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
    },
    course_interest: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: ['new', 'responded', 'closed'],
      default: 'new',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

courseInquirySchema.virtual('id').get(function getId() {
  return this._id.toString();
});

courseInquirySchema.virtual('created_at').get(function getCreatedAt() {
  return this.createdAt;
});

module.exports = mongoose.model('CourseInquiry', courseInquirySchema);
