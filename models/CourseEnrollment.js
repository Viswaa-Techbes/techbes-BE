const mongoose = require('mongoose');

const courseEnrollmentSchema = new mongoose.Schema(
  {
    course_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Course is required'],
    },
    student_name: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true,
    },
    student_email: {
      type: String,
      required: [true, 'Student email is required'],
      lowercase: true,
      trim: true,
    },
    student_phone: {
      type: String,
      required: [true, 'Student phone is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
    },
    payment_status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    enrollment_date: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

courseEnrollmentSchema.virtual('id').get(function getId() {
  return this._id.toString();
});

module.exports = mongoose.model('CourseEnrollment', courseEnrollmentSchema);
