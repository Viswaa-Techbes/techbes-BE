const authService = require('../services/authService');
const { markAttendance, markLogout } = require('./v2/attendanceControllerV2');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const OtpVerification = require('../models/OtpVerification');
const { sendOtpEmail } = require('../services/emailService');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

async function login(req, res, next) {
  try {
    const identifier = req.body.email || req.body.mobileNumber;
    const { password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'email/mobileNumber and password are required' });
    }

    const { token, user } = await authService.loginUser(identifier, password);
    
    // Auto-mark attendance on login
    await markAttendance(user._id || user.id);

    return res.json({
      success: true,
      token,
      user,
      data: { token, user },
    });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
}

async function register(req, res, next) {
  try {
    const email = req.body.email ? normalizeEmail(req.body.email) : undefined;

    const { token, user } = await authService.registerUser({ ...req.body, email, userType: 'web_user', role: req.body.role || 'client' });
    if (email) {
      await OtpVerification.deleteMany({ email, purpose: 'register' });
    }

    return res.status(201).json({
      success: true,
      message: 'User registered',
      token,
      user,
      data: { token, user },
    });
  } catch (err) {
    const duplicateField = err?.keyPattern ? Object.keys(err.keyPattern)[0] : null;
    const isDuplicate =
      err?.code === 11000 || err.message?.toLowerCase().includes('already registered');
    const statusCode = isDuplicate ? 409 : 400;
    const message = isDuplicate
      ? duplicateField === 'mobileNumber'
        ? 'Mobile number already registered'
        : duplicateField === 'email'
          ? 'Email already registered'
          : err.message
      : err.message;

    res.status(statusCode).json({ success: false, message });
  }
}

async function sendOtp(req, res) {
  try {
    const email = normalizeEmail(req.body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const existingOtp = await OtpVerification.findOne({ email, purpose: 'register' });
    if (existingOtp?.lastSentAt && Date.now() - existingOtp.lastSentAt.getTime() < 60_000) {
      return res.status(429).json({ success: false, message: 'Please wait before requesting another OTP' });
    }

    if ((existingOtp?.resendCount || 0) >= 5 && existingOtp.expiresAt > new Date()) {
      return res.status(429).json({ success: false, message: 'OTP resend limit reached. Try again after 5 minutes.' });
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 12);
    const expiresAt = new Date(Date.now() + 5 * 60_000);

    await OtpVerification.findOneAndUpdate(
      { email, purpose: 'register' },
      {
        otpHash,
        expiresAt,
        verifiedAt: null,
        attempts: 0,
        resendCount: existingOtp ? (existingOtp.resendCount || 0) + 1 : 0,
        lastSentAt: new Date(),
        verificationTokenHash: undefined,
        verificationTokenExpiresAt: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await sendOtpEmail(email, otp);

    return res.json({ success: true, message: 'OTP sent successfully', expiresInSeconds: 300 });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Unable to send OTP' });
  }
}

async function verifyOtp(req, res) {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();

    if (!email || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'Valid email and 6-digit OTP are required' });
    }

    const record = await OtpVerification.findOne({ email, purpose: 'register' }).select('+otpHash');
    if (!record || record.expiresAt <= new Date()) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new code.' });
    }

    if (record.attempts >= 5) {
      return res.status(429).json({ success: false, message: 'Too many incorrect OTP attempts. Request a new code.' });
    }

    const ok = await bcrypt.compare(otp, record.otpHash);
    if (!ok) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    record.verifiedAt = new Date();
    record.verificationTokenHash = hashValue(verificationToken);
    record.verificationTokenExpiresAt = new Date(Date.now() + 10 * 60_000);
    await record.save();

    return res.json({
      success: true,
      message: 'Email verified successfully',
      data: { emailVerificationToken: verificationToken },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Unable to verify OTP' });
  }
}

async function me(req, res) {
  if (req.authUser && req.authUser.role === 'technician') {
    await req.authUser.populate({
      path: 'penalties.jobId',
      select: 'bookingNumber customerName customerPhone title serviceName status'
    });
  }
  return res.json({
    success: true,
    data: req.authUser.toSafeObject(),
  });
}

async function updateFcmToken(req, res, next) {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ success: false, message: 'fcmToken is required' });
    }

    req.authUser.fcmToken = fcmToken;
    await req.authUser.save();

    return res.json({
      success: true,
      message: 'FCM token updated successfully',
    });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await markLogout(req.user.id);
    await authService.logoutUser(req.user.id);
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, register, sendOtp, verifyOtp, me, updateFcmToken, logout };
