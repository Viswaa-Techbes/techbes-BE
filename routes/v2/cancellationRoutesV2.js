/**
 * Cancellation Routes V2
 * =======================
 * POST /api/v2/cancellations/customer/:jobId   - Customer requests cancellation (pending admin review)
 * POST /api/v2/cancellations/admin/:jobId      - Admin approves or rejects cancellation request
 * POST /api/v2/cancellations/technician/:jobId - Technician cancels (auto penalty)
 * GET  /api/v2/cancellations/pending           - Admin: view all pending cancellation requests
 * GET  /api/v2/cancellations/history           - Admin: full cancellation history
 */

const express = require('express');
const router = express.Router();
const { authenticate: verifyToken, requireRoles } = require('../../middlewares/auth');
const requireAdmin = requireRoles('admin', 'manager');
const Job = require('../../models/Job');
const User = require('../../models/User');
const notificationService = require('../../services/notificationService');
const dispatchService = require('../../services/dispatchService');


function getIo(req) {
  return req.app.get('io') || global._socketIo || null;
}

// ─── Customer requests cancellation ───────────────────────────────────────────
router.post('/customer/:jobId', verifyToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const { jobId } = req.params;
    const userId = req.user._id || req.user.id;

    const job = await Job.findOne({ _id: jobId, client: userId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found or not yours' });

    if (['completed', 'cancelled', 'closed'].includes(job.status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel a completed or already-cancelled job' });
    }

    // Mark as cancellation pending admin review
    job.status = 'cancellation_requested';
    job.cancellation = {
      cancelledBy: 'customer',
      reason: reason || '',
      validReason: null,
      approvedByAdmin: null,
      penaltyAmount: 0,
      cancelledAt: null,
      adminNote: '',
    };
    await job.save();

    // Notify admins
    const io = getIo(req);
    await dispatchService.notifyAdmins(
      io,
      '🚫 Cancellation Requested',
      `Customer requested cancellation for: ${job.serviceName || job.title}. Reason: ${reason || 'Not provided'}`,
      'cancellation_request',
      { jobId: jobId.toString() }
    );

    res.json({
      success: true,
      message: 'Cancellation request submitted. Admin will review within 24 hours.',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Admin: Approve or reject cancellation ────────────────────────────────────
router.post('/admin/:jobId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { action, adminNote, penaltyAmount } = req.body; // action: 'approve' | 'reject'
    const { jobId } = req.params;
    const io = getIo(req);

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (job.status !== 'cancellation_requested') {
      return res.status(400).json({ success: false, message: 'No pending cancellation request for this job' });
    }

    if (action === 'approve') {
      job.status = 'cancelled';
      job.cancellation.approvedByAdmin = true;
      job.cancellation.validReason = true;
      job.cancellation.cancelledAt = new Date();
      job.cancellation.adminNote = adminNote || '';
      job.cancellation.penaltyAmount = penaltyAmount || 0;

      // Release assigned technician if any
      if (job.assignedTechnician) {
        await User.findByIdAndUpdate(job.assignedTechnician, {
          availabilityStatus: 'ONLINE',
          activeJobId: null,
        });

        await notificationService.createNotification(
          job.assignedTechnician,
          '❌ Job Cancelled',
          `The job "${job.serviceName || job.title}" has been cancelled by the customer (approved by admin).`,
          'job_cancelled',
          io,
          { jobId: jobId.toString() }
        );
      }

      // Notify customer of approval
      if (job.client) {
        await notificationService.createNotification(
          job.client,
          '✅ Cancellation Approved',
          `Your cancellation request for "${job.serviceName || job.title}" has been approved.${penaltyAmount ? ` A cancellation fee of ₹${penaltyAmount} may apply.` : ''}`,
          'cancellation_approved',
          io,
          { jobId: jobId.toString() }
        );

        // Notify client of refund
        await notificationService.createNotification(
          job.client,
          '💳 Refund Processed',
          `A refund has been processed for your booking "${job.serviceName || job.title}".`,
          'refund_processed',
          io,
          { jobId: jobId.toString() }
        );
      }
    } else if (action === 'reject') {
      job.status = 'assigned'; // Restore previous status
      job.cancellation.approvedByAdmin = false;
      job.cancellation.validReason = false;
      job.cancellation.adminNote = adminNote || '';

      // Notify customer of rejection
      if (job.client) {
        await notificationService.createNotification(
          job.client,
          '❌ Cancellation Rejected',
          `Your cancellation request for "${job.serviceName || job.title}" has been rejected. ${adminNote || 'Please contact support for assistance.'}`,
          'cancellation_rejected',
          io,
          { jobId: jobId.toString() }
        );
      }
    } else {
      return res.status(400).json({ success: false, message: 'action must be "approve" or "reject"' });
    }

    await job.save();
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Get pending cancellation requests (admin) ────────────────────────────────
router.get('/pending', verifyToken, requireAdmin, async (req, res) => {
  try {
    const jobs = await Job.find({ status: 'cancellation_requested' })
      .populate('client', 'name phone email')
      .populate('assignedTechnician', 'name phone')
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ success: true, data: jobs, count: jobs.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Get cancellation history (admin) ────────────────────────────────────────
router.get('/history', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const jobs = await Job.find({
      $or: [
        { status: 'cancelled' },
        { 'cancellation.cancelledBy': { $ne: null } },
        { 'technicianPenalty.amount': { $gt: 0 } },
      ],
    })
      .populate('client', 'name phone email')
      .populate('assignedTechnician', 'name phone')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Job.countDocuments({
      $or: [
        { status: 'cancelled' },
        { 'cancellation.cancelledBy': { $ne: null } },
        { 'technicianPenalty.amount': { $gt: 0 } },
      ],
    });

    res.json({ success: true, data: jobs, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Technician cancels job ───────────────────────────────────────────
router.post('/technician/:jobId', verifyToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const { jobId } = req.params;
    const technicianId = req.user._id || req.user.id;
    const io = getIo(req);

    const result = await dispatchService.technicianCancelJob(jobId, technicianId, reason || '', io);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Technician penalty history ───────────────────────────────────────────────
router.get('/technician-penalties', verifyToken, requireAdmin, async (req, res) => {
  try {
    const technicians = await User.find({
      role: 'technician',
      'penalties.0': { $exists: true },
    })
      .select('name phone penalties penaltyPoints performanceScore')
      .populate({
        path: 'penalties.jobId',
        select: 'bookingNumber customerName customerPhone title serviceName status'
      })
      .sort({ penaltyPoints: -1 })
      .lean();

    const summary = technicians.map(t => ({
      id: t._id,
      name: t.name,
      phone: t.phone,
      penaltyPoints: t.penaltyPoints,
      performanceScore: t.performanceScore,
      totalPenaltyAmount: t.penalties.reduce((acc, p) => acc + (p.amount || 0), 0),
      penalties: t.penalties,
    }));

    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
