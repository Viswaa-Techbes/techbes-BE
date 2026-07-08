const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Job = require('../../models/Job');
const User = require('../../models/User');
const OtpVerification = require('../../models/OtpVerification');
const notificationService = require('../../services/notificationService');
const emailService = require('../../services/emailService');
const { authenticate: verifyToken } = require('../../middlewares/auth');
const bcrypt = require('bcryptjs');

// Helper to get socket io instance
function getIo(req) {
  return req.app.get('io') || global._socketIo || null;
}

// Helper to get or create start OTP (same logic as hooks)
async function getOrCreateStartJobOtp(job) {
  const jobId = job._id;
  const technicianId = job.assignedTechnician;
  const customerId = job.client;

  let record = await OtpVerification.findOne({
    bookingId: jobId,
    purpose: 'start_job',
    used: false,
    expiresAt: { $gt: new Date() }
  }).select('+otpHash');

  if (record) {
    return { otp: record.otp, record };
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`[OTP Route] Generated START JOB OTP for Job ${jobId}: ${otp}`);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
  const otpHash = await bcrypt.hash(otp, 12);

  await OtpVerification.deleteMany({ bookingId: jobId, purpose: 'start_job' });
  await OtpVerification.deleteMany({ email: jobId.toString(), purpose: 'start_job' });

  record = await OtpVerification.create({
    email: jobId.toString(),
    otpHash,
    otp,
    purpose: 'start_job',
    bookingId: jobId,
    technicianId,
    customerId,
    used: false,
    expiresAt,
  });

  return { otp, record };
}

// GET or request start OTP
router.post('/start/:jobId', verifyToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const userRole = req.user.role;
    const userId = req.user._id || req.user.id;
    if (userRole === 'technician' && (!job.assignedTechnician || job.assignedTechnician.toString() !== userId.toString())) {
      return res.status(403).json({ success: false, message: 'Not authorized to request OTP for this job' });
    }

    const { otp } = await getOrCreateStartJobOtp(job);

    let emailSent = false;
    if (job.client) {
      const customer = await User.findById(job.client).select('email').lean();
      if (customer && customer.email) {
        try {
          await emailService.sendOtpEmail(customer.email, otp);
          emailSent = true;
        } catch (err) {
          console.warn(`[OTP Route] Failed to send email to ${customer.email}:`, err.message);
        }
      }
    }

    return res.json({
      success: true,
      message: 'OTP generated and logged successfully',
      otp,
      emailSent,
    });
  } catch (err) {
    console.error('[OTP Start Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Verify start OTP
router.post('/start/:jobId/verify', verifyToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP is required' });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Booking mismatch: Job not found' });
    }

    const technicianId = job.assignedTechnician;
    if (!technicianId) {
      return res.status(400).json({ success: false, message: 'No technician assigned to this booking' });
    }

    const technician = await User.findById(technicianId);
    if (!technician) {
      return res.status(404).json({ success: false, message: 'Technician mismatch: Assigned technician not found' });
    }

    const customerId = job.client;
    if (!customerId) {
      return res.status(400).json({ success: false, message: 'No customer associated with this booking' });
    }

    const customer = await User.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer mismatch: Customer not found' });
    }

    // Check if the current authenticated user is the assigned technician
    const authUserId = req.user._id || req.user.id;
    if (req.user.role === 'technician' && authUserId.toString() !== technicianId.toString()) {
      return res.status(403).json({ success: false, message: 'Technician mismatch: You are not assigned to this job' });
    }

    // Find OTP record (checks bookingId or email compatibility field)
    const record = await OtpVerification.findOne({
      $or: [
        { bookingId: job._id, purpose: 'start_job' },
        { email: jobId.toString(), purpose: 'start_job' }
      ]
    }).select('+otpHash');

    if (!record) {
      return res.status(400).json({ success: false, message: 'No OTP found for this booking' });
    }

    if (record.used === true || record.verifiedAt !== null) {
      return res.status(400).json({ success: false, message: 'Already Used OTP' });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'Expired OTP' });
    }

    let isMatch = false;
    if (record.otp && record.otp === String(otp)) {
      isMatch = true;
    } else if (record.otpHash) {
      isMatch = await bcrypt.compare(otp, record.otpHash);
    }

    if (!isMatch) {
      record.attempts = (record.attempts || 0) + 1;
      await record.save();
      return res.status(400).json({ success: false, message: 'Wrong OTP' });
    }

    // Success! Mark OTP used
    record.used = true;
    record.verifiedAt = new Date();
    await record.save();

    job.status = 'in_progress';
    job.startedAt = new Date();
    job.actualStartTime = new Date();
    await job.save();

    const io = getIo(req);
    if (io) {
      io.emit('jobStatusUpdated', { jobId, status: 'in_progress', note: 'Job started via OTP verification' });
      io.to(technicianId.toString()).emit('jobStarted', job);
      io.to(customerId.toString()).emit('jobStarted', job);
    }

    await notificationService.createNotification(
      customerId,
      '🚀 Job Started',
      `Your service for ${job.serviceName || job.title} has started.`,
      'job_started',
      io,
      { jobId: job._id.toString() }
    );

    return res.json({
      success: true,
      message: 'OTP verified successfully. Job status updated to IN_PROGRESS.',
      job,
    });
  } catch (err) {
    console.error('[OTP Verify Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// --- Legacy Completion Flow Mirroring ---
router.post('/complete/:jobId', verifyToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const userRole = req.user.role;
    const userId = req.user._id || req.user.id;
    if (userRole === 'technician' && (!job.assignedTechnician || job.assignedTechnician.toString() !== userId.toString())) {
      return res.status(403).json({ success: false, message: 'Not authorized to complete this job' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[OTP Complete] Generated COMPLETE JOB OTP for Job ${jobId}: ${otp}`);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    const otpHash = await bcrypt.hash(otp, 12);

    await OtpVerification.deleteMany({ email: jobId, purpose: 'complete_job' });
    await OtpVerification.create({
      email: jobId,
      otpHash,
      purpose: 'complete_job',
      expiresAt,
    });

    let emailSent = false;
    if (job.client) {
      const customer = await User.findById(job.client).select('email').lean();
      if (customer && customer.email) {
        try {
          await emailService.sendOtpEmail(customer.email, otp);
          emailSent = true;
        } catch (err) {
          console.warn(`[OTP Complete] Failed to send email to ${customer.email}:`, err.message);
        }
      }
    }

    return res.json({
      success: true,
      message: 'OTP generated and logged successfully',
      otp,
      emailSent,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/complete/:jobId/verify', verifyToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP is required' });
    }

    const record = await OtpVerification.findOne({ email: jobId, purpose: 'complete_job' }).select('+otpHash');
    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'OTP has expired or is invalid' });
    }

    const ok = await bcrypt.compare(otp, record.otpHash);
    if (!ok) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    record.verifiedAt = new Date();
    await record.save();

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    job.status = 'completed';
    job.completedAt = new Date();
    await job.save();

    const io = getIo(req);
    if (job.client) {
      if (io) io.to(job.client.toString()).emit('jobCompleted', job);
      await notificationService.createNotification(
        job.client,
        '🏁 Job Completed',
        `Your service for ${job.serviceName || job.title} has been completed successfully.`,
        'job_completed',
        io,
        { jobId: job._id.toString() }
      );
    }

    return res.json({
      success: true,
      message: 'OTP verified successfully. Job completed.',
      job,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
