const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Job = require('../models/Job');
const Review = require('../models/Review');
const Expense = require('../models/Expense');
const Lead = require('../models/Lead');
const OtpVerification = require('../models/OtpVerification');
const { signToken } = require('../utils/jwt');
const { markAttendance } = require('./v2/attendanceControllerV2');
const { recordAudit } = require('../services/auditService');
const { validatePasswordStrength } = require('../utils/passwordPolicy');
const { sendOtpEmail } = require('../services/emailService');

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.ip || '';
}

/**
 * POST /admin/login — Admin authentication with MFA requirement and brute-force lockout protection.
 */
async function adminLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail, isDeleted: { $ne: true } }).select('+password');

    if (!user || user.role !== 'admin') {
      await recordAudit({
        actorEmail: normalizedEmail,
        actorRole: 'unknown',
        action: 'admin_login_failed',
        ip,
        userAgent,
        status: 'failure',
        details: { reason: 'User not found or not admin' },
      });
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Check account lockout
    if (user.lockUntil && user.lockUntil > new Date()) {
      const waitMinutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / (1000 * 60));
      await recordAudit({
        actorId: user._id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'admin_login_locked',
        ip,
        userAgent,
        status: 'warning',
        details: { waitMinutes },
      });
      return res.status(429).json({
        success: false,
        message: `Account is temporarily locked due to repeated failed attempts. Please try again in ${waitMinutes} minute(s).`,
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minute temporary lockout
      }
      await user.save({ validateBeforeSave: false });

      await recordAudit({
        actorId: user._id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'admin_login_failed',
        ip,
        userAgent,
        status: 'failure',
        details: { attempts: user.failedLoginAttempts, locked: Boolean(user.lockUntil) },
      });

      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Check if MFA is required for this admin (default is enabled)
    const isMfaRequired = user.mfaEnabled !== false;

    if (isMfaRequired) {
      const otp = generateOtp();
      const otpHash = await bcrypt.hash(otp, 12);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Store in OtpVerification
      await OtpVerification.findOneAndUpdate(
        { email: normalizedEmail, purpose: 'admin_mfa' },
        {
          otpHash,
          otp: process.env.NODE_ENV === 'production' ? undefined : otp,
          expiresAt,
          verifiedAt: null,
          attempts: 0,
          resendCount: 0,
          lastSentAt: new Date(),
          used: false,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Send OTP via Email
      let emailSent = false;
      try {
        await sendOtpEmail(normalizedEmail, otp);
        emailSent = true;
      } catch (mailErr) {
        console.error('[Admin MFA] Failed to dispatch OTP email:', mailErr.message);
      }

      const tempToken = jwt.sign(
        { sub: user._id.toString(), type: 'admin_mfa', email: normalizedEmail },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '10m' }
      );

      await recordAudit({
        actorId: user._id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'admin_mfa_challenge_issued',
        ip,
        userAgent,
        status: 'success',
      });

      const isDev = process.env.NODE_ENV !== 'production' || process.env.OTP_DEBUG === 'true';

      return res.json({
        success: true,
        mfaRequired: true,
        tempToken,
        email: normalizedEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
        message: 'A 6-digit verification code has been sent to your registered admin email address.',
        ...(isDev && !emailSent ? { devOtp: otp } : {}),
      });
    }

    // If MFA disabled (fallback)
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.sessionActive = true;
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save({ validateBeforeSave: false });

    await markAttendance(user._id);

    const token = signToken(user._id, user.role);

    await recordAudit({
      actorId: user._id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin_login_success',
      ip,
      userAgent,
      status: 'success',
    });

    return res.json({
      success: true,
      data: {
        token,
        user: user.toSafeObject(),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/mfa-verify — Complete admin authentication after validating OTP.
 */
async function verifyAdminMfa(req, res, next) {
  try {
    const { tempToken, otp, email } = req.body;
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    if (!otp || (!tempToken && !email)) {
      return res.status(400).json({ success: false, message: 'Verification code and session token are required' });
    }

    let userId = null;
    let userEmail = email ? email.toLowerCase().trim() : null;

    if (tempToken) {
      try {
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET || 'secret');
        if (decoded.type !== 'admin_mfa') {
          return res.status(401).json({ success: false, message: 'Invalid MFA session token' });
        }
        userId = decoded.sub;
        if (!userEmail) userEmail = decoded.email;
      } catch {
        return res.status(401).json({ success: false, message: 'MFA session expired. Please sign in again.' });
      }
    }

    const user = userId
      ? await User.findById(userId).select('+password')
      : await User.findOne({ email: userEmail, role: 'admin', isDeleted: { $ne: true } }).select('+password');

    if (!user || user.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Invalid admin account' });
    }

    const otpRecord = await OtpVerification.findOne({ email: user.email, purpose: 'admin_mfa' }).select('+otpHash');
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'Verification code expired. Please request a new code.' });
    }

    if (otpRecord.expiresAt <= new Date() || otpRecord.used) {
      return res.status(400).json({ success: false, message: 'Verification code expired or already used. Please request a new one.' });
    }

    if (otpRecord.attempts >= 5) {
      return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new verification code.' });
    }

    const isValidOtp = await bcrypt.compare(String(otp).trim(), otpRecord.otpHash);
    if (!isValidOtp) {
      otpRecord.attempts = (otpRecord.attempts || 0) + 1;
      await otpRecord.save();

      await recordAudit({
        actorId: user._id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'admin_mfa_verification_failed',
        ip,
        userAgent,
        status: 'failure',
        details: { attempts: otpRecord.attempts },
      });

      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    // OTP Verified Successfully
    otpRecord.verifiedAt = new Date();
    otpRecord.used = true;
    await otpRecord.save();

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.sessionActive = true;
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save({ validateBeforeSave: false });

    await markAttendance(user._id);

    const token = signToken(user._id, user.role);

    await recordAudit({
      actorId: user._id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin_login_success_mfa',
      ip,
      userAgent,
      status: 'success',
    });

    return res.json({
      success: true,
      message: 'MFA verification successful',
      token,
      data: {
        token,
        user: user.toSafeObject(),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/mfa-resend — Resend Admin MFA OTP with cooldown restriction.
 */
async function resendAdminMfa(req, res, next) {
  try {
    const { tempToken, email } = req.body;
    let targetEmail = email ? email.toLowerCase().trim() : null;

    if (tempToken) {
      try {
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET || 'secret');
        if (decoded.email) targetEmail = decoded.email;
      } catch {
        return res.status(401).json({ success: false, message: 'MFA session expired. Please sign in again.' });
      }
    }

    if (!targetEmail) {
      return res.status(400).json({ success: false, message: 'Valid email or session token required' });
    }

    const existingOtp = await OtpVerification.findOne({ email: targetEmail, purpose: 'admin_mfa' });
    if (existingOtp?.lastSentAt && Date.now() - existingOtp.lastSentAt.getTime() < 60_000) {
      const waitSeconds = Math.ceil((60_000 - (Date.now() - existingOtp.lastSentAt.getTime())) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSeconds} seconds before requesting another code.`,
      });
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 12);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await OtpVerification.findOneAndUpdate(
      { email: targetEmail, purpose: 'admin_mfa' },
      {
        otpHash,
        otp: process.env.NODE_ENV === 'production' ? undefined : otp,
        expiresAt,
        verifiedAt: null,
        attempts: 0,
        resendCount: (existingOtp?.resendCount || 0) + 1,
        lastSentAt: new Date(),
        used: false,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    let emailSent = false;
    try {
      await sendOtpEmail(targetEmail, otp);
      emailSent = true;
    } catch (mailErr) {
      console.error('[Admin MFA Resend] Email error:', mailErr.message);
    }

    const isDev = process.env.NODE_ENV !== 'production' || process.env.OTP_DEBUG === 'true';

    return res.json({
      success: true,
      message: 'New verification code sent successfully to your admin email address.',
      ...(isDev && !emailSent ? { devOtp: otp } : {}),
    });
  } catch (err) {
    next(err);
  }
}

async function dashboard(req, res, next) {
  try {
    const [userCounts, jobCounts, recentJobs, liveTechnicians, pendingRequests, paymentRequests, reviews, leadsCount, pendingExpenses] = await Promise.all([
      User.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      Job.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Job.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .populate('assignedTechnician', 'name email status isOnline specialty')
        .lean(),
      User.find({ role: 'technician', isOnline: true, isDeleted: false })
        .sort({ updatedAt: -1 })
        .limit(8)
        .lean(),
      Job.find({ status: 'pending_approval' })
        .sort({ updatedAt: -1 })
        .limit(8)
        .populate('assignedTechnician', 'name email status isOnline specialty')
        .lean(),
      Job.find({ paymentStatus: 'verification_pending' })
        .sort({ updatedAt: -1 })
        .limit(8)
        .populate('assignedTechnician', 'name email status isOnline specialty')
        .lean(),
      Review.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('technicianId', 'name email specialty')
        .lean(),
      Lead.countDocuments({ isDeleted: false }),
      Expense.countDocuments({ status: 'pending' }),
    ]);

    const usersByRole = userCounts.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const jobsByStatus = jobCounts.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const totalRevenue = recentJobs
      .filter((job) => job.status === 'completed' || job.status === 'payment_done')
      .reduce((sum, job) => sum + (Number(job.price) || 0), 0);

    return res.json({
      success: true,
      data: {
        usersByRole,
        jobsByStatus,
        totalUsers: Object.values(usersByRole).reduce((a, b) => a + b, 0),
        totalJobs: Object.values(jobsByStatus).reduce((a, b) => a + b, 0),
        leadsCount,
        pendingExpenses,
        summary: {
          totalLeads: leadsCount,
          totalJobs: Object.values(jobsByStatus).reduce((a, b) => a + b, 0),
          pendingJobs: (jobsByStatus.assigned || 0) + (jobsByStatus.started || 0),
          inProgress: (jobsByStatus.started || 0) + (jobsByStatus.work_uploaded || 0),
          completedJobs: (jobsByStatus.completed || 0) + (jobsByStatus.payment_done || 0),
          activeTechnicians: liveTechnicians.length,
          totalTechnicians: usersByRole.technician || 0,
          totalManagers: usersByRole.manager || 0,
          totalRevenue,
          pendingRequests: (jobsByStatus.completion_requested || 0) + (jobsByStatus.pending_approval || 0),
          paymentApprovals: paymentRequests.length,
        },
        recentJobs: recentJobs.map(formatJob),
        liveTechnicians: liveTechnicians.map(formatTechnician),
        pendingRequests: pendingRequests.map(formatJob),
        paymentRequests: paymentRequests.map(formatJob),
        recentReviews: reviews.map(formatReview),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await User.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
    const safe = users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
    return res.json({ success: true, data: safe });
  } catch (err) {
    next(err);
  }
}

async function listTechnicians(req, res, next) {
  try {
    const technicians = await User.find({ role: 'technician', isDeleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
    return res.json({
      success: true,
      data: technicians.map(formatTechnician),
    });
  } catch (err) {
    next(err);
  }
}

async function listJobs(req, res, next) {
  try {
    const jobs = await Job.find()
      .sort({ createdAt: -1 })
      .populate('assignedTechnician', 'name email status isOnline specialty')
      .populate('assignedManager', 'name email role')
      .lean();

    return res.json({ success: true, data: jobs.map(formatJob) });
  } catch (err) {
    next(err);
  }
}

async function createJob(req, res, next) {
  try {
    const { title, description, location, technicianId, customerName, customerPhone, scheduledTime, price, amount, paymentDescription, orderId } = req.body;

    if (!title || !location) {
      return res.status(400).json({
        success: false,
        message: 'title and location are required',
      });
    }

    const job = await Job.create({
      title,
      description,
      customerName,
      customerPhone,
      location,
      scheduledTime,
      price: amount || price,
      amount: amount || price || 0,
      paymentDescription: paymentDescription || description || title,
      orderId: orderId || '',
      assignedTechnician: technicianId || null,
      assignedManager: req.user.id,
      status: technicianId ? 'assigned' : 'pending',
    });

    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'create_job',
      entityType: 'job',
      entityId: job._id.toString(),
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      details: { title, technicianId, price: amount || price },
    });

    const hydratedJob = await Job.findById(job._id)
      .populate('assignedTechnician', 'name email status isOnline specialty')
      .lean();

    return res.status(201).json({ success: true, data: formatJob(hydratedJob) });
  } catch (err) {
    next(err);
  }
}

async function listCompletionRequests(req, res, next) {
  try {
    const jobs = await Job.find({ status: { $in: ['completion_requested', 'pending_approval'] } })
      .sort({ updatedAt: -1 })
      .populate('assignedTechnician', 'name email status isOnline specialty')
      .populate('assignedManager', 'name email role')
      .lean();

    return res.json({ success: true, data: jobs.map(formatJob) });
  } catch (err) {
    next(err);
  }
}

async function updateCompletionRequest(req, res, next) {
  try {
    const { taskId } = req.params;
    const { action } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    }

    const job = await Job.findById(taskId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (job.status !== 'completion_requested' && job.status !== 'pending_approval') {
      return res.status(400).json({ success: false, message: 'Job is not awaiting admin approval' });
    }

    job.status = action === 'approve' ? 'approved_by_manager' : 'assigned';
    await job.save();

    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'update_completion_request',
      entityType: 'job',
      entityId: job._id.toString(),
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      details: { action, newStatus: job.status },
    });

    // Notify Real-time
    const io = req.app.get('io');
    if (io) {
      io.emit('job_updated', { jobId: job._id, status: job.status });
      if (job.assignedTechnician) {
        io.to(job.assignedTechnician.toString()).emit('job_status_change', {
          jobId: job._id,
          status: job.status,
          message: action === 'approve' ? 'Your completion request was approved!' : 'Completion request rejected.'
        });
      }
    }

    const updated = await Job.findById(job._id)
      .populate('assignedTechnician', 'name email status isOnline specialty')
      .populate('assignedManager', 'name email role')
      .lean();

    return res.json({
      success: true,
      message: action === 'approve' ? 'Completion approved' : 'Completion rejected',
      data: formatJob(updated),
    });
  } catch (err) {
    next(err);
  }
}

async function listPaymentRequests(req, res, next) {
  try {
    const jobs = await Job.find({ paymentStatus: 'verification_pending' })
      .sort({ updatedAt: -1 })
      .populate('assignedTechnician', 'name email status isOnline specialty')
      .populate('assignedManager', 'name email role')
      .lean();

    return res.json({ success: true, data: jobs.map(formatJob) });
  } catch (err) {
    next(err);
  }
}

async function updatePaymentRequest(req, res, next) {
  try {
    const { jobId } = req.params;
    const { action } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (job.paymentStatus !== 'verification_pending') {
      return res.status(400).json({ success: false, message: 'Payment is not awaiting admin confirmation' });
    }

    job.paymentStatus = action === 'approve' ? 'paid' : 'rejected';
    if (action === 'approve') {
      job.status = 'completed';
    }
    await job.save();

    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'update_payment_request',
      entityType: 'job',
      entityId: job._id.toString(),
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      details: { action, paymentStatus: job.paymentStatus, status: job.status },
    });

    const updated = await Job.findById(job._id)
      .populate('assignedTechnician', 'name email status isOnline specialty')
      .populate('assignedManager', 'name email role')
      .lean();

    return res.json({
      success: true,
      message: action === 'approve' ? 'Payment approved' : 'Payment rejected',
      data: formatJob(updated),
    });
  } catch (err) {
    next(err);
  }
}

async function createManager(req, res, next) {
  try {
    const { name, email, password, phone, mobileNumber } = req.body;
    const mobile = mobileNumber || phone;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, email, and password are required',
      });
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message,
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      mobileNumber: mobile ? String(mobile).trim() : `999${Math.floor(1000000 + Math.random() * 9000000)}`,
      password,
      role: 'manager',
      phone: mobile,
    });

    await recordAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      action: 'create_manager',
      entityType: 'user',
      entityId: user._id.toString(),
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      details: { email: user.email, name: user.name },
    });

    return res.status(201).json({
      success: true,
      message: 'Manager created',
      data: user.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
}

async function createTechnician(req, res, next) {
  try {
    const { name, email, password, phone, mobileNumber, specialty, assignedManager } = req.body;
    const mobile = mobileNumber || phone;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, email, and password are required',
      });
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message,
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      mobileNumber: mobile ? String(mobile).trim() : `999${Math.floor(1000000 + Math.random() * 9000000)}`,
      password,
      role: 'technician',
      phone: mobile,
      specialty,
      assignedManager: assignedManager || null,
    });

    await recordAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      action: 'create_technician',
      entityType: 'user',
      entityId: user._id.toString(),
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      details: { email: user.email, name: user.name, specialty },
    });

    return res.status(201).json({
      success: true,
      message: 'Technician created',
      data: user.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
}

async function listReviews(req, res, next) {
  try {
    const reviews = await Review.find()
      .sort({ createdAt: -1 })
      .populate('technicianId', 'name email specialty')
      .populate('jobId', 'title customerName')
      .lean();

    return res.json({ success: true, data: reviews.map(formatReview) });
  } catch (err) {
    next(err);
  }
}

async function getTracking(req, res, next) {
  try {
    const technicians = await User.find({ role: 'technician', isDeleted: false })
      .select('name email specialty status isOnline lat lng updatedAt')
      .lean();

    return res.json({
      success: true,
      data: technicians.map((t) => ({
        ...formatTechnician(t),
        lat: t.lat || 0,
        lng: t.lng || 0,
        lastUpdate: t.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  adminLogin,
  verifyAdminMfa,
  resendAdminMfa,
  dashboard,
  listUsers,
  listTechnicians,
  listJobs,
  createJob,
  listCompletionRequests,
  updateCompletionRequest,
  listPaymentRequests,
  updatePaymentRequest,
  createManager,
  createTechnician,
  listReviews,
  getTracking,
};

function formatJob(job) {
  return {
    id: job._id.toString(),
    title: job.title,
    description: job.description,
    customerName: job.customerName,
    customerPhone: job.customerPhone,
    location: job.location,
    scheduledTime: job.scheduledTime,
    price: job.price,
    amount: job.amount ?? job.price ?? 0,
    paymentStatus: job.paymentStatus || 'pending',
    orderId: job.orderId || '',
    paymentId: job.paymentId || '',
    paymentDescription: job.paymentDescription || '',
    status: formatStatus(job.status),
    rawStatus: job.status,
    technicianName: job.assignedTechnician?.name || '',
    technician: job.assignedTechnician
      ? {
          id: job.assignedTechnician._id.toString(),
          name: job.assignedTechnician.name,
          email: job.assignedTechnician.email,
          status: job.assignedTechnician.status,
          specialty: job.assignedTechnician.specialty,
          isOnline: job.assignedTechnician.isOnline,
        }
      : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    attachments: job.attachments || [],
  };
}

function formatTechnician(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    status: normalizeTechnicianStatus(user),
    rawStatus: user.status,
    isOnline: Boolean(user.isOnline),
    phone: user.phone || '',
    specialty: user.specialty || '',
    lat: user.lat || 0,
    lng: user.lng || 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function formatReview(review) {
  return {
    id: review._id.toString(),
    rating: review.rating,
    comment: review.comment,
    clientName: review.clientName,
    technicianName: review.technicianId?.name || 'Unknown Technician',
    technicianEmail: review.technicianId?.email || '',
    technicianSpecialty: review.technicianId?.specialty || '',
    title: review.jobId?.title || '',
    customerName: review.jobId?.customerName || '',
    createdAt: review.createdAt || review.timestamp,
  };
}

function formatStatus(status) {
  const statusMap = {
    assigned: 'Assigned',
    started: 'Started',
    work_uploaded: 'Work Uploaded',
    completion_requested: 'Approval Pending',
    approved_by_manager: 'Approved (Pending Payment)',
    payment_pending: 'Payment Pending',
    payment_done: 'Paid',
    completed: 'Completed',
  };

  return statusMap[status] || status;
}

function normalizeTechnicianStatus(user) {
  if (user.isOnline && user.sessionActive) {
    return 'Available';
  }

  return 'Offline';
}
