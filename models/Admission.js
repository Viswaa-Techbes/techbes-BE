const mongoose = require('mongoose');

const admissionSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    qualification: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    selectedPlan: { type: String, required: true, trim: true },

    // Optional extension fields (safe and backward compatible)
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
    aadhaarNumber: { type: String, trim: true },
    city: { type: String, trim: true, index: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },

    fatherName: { type: String, trim: true },
    motherName: { type: String, trim: true },
    parentMobile: { type: String, trim: true },
    emergencyContact: { type: String, trim: true },

    fatherProfession: { type: String, trim: true },
    motherProfession: { type: String, trim: true },

    financialStability: { type: String, enum: ['low', 'medium', 'high', 'unknown'], default: 'unknown' },
    monthlyFamilyIncome: { type: Number, min: 0 },
    emiSupportRequired: { type: Boolean, default: false },

    sslcPercentage: { type: Number, min: 0, max: 100 },
    hscPercentage: { type: Number, min: 0, max: 100 },
    diplomaOrDegree: { type: String, trim: true },
    collegeName: { type: String, trim: true },
    yearOfPassing: { type: Number, min: 1900, max: 2100 },
    currentSkillLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },

    programType: {
      type: String,
      enum: ['course', 'internship', 'placement_program'],
      default: 'course',
      index: true,
    },
    assignedCourse: { type: String, trim: true },
    assignedInternship: { type: String, trim: true },

    admissionStatus: {
      type: String,
      enum: ['applied', 'under_review', 'approved', 'payment_pending', 'enrolled', 'rejected'],
      default: 'applied',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['paid', 'partially_paid', 'pending'],
      default: 'pending',
      index: true,
    },

    internalNotes: [
      {
        note: { type: String, trim: true },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

admissionSchema.index({ createdAt: -1 });
admissionSchema.index({ fullName: 'text', email: 'text', phone: 'text', qualification: 'text' });
admissionSchema.index({ assignedCourse: 1 });
admissionSchema.index({ assignedInternship: 1 });
admissionSchema.index({ city: 1, createdAt: -1 });

module.exports = mongoose.model('Admission', admissionSchema, 'admissions');
