/**
 * Dispatch Routes V2
 * =================
 * POST /api/v2/dispatch/retry/:jobId          - Admin retries dispatch for a job
 * POST /api/v2/dispatch/override/:jobId       - Admin manually overrides assignment
 * GET  /api/v2/dispatch/status/:jobId         - Get live dispatch status for a job
 * GET  /api/v2/dispatch/active                - All jobs currently in dispatching state
 * POST /api/v2/dispatch/accept/:jobId         - Technician accepts a broadcast job request
 * POST /api/v2/dispatch/reject/:jobId         - Technician rejects a broadcast job request
 * PUT  /api/v2/dispatch/availability          - Technician updates availability (ONLINE/OFFLINE/BUSY)
 * POST /api/v2/dispatch/tech-cancel/:jobId    - Technician cancels an assigned job (penalty applied)
 */

const express = require('express');
const router = express.Router();
const { authenticate: verifyToken, requireRoles } = require('../../middlewares/auth');
const requireAdmin = requireRoles('admin', 'manager');
const dispatchService = require('../../services/dispatchService');
const Job = require('../../models/Job');
const User = require('../../models/User');
const JobRequest = require('../../models/JobRequest');
const ServiceWorksheet = require('../../models/ServiceWorksheet');


// Helper to get io
function getIo(req) {
  return req.app.get('io') || global._socketIo || null;
}

// ─── Admin: Retry dispatch for a job ─────────────────────────────────────────
router.post('/retry/:jobId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const io = getIo(req);
    const result = await dispatchService.autoAssignTechnician(req.params.jobId, io);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Admin: Override assignment ───────────────────────────────────────────────
router.post('/override/:jobId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { technicianId } = req.body;
    if (!technicianId) return res.status(400).json({ success: false, message: 'technicianId is required' });

    const io = getIo(req);
    const job = await dispatchService.adminOverrideAssignment(
      req.params.jobId,
      technicianId,
      req.user._id || req.user.id,
      io
    );
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Get dispatch status for a job ───────────────────────────────────────────
router.get('/status/:jobId', verifyToken, async (req, res) => {
  try {
    const status = await dispatchService.getDispatchStatus(req.params.jobId);
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── All active dispatching jobs ──────────────────────────────────────────────
router.get('/active', verifyToken, requireAdmin, async (req, res) => {
  try {
    const jobs = await Job.find({
      dispatchStatus: { $in: ['pending_dispatch', 'dispatching', 'no_tech_found'] },
    })
      .populate('assignedTechnician', 'name phone rating')
      .populate('client', 'name phone email')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ success: true, data: jobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Technician: Accept broadcast job request ─────────────────────────────────
router.post('/accept/:jobId', verifyToken, async (req, res) => {
  try {
    const technicianId = req.user._id || req.user.id;
    const io = getIo(req);
    const result = await dispatchService.acceptJobRequest(req.params.jobId, technicianId, io);
    res.json({ success: true, job: result.job });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Technician: Reject broadcast job request ─────────────────────────────────
router.post('/reject/:jobId', verifyToken, async (req, res) => {
  try {
    const technicianId = req.user._id || req.user.id;
    const { reason } = req.body;
    const io = getIo(req);
    const result = await dispatchService.rejectJobRequest(req.params.jobId, technicianId, reason || '', io);
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Technician: Update availability status ───────────────────────────────────
router.put('/availability', verifyToken, async (req, res) => {
  try {
    const { status } = req.body; // ONLINE | OFFLINE | BUSY
    const techId = req.user._id || req.user.id;

    if (!['ONLINE', 'OFFLINE', 'BUSY'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Use ONLINE, OFFLINE, or BUSY' });
    }

    // Performance-based suspension check
    const checkUser = await User.findById(techId).select('performanceScore penaltyPoints');
    if (status === 'ONLINE' && checkUser) {
      const penaltyPoints = checkUser.penaltyPoints || 0;
      const performanceScore = checkUser.performanceScore !== undefined ? checkUser.performanceScore : 100;
      if (penaltyPoints >= 3 || performanceScore < 70) {
        return res.status(403).json({
          success: false,
          message: `Your account is temporarily suspended from going ONLINE due to repeated cancellations (${penaltyPoints} penalties) or low performance score (${performanceScore}%).`
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      techId,
      {
        availabilityStatus: status,
        // Legacy isOnline sync
        isOnline: status === 'ONLINE',
        // Clear active job if going offline
        ...(status === 'OFFLINE' ? { activeJobId: null } : {}),
      },
      { new: true }
    ).select('name availabilityStatus isOnline');

    // Emit to admin tracking
    const io = getIo(req);
    if (io) {
      io.to('admin_room').emit('technicianStatusUpdate', {
        technicianId: techId,
        name: user.name,
        availabilityStatus: status,
        isOnline: status === 'ONLINE',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Technician: Update live location ────────────────────────────────────────
router.put('/location', verifyToken, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const techId = req.user._id || req.user.id;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ success: false, message: 'lat and lng are required' });
    }

    await User.findByIdAndUpdate(techId, {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      locationUpdatedAt: new Date(),
    });

    const io = getIo(req);
    if (io) {
      io.to('admin_room').emit('technicianLocationUpdate', {
        technicianId: techId,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Technician: Cancel assigned job (penalty applied) ───────────────────────
router.post('/tech-cancel/:jobId', verifyToken, async (req, res) => {
  try {
    const technicianId = req.user._id || req.user.id;
    const { reason } = req.body;
    const io = getIo(req);
    const result = await dispatchService.technicianCancelJob(
      req.params.jobId,
      technicianId,
      reason || '',
      io
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Get technician's pending job requests ────────────────────────────────────
router.get('/my-requests', verifyToken, async (req, res) => {
  try {
    const techId = req.user._id || req.user.id;
    const requests = await JobRequest.find({
      technicianId: techId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    })
      .populate({
        path: 'jobId',
        select: 'customerName serviceName title location bookingDate timeSlot totalAmount amount price',
        populate: { path: 'addressId', select: 'addressLine1 city pincode latitude longitude' },
      })
      .sort({ sentAt: -1 })
      .lean();

    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── OTP START FLOW ───────────────────────────────────────────────────────────
router.post('/otp/start/:jobId', verifyToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const Job = require('../../models/Job');
    const User = require('../../models/User');
    const OtpVerification = require('../../models/OtpVerification');
    const emailService = require('../../services/emailService');
    const bcrypt = require('bcryptjs');

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const userRole = req.user.role;
    const userId = req.user._id || req.user.id;
    if (userRole === 'technician' && (!job.assignedTechnician || job.assignedTechnician.toString() !== userId.toString())) {
      return res.status(403).json({ success: false, message: 'Not authorized to start this job' });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[OTP] START JOB OTP for Job ${jobId}: ${otp}`);

    const otpHash = await bcrypt.hash(otp, 12);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await OtpVerification.deleteMany({ email: jobId, purpose: 'start_job' });
    await OtpVerification.create({
      email: jobId,
      otpHash,
      purpose: 'start_job',
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
          console.warn(`[OTP] Failed to send email to ${customer.email}:`, err.message);
        }
      }
    }

    res.json({
      success: true,
      message: 'OTP generated and logged successfully',
      otp,
      emailSent,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/otp/start/:jobId/verify', verifyToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { otp } = req.body;
    const Job = require('../../models/Job');
    const OtpVerification = require('../../models/OtpVerification');
    const notificationService = require('../../services/notificationService');
    const bcrypt = require('bcryptjs');

    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP is required' });
    }

    const record = await OtpVerification.findOne({ email: jobId, purpose: 'start_job' }).select('+otpHash');
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

    job.status = 'in_progress';
    job.startedAt = new Date();
    await job.save();

    // Notify client
    const io = getIo(req);
    if (job.client) {
      if (io) io.to(job.client.toString()).emit('jobStarted', job);
      await notificationService.createNotification(
        job.client,
        '🚀 Job Started',
        `Your service for ${job.serviceName || job.title} has started.`,
        'job_started',
        io,
        { jobId: job._id.toString() }
      );
    }

    res.json({
      success: true,
      message: 'OTP verified successfully. Job status updated to IN_PROGRESS.',
      job,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── OTP COMPLETION FLOW ──────────────────────────────────────────────────────
router.post('/otp/complete/:jobId', verifyToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const Job = require('../../models/Job');
    const User = require('../../models/User');
    const OtpVerification = require('../../models/OtpVerification');
    const emailService = require('../../services/emailService');
    const bcrypt = require('bcryptjs');

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const userRole = req.user.role;
    const userId = req.user._id || req.user.id;
    if (userRole === 'technician' && (!job.assignedTechnician || job.assignedTechnician.toString() !== userId.toString())) {
      return res.status(403).json({ success: false, message: 'Not authorized to complete this job' });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[OTP] COMPLETE JOB OTP for Job ${jobId}: ${otp}`);

    const otpHash = await bcrypt.hash(otp, 12);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

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
          console.warn(`[OTP] Failed to send email to ${customer.email}:`, err.message);
        }
      }
    }

    res.json({
      success: true,
      message: 'OTP generated and logged successfully',
      otp,
      emailSent,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/otp/complete/:jobId/verify', verifyToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { otp } = req.body;
    const Job = require('../../models/Job');
    const User = require('../../models/User');
    const OtpVerification = require('../../models/OtpVerification');
    const notificationService = require('../../services/notificationService');
    const bcrypt = require('bcryptjs');

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

    // Set OTP verified on the worksheet (initialize worksheet draft if it doesn't exist yet)
    let worksheet = await ServiceWorksheet.findOne({ jobId });
    if (!worksheet) {
      let customerId = job.customerId || '';
      if (!customerId && job.client) {
        const clientUser = await User.findById(job.client).select('customerId');
        if (clientUser) {
          customerId = clientUser.customerId || '';
        }
      }
      if (!customerId) {
        customerId = `CUS-TEMP-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      worksheet = new ServiceWorksheet({
        jobId: job._id,
        bookingId: job.bookingNumber || job.bookingId || `BOOK-${Math.floor(Date.now() / 1000)}`,
        customerId: customerId,
        technicianId: job.assignedTechnician?._id || req.user.id || req.user._id,
        customerName: job.customerName || 'N/A',
        customerMobile: job.customerPhone || 'N/A',
        customerAddress: job.location || 'N/A',
        serviceType: job.serviceType || 'other',
        serviceCategory: job.serviceName || job.title || 'Field Service',
        jobCreatedDate: job.createdAt || new Date(),
        status: 'draft'
      });
    }

    worksheet.completionOtpVerified = true;
    await worksheet.save();

    job.status = 'completed';
    job.completedAt = new Date();
    await job.save();

    if (job.assignedTechnician) {
      await User.findByIdAndUpdate(job.assignedTechnician, {
        availabilityStatus: 'ONLINE',
        activeJobId: null,
        $inc: { completedJobs: 1 }
      });
    }

    const io = global._socketIo || req.app.get('io') || null;
    if (io) {
      io.emit('jobStatusUpdated', { jobId: job._id.toString(), status: 'completed', note: 'OTP completion verified' });
      if (job.client) {
        io.to(job.client.toString()).emit('jobCompleted', job);
      }
    }

    if (job.client) {
      await notificationService.createNotification(
        job.client,
        'Service Completed',
        `Your service request for ${job.serviceName || job.title} has been completed.`,
        'job_completed',
        io,
        { jobId: job._id.toString() }
      );
    }

    res.json({
      success: true,
      message: 'OTP verified successfully. Job completed.',
      completionOtpVerified: true,
      job
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
