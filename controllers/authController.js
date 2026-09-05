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

function maskEmail(email) {
  if (!email) return 'null';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0] || ''}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function maskMobile(mobile) {
  if (!mobile) return 'null';
  const clean = String(mobile).replace(/\D/g, "");
  if (clean.length <= 4) return '***';
  return `+91 *****${clean.slice(-4)}`;
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
    const emailInput = req.body.email;
    const mobileInput = req.body.mobileNumber;

    if (mobileInput) {
      const mobile = String(mobileInput).trim().replace(/\D/g, "");
      const normalizedMobile = mobile.length === 12 && mobile.startsWith("91") ? mobile.slice(2) : mobile;
      if (!/^[6-9]\d{9}$/.test(normalizedMobile)) {
        return res.status(400).json({ success: false, message: 'Valid 10-digit Indian mobile number is required' });
      }

      const existingOtp = await OtpVerification.findOne({ email: normalizedMobile, purpose: 'login' });
      if (existingOtp?.lastSentAt && Date.now() - existingOtp.lastSentAt.getTime() < 60_000) {
        return res.status(429).json({ success: false, message: 'Please wait 60 seconds before requesting another OTP' });
      }

      if ((existingOtp?.resendCount || 0) >= 5 && existingOtp.expiresAt > new Date()) {
        return res.status(429).json({ success: false, message: 'OTP limit reached. Try again after 5 minutes.' });
      }

      const otp = generateOtp();
      const otpHash = await bcrypt.hash(otp, 12);
      const expiresAt = new Date(Date.now() + 5 * 60_000);

      await OtpVerification.findOneAndUpdate(
        { email: normalizedMobile, purpose: 'login' },
        {
          otpHash,
          otp,
          expiresAt,
          verifiedAt: null,
          attempts: 0,
          resendCount: existingOtp ? (existingOtp.resendCount || 0) + 1 : 0,
          lastSentAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const { sendSMS } = require('../services/channelNotificationService');
      const smsRes = await sendSMS({
        to: normalizedMobile,
        body: `Your TechBes verification code is: ${otp}. Valid for 5 minutes.`
      });

      if (!smsRes.success) {
        return res.status(500).json({ success: false, message: 'Failed to send OTP to mobile. ' + (smsRes.reason || '') });
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[SMS OTP] Sent OTP ${otp} to +91 ${normalizedMobile}`);
      } else {
        console.log(`[SMS OTP] Sent OTP [MASKED] to +91 ${normalizedMobile}`);
      }

      const isProduction = process.env.NODE_ENV === 'production';
      const isDebugEnabled = process.env.OTP_DEBUG === 'true';

      return res.json({
        success: true,
        message: 'OTP sent successfully to +91 ' + normalizedMobile,
        expiresInSeconds: 60,
        ...((!isProduction || isDebugEnabled) && smsRes.fallback ? { otp } : {})
      });
    } else if (emailInput) {
      const email = normalizeEmail(emailInput);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Valid email is required' });
      }

      const purpose = req.body.purpose || 'login';

      if (purpose === 'register') {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(409).json({ success: false, message: 'Email already registered' });
        }
      }

      const existingOtp = await OtpVerification.findOne({ email, purpose });
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
        { email, purpose },
        {
          otpHash,
          otp,
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

      let emailServiceOffline = false;
      try {
        await sendOtpEmail(email, otp);
      } catch (mailErr) {
        console.error('[Email OTP] Failed to send email:', mailErr);
        emailServiceOffline = true;
      }

      if (emailServiceOffline && process.env.NODE_ENV === 'production' && process.env.OTP_DEBUG !== 'true') {
        return res.status(500).json({ success: false, message: 'Failed to send OTP email. Please try again later.' });
      }

      const isProduction = process.env.NODE_ENV === 'production';
      const isDebugEnabled = process.env.OTP_DEBUG === 'true';

      return res.json({
        success: true,
        message: 'OTP sent successfully',
        expiresInSeconds: 300,
        ...((!isProduction || isDebugEnabled) && emailServiceOffline ? { otp } : {})
      });
    } else {
      return res.status(400).json({ success: false, message: 'Email or Mobile Number is required' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Unable to send OTP' });
  }
}

async function verifyOtp(req, res) {
  try {
    const emailInput = req.body.email;
    const mobileInput = req.body.mobileNumber;
    const otp = String(req.body.otp || '').trim();
    const purpose = req.body.purpose || 'login';

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'Valid 6-digit OTP is required' });
    }

    if (mobileInput) {
      const mobile = String(mobileInput).trim().replace(/\D/g, "");
      const normalizedMobile = mobile.length === 12 && mobile.startsWith("91") ? mobile.slice(2) : mobile;
      const maskedMobile = maskMobile(normalizedMobile);

      console.log(`[Auth Debug] Mobile OTP verification requested for: ${maskedMobile}`);

      const record = await OtpVerification.findOne({ email: normalizedMobile, purpose: 'login' }).select('+otpHash');
      console.log(`[Auth Debug] OTP record found: ${Boolean(record)}`);

      if (!record) {
        console.log(`[Auth Debug] Verification result: failure (record not found)`);
        return res.status(400).json({ success: false, message: 'OTP expired. Please request a new code.' });
      }

      const isExpired = record.expiresAt <= new Date();
      console.log(`[Auth Debug] OTP expired: ${isExpired}`);
      if (isExpired) {
        console.log(`[Auth Debug] Verification result: failure (expired)`);
        return res.status(400).json({ success: false, message: 'OTP expired. Please request a new code.' });
      }

      if (record.attempts >= 5) {
        console.log(`[Auth Debug] Verification result: failure (too many attempts)`);
        return res.status(429).json({ success: false, message: 'Too many incorrect OTP attempts. Request a new code.' });
      }

      const ok = await bcrypt.compare(otp, record.otpHash);
      if (!ok) {
        record.attempts += 1;
        await record.save();
        console.log(`[Auth Debug] Verification result: failure (invalid OTP)`);
        return res.status(400).json({ success: false, message: 'Invalid verification code' });
      }

      record.verifiedAt = new Date();
      record.used = true;
      await record.save();

      let user = await User.findOne({ mobileNumber: normalizedMobile });
      console.log(`[Auth Debug] User found: ${Boolean(user)}`);
      
      let isNewUser = false;
      if (!user) {
        const { registerUser } = require('../services/authService');
        const emailPlaceholder = `user-${normalizedMobile}@techbes.co.in`;
        const tempPassword = crypto.randomBytes(16).toString('hex');
        const regResult = await registerUser({
          name: 'Techbes Client',
          mobileNumber: normalizedMobile,
          email: emailPlaceholder,
          password: tempPassword,
          role: 'client',
          userType: 'web_user',
        });
        user = await User.findById(regResult.user.id || regResult.user._id);
        isNewUser = true;
      }

      const { signToken } = require('../utils/jwt');
      const token = signToken(user._id, user.role);

      user.isOnline = true;
      user.sessionActive = true;
      user.lastSeen = new Date();
      await user.save();

      try {
        const { markAttendance } = require('./v2/attendanceControllerV2');
        await markAttendance(user._id);
      } catch (attErr) {
        console.warn('[Attendance] Failed to auto-mark attendance:', attErr.message);
      }

      console.log(`[Auth Debug] Verification result: success`);

      return res.json({
        success: true,
        message: isNewUser ? 'User registered and authenticated' : 'Authentication successful',
        token,
        user: user.toSafeObject(),
        data: { token, user: user.toSafeObject() }
      });
    } else if (emailInput) {
      const email = normalizeEmail(emailInput);
      const maskedEmail = maskEmail(email);

      console.log(`[Auth Debug] Email OTP verification requested for: ${maskedEmail}`);

      if (!email || !/^\d{6}$/.test(otp)) {
        console.log(`[Auth Debug] Verification result: failure (invalid input)`);
        return res.status(400).json({ success: false, message: 'Valid email and 6-digit OTP are required' });
      }

      const record = await OtpVerification.findOne({ email, purpose }).select('+otpHash');
      console.log(`[Auth Debug] OTP record found: ${Boolean(record)}`);

      if (!record) {
        console.log(`[Auth Debug] Verification result: failure (record not found)`);
        return res.status(400).json({ success: false, message: 'OTP expired. Please request a new code.' });
      }

      const isExpired = record.expiresAt <= new Date();
      console.log(`[Auth Debug] OTP expired: ${isExpired}`);
      if (isExpired) {
        console.log(`[Auth Debug] Verification result: failure (expired)`);
        return res.status(400).json({ success: false, message: 'OTP expired. Please request a new code.' });
      }

      if (record.attempts >= 5) {
        console.log(`[Auth Debug] Verification result: failure (too many attempts)`);
        return res.status(429).json({ success: false, message: 'Too many incorrect OTP attempts. Request a new code.' });
      }

      const ok = await bcrypt.compare(otp, record.otpHash);
      if (!ok) {
        record.attempts += 1;
        await record.save();
        console.log(`[Auth Debug] Verification result: failure (invalid OTP)`);
        return res.status(400).json({ success: false, message: 'Invalid verification code' });
      }

      if (purpose === 'register') {
        const verificationToken = crypto.randomBytes(32).toString('hex');
        record.verifiedAt = new Date();
        record.verificationTokenHash = hashValue(verificationToken);
        record.verificationTokenExpiresAt = new Date(Date.now() + 10 * 60_000);
        await record.save();

        console.log(`[Auth Debug] Verification result: success (registration flow)`);

        return res.json({
          success: true,
          message: 'Email verified successfully',
          data: { emailVerificationToken: verificationToken },
        });
      } else {
        // purpose === 'login'
        record.verifiedAt = new Date();
        record.used = true;
        await record.save();

        let user = await User.findOne({ email });
        console.log(`[Auth Debug] User found: ${Boolean(user)}`);

        let isNewUser = false;
        if (!user) {
          const { registerUser } = require('../services/authService');
          const mobilePlaceholder = `99999${Math.floor(10000 + Math.random() * 90000)}`;
          const tempPassword = crypto.randomBytes(16).toString('hex');
          const regResult = await registerUser({
            name: 'Techbes Client',
            mobileNumber: mobilePlaceholder,
            email: email,
            password: tempPassword,
            role: 'client',
            userType: 'web_user',
          });
          user = await User.findById(regResult.user.id || regResult.user._id);
          isNewUser = true;
        }

        const { signToken } = require('../utils/jwt');
        const token = signToken(user._id, user.role);

        user.isOnline = true;
        user.sessionActive = true;
        user.lastSeen = new Date();
        await user.save();

        try {
          const { markAttendance } = require('./v2/attendanceControllerV2');
          await markAttendance(user._id);
        } catch (attErr) {
          console.warn('[Attendance] Failed to auto-mark attendance:', attErr.message);
        }

        console.log(`[Auth Debug] Verification result: success`);

        return res.json({
          success: true,
          message: isNewUser ? 'User registered and authenticated' : 'Authentication successful',
          token,
          user: user.toSafeObject(),
          data: { token, user: user.toSafeObject() }
        });
      }
    } else {
      return res.status(400).json({ success: false, message: 'Email or Mobile Number is required' });
    }
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

async function forgotPassword(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Email address not found. Please register first.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetToken = hashedToken;
    user.resetTokenExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes
    await user.save();

    try {
      const { getTransporter, formatFromAddress } = require('../services/emailService');
      const transporter = getTransporter();
      const rawFrom = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
      const from = formatFromAddress(rawFrom);
      const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Forgot Password] Reset token generated: ${resetToken}`);
        console.log(`[Forgot Password] Reset link: ${resetLink}`);
      } else {
        console.log(`[Forgot Password] Reset token generated: [MASKED]`);
        console.log(`[Forgot Password] Reset email dispatched`);
      }

      await transporter.sendMail({
        from,
        to: email,
        subject: 'Reset your Techbes account password',
        text: `You requested to reset your password. Click the link below to set a new password:\n\n${resetLink}\n\nThis link is valid for 30 minutes. If you did not request this, you can ignore this email.`,
        html: `
          <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px;color:#0f172a">
            <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
              <div style="padding:24px;border-bottom:1px solid #e2e8f0">
                <h1 style="margin:0;font-size:22px">Reset your password</h1>
              </div>
              <div style="padding:28px 24px">
                <p style="margin:0 0 20px;color:#475569">You requested to reset your password. Click the button below to set a new password:</p>
                <a href="${resetLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Reset Password</a>
                <p style="margin:20px 0 0;color:#64748b">This link is valid for 30 minutes. If you did not request this, you can ignore this email.</p>
              </div>
            </div>
          </div>
        `,
      });
      return res.json({ success: true, message: 'Password reset link sent to your registered email address.' });
    } catch (emailErr) {
      console.error('[Forgot Password] Email send failed:', emailErr);
      const isDev = process.env.NODE_ENV !== 'production' || process.env.OTP_DEBUG === 'true';
      if (isDev) {
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
        return res.json({
          success: true,
          message: 'Password reset link generated (Development Fallback).',
          token: resetToken,
          resetLink
        });
      }
      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email. Please try again later.'
      });
    }
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token, email, password, newPassword } = req.body;

    const passwordVal = password || newPassword;

    if (!token || !passwordVal) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }

    if (passwordVal.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    let user;
    if (email) {
      const normalizedEmail = normalizeEmail(email);
      user = await User.findOne({ email: normalizedEmail }).select('+resetToken +resetTokenExpiry');
    } else {
      user = await User.findOne({ resetToken: hashedToken }).select('+resetToken +resetTokenExpiry');
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.resetToken !== hashedToken || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset token' });
    }

    user.password = passwordVal;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    return res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, register, sendOtp, verifyOtp, me, updateFcmToken, logout, forgotPassword, resetPassword };
