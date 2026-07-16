const express = require('express');
const router = express.Router();
const ServiceWorksheet = require('../../models/ServiceWorksheet');
const Job = require('../../models/Job');
const User = require('../../models/User');
const pdfService = require('../../services/pdfService');
const notificationService = require('../../services/notificationService');
const { authenticate, requireRoles } = require('../../middlewares/auth');

// Helper to get socket.io instance
function getIo(req) {
  return req.app.get('io') || global._socketIo || null;
}

// ─── GET: LIST ALL WORKSHEETS (ADMIN/MANAGER ONLY) ──────────────────────────
router.get('/', authenticate, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;

    const worksheets = await ServiceWorksheet.find(query)
      .populate('technicianId', 'name phone email specialty')
      .populate('jobId', 'title bookingNumber client')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await ServiceWorksheet.countDocuments(query);

    return res.json({
      success: true,
      data: worksheets,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET: FETCH OR INITIALIZE WORKSHEET FOR A JOB ───────────────────────────
router.get('/job/:jobId', authenticate, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    let worksheet = await ServiceWorksheet.findOne({ jobId })
      .populate('technicianId', 'name email phone mobileNumber specialty performance rating profilePhoto')
      .populate('jobId', 'title description location scheduledTime scheduledDate status totalAmount');

    if (worksheet) {
      return res.json({ success: true, data: worksheet });
    }

    // Worksheet doesn't exist, auto-create a draft by pulling data from Job / Booking
    const job = await Job.findById(jobId).populate('assignedTechnician');
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Find custom customerId if client is linked
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

    await worksheet.save();

    return res.json({ success: true, data: worksheet });
  } catch (err) {
    next(err);
  }
});

// ─── PUT: UPDATE WORKSHEET ──────────────────────────────────────────────────
router.put('/job/:jobId', authenticate, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const updateData = req.body;

    const worksheet = await ServiceWorksheet.findOne({ jobId });
    if (!worksheet) {
      return res.status(404).json({ success: false, message: 'Worksheet not found' });
    }

    // Worksheet Locking: Reject edits if already approved
    if (worksheet.status === 'approved') {
      return res.status(400).json({ success: false, message: 'This worksheet has already been approved and is locked for edits.' });
    }

    // Authorize: Only assigned technician or managers/admins can edit
    if (req.user.role === 'technician' && worksheet.technicianId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied: You are not the assigned technician' });
    }

    // Apply updates
    const editableFields = [
      'arrivalTime', 'workStartTime', 'workEndTime',
      'requestedWorkDescription', 'technicianObservations', 'additionalComments',
      'materialsUsed', 'partsInstalled',
      'beforePhotos', 'duringPhotos', 'afterPhotos',
      'customerSignatureUrl', 'technicianSignatureUrl',
      'labourCost', 'status'
    ];

    editableFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        worksheet[field] = updateData[field];
      }
    });

    // Re-calculate costs dynamically
    if (updateData.materialsUsed || updateData.labourCost !== undefined) {
      let matCostSum = 0;
      worksheet.materialsUsed.forEach((item) => {
        const price = item.unitPrice !== undefined ? item.unitPrice : (item.unitCost || 0);
        item.unitPrice = price;
        item.unitCost = price;
        item.total = (item.quantity || 1) * price;
        item.totalCost = item.total;
        matCostSum += item.total;
      });
      worksheet.materialCost = matCostSum;
      worksheet.totalCost = worksheet.materialCost + (worksheet.labourCost || 0);

      const job = await Job.findById(jobId);
      if (job && worksheet.totalCost > job.price && job.additionalChargesStatus === 'none') {
        job.additionalChargesStatus = 'pending';
        job.additionalCharges = worksheet.totalCost - job.price;
        await job.save();
      }
    }

    // Handle Submission Action
    if (worksheet.status === 'submitted') {
      // Validation rules check on submit
      if (!worksheet.completionOtpVerified) {
        return res.status(400).json({ success: false, message: 'Validation failed: Customer OTP verification is required before submission.' });
      }
      if (!worksheet.beforePhotos || worksheet.beforePhotos.length === 0) {
        return res.status(400).json({ success: false, message: 'Validation failed: Minimum 1 before photo is mandatory.' });
      }
      if (!worksheet.afterPhotos || worksheet.afterPhotos.length === 0) {
        return res.status(400).json({ success: false, message: 'Validation failed: Minimum 1 after photo is mandatory.' });
      }
      if (!worksheet.customerSignatureUrl) {
        return res.status(400).json({ success: false, message: 'Validation failed: Customer signature is required.' });
      }
      
      worksheet.submittedAt = new Date();

      // Automatically transition Job to completed
      const job = await Job.findById(jobId);
      if (job) {
        job.status = 'completed';
        job.completedAt = new Date();
        await job.save();

        const io = getIo(req);
        if (io) {
          io.emit('jobStatusUpdated', { jobId: jobId, status: 'completed' });
          if (job.client) {
            io.to(job.client.toString()).emit('jobCompleted', job);
          }
        }

        // Notify client
        if (job.client) {
          await notificationService.createNotification(
            job.client,
            'Service Completed',
            'Your service request has been successfully completed!',
            'job_completed',
            io,
            { jobId: jobId.toString() }
          );
        }

        // Notify Admin
        const admins = await User.find({ role: { $in: ['admin', 'manager'] }, isDeleted: { $ne: true } }).select('_id');
        for (const admin of admins) {
          await notificationService.createNotification(
            admin._id,
            'Job Completed',
            `Service "${job.serviceName || job.title}" has been completed.`,
            'job_completed',
            io,
            { jobId: jobId.toString() }
          );
        }
      }

      // Mark technician availability as ONLINE
      if (worksheet.technicianId) {
        const techUser = await User.findByIdAndUpdate(
          worksheet.technicianId,
          {
            availabilityStatus: 'ONLINE',
            isOnline: true,
            activeJobId: null
          },
          { new: true }
        );
        if (techUser) {
          const io = getIo(req);
          if (io) {
            io.to('admin_room').emit('technicianStatusUpdate', {
              technicianId: worksheet.technicianId.toString(),
              name: techUser.name,
              availabilityStatus: 'ONLINE',
              isOnline: true,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      // Send Notifications
      const io = getIo(req);
      const jobObj = await Job.findById(jobId);
      
      // Notify Admin
      const admins = await User.find({ role: { $in: ['admin', 'manager'] } }).select('_id');
      for (const admin of admins) {
        await notificationService.createNotification(
          admin._id.toString(),
          'Worksheet Awaiting Approval',
          `Digital worksheet for Booking #${worksheet.bookingId} is awaiting your approval.`,
          'worksheet_submitted',
          io,
          { jobId: jobId }
        );
      }

      // Notify Customer
      if (jobObj && jobObj.client) {
        await notificationService.createNotification(
          jobObj.client.toString(),
          'Worksheet Submitted',
          `Your service report for Booking #${worksheet.bookingId} has been submitted.`,
          'worksheet_submitted',
          io,
          { jobId: jobId }
        );
      }
    }

    await worksheet.save();
    return res.json({ success: true, data: worksheet });
  } catch (err) {
    next(err);
  }
});

// ─── POST: APPROVE WORKSHEET (ADMIN/MANAGER ONLY) ───────────────────────────
router.post('/job/:jobId/approve', authenticate, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const worksheet = await ServiceWorksheet.findOne({ jobId });
    if (!worksheet) {
      return res.status(404).json({ success: false, message: 'Worksheet not found' });
    }

    const job = await Job.findById(jobId).populate('assignedTechnician');
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Admin approval validation rules
    if (!worksheet.beforePhotos || worksheet.beforePhotos.length === 0) {
      return res.status(400).json({ success: false, message: 'Approval failed: Before work photo is missing from the worksheet.' });
    }
    if (!worksheet.afterPhotos || worksheet.afterPhotos.length === 0) {
      return res.status(400).json({ success: false, message: 'Approval failed: After work photo is missing from the worksheet.' });
    }
    if (!worksheet.customerSignatureUrl) {
      return res.status(400).json({ success: false, message: 'Approval failed: Customer signature is missing from the worksheet.' });
    }

    // Update status
    worksheet.status = 'approved';
    worksheet.approvedAt = new Date();

    // Automatically generate and upload PDF report
    const pdfUrl = await pdfService.generateWorksheetPdf(worksheet, job);
    worksheet.pdfUrl = pdfUrl;
    await worksheet.save();

    // Sync PDF URL to Job attachments (so it can be retrieved by standard customer report queries)
    if (!job.attachments) {
      job.attachments = [];
    }
    // Prepend PDF URL to attachments array
    job.attachments.unshift(pdfUrl);
    await job.save();

    // Send Notifications
    const io = getIo(req);

    // Notify Technician
    if (worksheet.technicianId) {
      await notificationService.createNotification(
        worksheet.technicianId.toString(),
        'Worksheet Approved',
        `Your worksheet for Booking #${worksheet.bookingId} has been approved by the admin.`,
        'worksheet_approved',
        io,
        { jobId: jobId }
      );
    }

    // Notify Customer
    if (job.client) {
      await notificationService.createNotification(
        job.client.toString(),
        'Service Worksheet Approved & PDF Ready',
        `Your service report PDF for Booking #${worksheet.bookingId} is now ready to download.`,
        'worksheet_approved',
        io,
        { jobId: jobId }
      );
    }

    return res.json({ success: true, message: 'Worksheet approved and PDF generated successfully', data: worksheet });
  } catch (err) {
    next(err);
  }
});

// ─── POST: REJECT WORKSHEET (ADMIN/MANAGER ONLY) ─────────────────────────────
router.post('/job/:jobId/reject', authenticate, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { reason = 'Review remarks not provided' } = req.body;

    const worksheet = await ServiceWorksheet.findOne({ jobId });
    if (!worksheet) {
      return res.status(404).json({ success: false, message: 'Worksheet not found' });
    }

    // Set back to in_progress so technician can fix details
    worksheet.status = 'in_progress';
    worksheet.additionalComments = `${worksheet.additionalComments || ''}\n[REJECTION REMARKS]: ${reason}`.trim();
    await worksheet.save();

    // Send Notification to Technician
    const io = getIo(req);
    if (worksheet.technicianId) {
      await notificationService.createNotification(
        worksheet.technicianId.toString(),
        'Worksheet Rejected',
        `Your worksheet for Booking #${worksheet.bookingId} was rejected. Reason: ${reason}`,
        'worksheet_rejected',
        io,
        { jobId: jobId }
      );
    }

    return res.json({ success: true, message: 'Worksheet rejected. Status set back to IN_PROGRESS.', data: worksheet });
  } catch (err) {
    next(err);
  }
});

// ─── POST: APPROVE ADDITIONAL CHARGES (CLIENT ONLY) ─────────────────────────
router.post('/job/:jobId/approve-additional', authenticate, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const worksheet = await ServiceWorksheet.findOne({ jobId });
    if (!worksheet) {
      return res.status(404).json({ success: false, message: 'Worksheet not found' });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Verify it is the booking client
    if (job.client && job.client.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to approve charges for this booking' });
    }

    job.additionalChargesStatus = 'approved';
    const oldPrice = job.price || 0;
    const newPrice = worksheet.totalCost || 0;
    job.additionalCharges = Math.max(newPrice - oldPrice, 0);
    job.price = newPrice;
    job.amount = newPrice;
    job.remainingAmount = Math.max(newPrice - (job.advanceAmount || 0), 0);
    await job.save();

    const io = getIo(req);
    if (io) {
      io.emit('additionalChargesApproved', { jobId, totalCost: newPrice });
    }

    return res.json({ success: true, message: 'Additional charges approved successfully', data: job });
  } catch (err) {
    next(err);
  }
});

// ─── POST: REJECT ADDITIONAL CHARGES (CLIENT ONLY) ─────────────────────────
router.post('/job/:jobId/reject-additional', authenticate, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Verify it is the booking client
    if (job.client && job.client.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to reject charges for this booking' });
    }

    job.additionalChargesStatus = 'rejected';
    await job.save();

    const io = getIo(req);
    if (io) {
      io.emit('additionalChargesRejected', { jobId });
    }

    return res.json({ success: true, message: 'Additional charges rejected successfully', data: job });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
