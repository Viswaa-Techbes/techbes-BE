const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['admin', 'manager', 'technician', 'client'];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: '',
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required'],
      unique: true,
      trim: true,
      match: [/^\d{10,15}$/, 'Please use a valid mobile number'],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: undefined,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ROLES,
      required: true,
      default: 'technician',
    },
    phone: String,
    isOnline: {
      type: Boolean,
      default: false,
    },
    sessionActive: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['available', 'busy', 'offline'],
      default: 'offline',
    },
    // ─── Dispatch Status (replaces isOnline for technicians) ──────────────────
    availabilityStatus: {
      type: String,
      enum: ['ONLINE', 'OFFLINE', 'BUSY'],
      default: 'OFFLINE',
    },
    // ─── Technician Profile Fields ────────────────────────────────────────────
    kycStatus: {
      type: String,
      enum: ['Pending', 'Submitted', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    kycDetails: {
      aadhaarNumber: { type: String, default: '' },
      aadhaarImageFront: { type: String, default: '' },
      aadhaarImageBack: { type: String, default: '' },
      panNumber: { type: String, default: '' },
      panImage: { type: String, default: '' },
      bankDetails: {
        accountName: { type: String, default: '' },
        accountNumber: { type: String, default: '' },
        ifscCode: { type: String, default: '' },
        bankName: { type: String, default: '' },
      },
      signatureImage: { type: String, default: '' },
    },
    kycDocuments: {
      aadhaarFront: {
        url: { type: String, default: '' },
        publicId: { type: String, default: '' },
        type: { type: String, default: '' },
        uploadedAt: { type: Date }
      },
      aadhaarBack: {
        url: { type: String, default: '' },
        publicId: { type: String, default: '' },
        type: { type: String, default: '' },
        uploadedAt: { type: Date }
      },
      panCard: {
        url: { type: String, default: '' },
        publicId: { type: String, default: '' },
        type: { type: String, default: '' },
        uploadedAt: { type: Date }
      },
      signature: {
        url: { type: String, default: '' },
        publicId: { type: String, default: '' },
        type: { type: String, default: '' },
        uploadedAt: { type: Date }
      },
      bankProof: {
        url: { type: String, default: '' },
        publicId: { type: String, default: '' },
        type: { type: String, default: '' },
        uploadedAt: { type: Date }
      },
      selfie: {
        url: { type: String, default: '' },
        publicId: { type: String, default: '' },
        type: { type: String, default: '' },
        uploadedAt: { type: Date }
      }
    },
    kycRejectionReason: {
      type: String,
      default: '',
    },
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
    },
    employeeCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    customerId: {
      type: String,
      unique: true,
      sparse: true,
    },
    address: {
      type: String,
      default: '',
    },
    pincode: {
      type: String,
      default: '',
    },
    skills: {
      type: [String],
      default: [],
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    employeeStatus: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    profilePhoto: {
      type: String,
      default: '',
    },
    specialty: String,
    serviceCategories: {
      type: [String],
      default: [],
    },
    pincodeCoverage: {
      type: [String],
      default: [],
    },
    rating: {
      type: Number,
      default: 5.0,
      min: 0,
      max: 5,
    },
    completedJobs: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    penaltyPoints: {
      type: Number,
      default: 0,
    },
    performanceScore: {
      type: Number,
      default: 100,
    },
    activeJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      default: null,
    },
    penalties: {
      type: [{
        amount: { type: Number, default: 0 },
        reason: { type: String, default: '' },
        penaltyDate: { type: Date, default: Date.now },
        jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
        status: { type: String, enum: ['pending', 'paid', 'waived'], default: 'pending' },
      }],
      default: [],
    },
    // ─── Location (updated by app in real-time) ───────────────────────────────
    locationUpdatedAt: {
      type: Date,
      default: null,
    },
    // ─── Legacy / Auth Fields ─────────────────────────────────────────────────
    permissions: {
      type: [String],
      default: []
    },
    assignedManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lat: {
      type: Number,
      default: 0.0,
    },
    lng: {
      type: Number,
      default: 0.0,
    },
    fcmToken: {
      type: String,
      default: null,
    },
    resetToken: {
      type: String,
      select: false,
    },
    resetTokenExpiry: {
      type: Date,
      select: false,
    },
    appId: {
      type: String,
      default: 'technician-v1',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    userType: {
      type: String,
      enum: ['member', 'web_user'],
      default: 'member',
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });

function syncStatusesHelper(obj) {
  if (obj.availabilityStatus) {
    if (obj.availabilityStatus === 'ONLINE') {
      obj.isOnline = true;
      obj.status = 'available';
    } else if (obj.availabilityStatus === 'OFFLINE') {
      obj.isOnline = false;
      obj.status = 'offline';
    } else if (obj.availabilityStatus === 'BUSY') {
      obj.isOnline = true;
      obj.status = 'busy';
    }
  } else if (obj.status) {
    if (obj.status === 'available') {
      obj.isOnline = true;
      obj.availabilityStatus = 'ONLINE';
    } else if (obj.status === 'offline') {
      obj.isOnline = false;
      obj.availabilityStatus = 'OFFLINE';
    } else if (obj.status === 'busy') {
      obj.isOnline = true;
      obj.availabilityStatus = 'BUSY';
    }
  } else if (obj.isOnline !== undefined) {
    if (obj.isOnline) {
      obj.status = 'available';
      obj.availabilityStatus = 'ONLINE';
    } else {
      obj.status = 'offline';
      obj.availabilityStatus = 'OFFLINE';
    }
  }
}

userSchema.pre('validate', async function normalizeBlankEmail(next) {
  if (typeof this.email === 'string' && this.email.trim() === '') {
    this.email = undefined;
  }

  syncStatusesHelper(this);

  // Auto-generate employeeId / employeeCode for employees
  if (['technician', 'manager', 'admin'].includes(this.role)) {
    if (!this.employeeId) {
      const ts = Math.floor(Date.now() / 1000);
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      this.employeeId = `EMP-${ts}-${rand}`;
    }
    if (!this.employeeCode) {
      const randNum = Math.floor(1000 + Math.random() * 9000);
      this.employeeCode = `TECH-${randNum}`;
    }
  }

  // Auto-generate customerId for client role (CUS-YYYY-NNNNNN)
  if (this.role === 'client') {
    if (!this.customerId) {
      try {
        const Counter = require('./Counter');
        const year = new Date().getFullYear();
        const counterId = `customer_id_${year}`;
        
        const counter = await Counter.findOneAndUpdate(
          { id: counterId },
          { $inc: { seq: 1 } },
          { upsert: true, new: true }
        );
        
        const sequenceStr = String(counter.seq).padStart(6, '0');
        this.customerId = `CUS-${year}-${sequenceStr}`;
      } catch (err) {
        console.error('Failed to generate sequential customerId, falling back', err);
        const ts = Math.floor(Date.now() / 1000);
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.customerId = `CUST-${ts}-${rand}`;
      }
    }
  }

  next();
});

userSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update) {
    syncStatusesHelper(update);
    if (update.$set) {
      syncStatusesHelper(update.$set);
    }
  }
  next();
});

userSchema.pre('updateOne', function(next) {
  const update = this.getUpdate();
  if (update) {
    syncStatusesHelper(update);
    if (update.$set) {
      syncStatusesHelper(update.$set);
    }
  }
  next();
});

// Post save hook to sync Customer record
userSchema.post('save', async function(doc) {
  if (doc.role === 'client') {
    try {
      const Customer = mongoose.model('Customer');
      await Customer.findOneAndUpdate(
        { userId: doc._id },
        {
          customerId: doc.customerId,
          name: doc.name,
          mobileNumber: doc.mobileNumber,
          email: doc.email,
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error('Error syncing Customer record:', err);
    }
  }
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    userId: this._id.toString(),
    name: this.name,
    mobileNumber: this.mobileNumber,
    email: this.email,
    role: this.role,
    phone: this.phone,
    isOnline: this.isOnline,
    status: this.status,
    availabilityStatus: this.availabilityStatus,
    specialty: this.specialty,
    assignedManager: this.assignedManager,
    employeeId: this.employeeId,
    employeeCode: this.employeeCode,
    customerId: this.customerId,
    address: this.address,
    pincode: this.pincode,
    skills: this.skills,
    joiningDate: this.joiningDate,
    employeeStatus: this.employeeStatus,
    rating: this.rating,
    completedJobs: this.completedJobs,
    totalEarnings: this.totalEarnings,
    performanceScore: this.performanceScore,
    penaltyPoints: this.penaltyPoints,
    penalties: this.penalties,
    kycStatus: this.kycStatus,
    kycDetails: this.kycDetails,
    kycDocuments: this.kycDocuments,
    kycRejectionReason: this.kycRejectionReason,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
