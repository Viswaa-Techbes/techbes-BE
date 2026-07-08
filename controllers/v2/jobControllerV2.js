const jobServiceV2 = require('../../services/jobServiceV2');
const notificationService = require('../../services/notificationService');
const User = require('../../models/User');
const Job = require('../../models/Job');

// ─── Business logic: resolve module from serviceType ──────────────────────────
function resolveModule(serviceType) {
  if (serviceType === 'installation') return 'project';
  if (serviceType === 'repair') return 'service_request';
  return 'general';
}

// ─── Create Booking ──────────────────────────────────────────────────────────
async function createBooking(req, res, next) {
  try {
    const { serviceType } = req.body;
    const module = resolveModule(serviceType);

    const job = await jobServiceV2.createBookingV2({
      ...req.body,
      module,
      clientId: req.user?.id || null,
    });

    const io = req.app.get('io');
    io.emit('newBooking', { ...(job.toObject ? job.toObject() : job), module });

    // Notify all admins
    const admins = await User.find({ role: 'admin', isDeleted: { $ne: true } }).select('_id');
    await Promise.allSettled(admins.map(admin =>
      notificationService.createNotification(
        admin._id,
        'New Booking Request',
        `New ${module === 'project' ? 'installation project' : 'service request'}: ${job.serviceName || job.title} on ${job.bookingDate || 'TBD'} at ${job.timeSlot || 'TBD'}`,
        'booking_confirmed',
        io,
        {
          bookingId: job._id ? job._id.toString() : '',
          serviceName: job.serviceName || job.title,
          date: job.bookingDate,
          timeSlot: job.timeSlot,
          address: job.location,
          module,
        }
      )
    ));

    // Notify booking client (if authenticated)
    if (req.user && req.user.id) {
      await notificationService.createNotification(
        req.user.id,
        'Booking Requested',
        `Your booking request for ${job.serviceName || job.title} has been received. Please complete the advance payment to confirm the booking.`,
        'booking_requested',
        io,
        {
          bookingId: job._id ? job._id.toString() : '',
          serviceName: job.serviceName || job.title,
          date: job.bookingDate,
          timeSlot: job.timeSlot,
          address: job.location,
        }
      );
    }
    // Trigger auto-dispatch in the background
    setImmediate(async () => {
      try {
        console.log(`[jobControllerV2] Triggering auto-dispatch for job ${job._id}`);
        const dispatchService = require('../../services/dispatchService');
        const io = req.app.get('io') || global._socketIo || null;
        const dispatchResult = await dispatchService.autoAssignTechnician(job._id, io);
        console.log(`[jobControllerV2] Dispatch result for job ${job._id}:`, dispatchResult.method || dispatchResult.reason);
      } catch (dispatchErr) {
        console.error('[jobControllerV2] Auto-dispatch failed (non-critical):', dispatchErr.message);
      }
    });

    res.status(201).json({ success: true, data: job, module });
  } catch (err) {
    next(err);
  }
}

// ─── Assign Job to Technician ────────────────────────────────────────────────
async function assignById(req, res, next) {
  try {
    const { id } = req.params;
    const { technicianId } = req.body;

    if (!technicianId) {
      return res.status(400).json({ success: false, message: 'technicianId is required' });
    }

    const job = await jobServiceV2.assignBookingV2(id, technicianId, req.user.id);
    const technician = await User.findById(technicianId).select('name email phone mobileNumber').lean();

    const io = req.app.get('io');
    io.to(technicianId).emit('bookingAssigned', job);

    // Notify technician via all channels
    await notificationService.createNotification(
      technicianId,
      'New Job Assigned',
      `You have a new service request: ${job.serviceName || job.title}${job.bookingDate ? ` on ${job.bookingDate}` : ''} at ${job.timeSlot || 'TBD'}`,
      'job_assigned_tech',
      io,
      {
        serviceName: job.serviceName || job.title,
        customerName: job.customerName,
        address: job.location,
        date: job.bookingDate,
        timeSlot: job.timeSlot,
        technicianName: technician ? technician.name : '',
      }
    );

    // Notify client that technician is assigned
    if (job.client) {
      io.to(job.client.toString()).emit('technicianAssigned', {
        jobId: job._id,
        technicianName: technician ? technician.name : '',
      });
      await notificationService.createNotification(
        job.client,
        'Technician Assigned',
        `${technician ? technician.name : 'A technician'} has been assigned to your request.`,
        'technician_assigned',
        io,
        { technicianName: technician ? technician.name : '' }
      );
    }

    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

// ─── Legacy assign ────────────────────────────────────────────────────────────
async function assignBooking(req, res, next) {
  try {
    const { bookingId, technicianId } = req.body;
    const job = await jobServiceV2.assignBookingV2(bookingId, technicianId, req.user.id);

    const io = req.app.get('io');
    io.to(technicianId).emit('bookingAssigned', job);

    await notificationService.createNotification(
      technicianId,
      'New Job Assigned',
      `New job assigned: ${job.title}`,
      'job_assigned_tech',
      io,
      { serviceName: job.title, customerName: job.customerName, address: job.location }
    );

    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

// ─── Accept Job (Technician) ─────────────────────────────────────────────────
async function acceptJob(req, res, next) {
  try {
    const { id } = req.params;
    const job = await jobServiceV2.acceptJobV2(id, req.user.id);

    const io = req.app.get('io');
    if (job.client) {
      io.to(job.client.toString()).emit('technicianStarted', job);
      await notificationService.createNotification(
        job.client,
        'Technician On the Way',
        'Your technician has accepted the job and is on the way.',
        'job_started',
        io,
        { jobId: job._id ? job._id.toString() : '' }
      );
    }

    res.json({ success: true, msg: 'Job started', data: job });
  } catch (err) {
    next(err);
  }
}

// ─── Update Job Status ───────────────────────────────────────────────────────
async function updateJobStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    const VALID_STATUSES = [
      'pending', 'otp_verified', 'not_visited', 'site_visited', 'assigned', 'accepted',
      'travelling', 'arrived', 'working', 'in_progress', 'started', 'work_uploaded',
      'completion_requested', 'approved_by_manager', 'payment_requested', 'payment_pending',
      'payment_done', 'completed', 'closed'
    ];
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` });
    }

    if (status === 'completed' || status === 'payment_done') {
      const ServiceWorksheet = require('../../models/ServiceWorksheet');
      const worksheet = await ServiceWorksheet.findOne({ jobId: id });
      if (!worksheet) {
        return res.status(400).json({ success: false, message: 'Validation failed: Digital Service Worksheet is missing. Please create and submit a worksheet first.' });
      }
      if (worksheet.status === 'draft' || worksheet.status === 'in_progress') {
        return res.status(400).json({ success: false, message: 'Validation failed: Service Worksheet must be submitted before completing the job.' });
      }
      if (!worksheet.beforePhotos || worksheet.beforePhotos.length === 0) {
        return res.status(400).json({ success: false, message: 'Validation failed: Minimum 1 before photo must be uploaded in the worksheet.' });
      }
      if (!worksheet.afterPhotos || worksheet.afterPhotos.length === 0) {
        return res.status(400).json({ success: false, message: 'Validation failed: Minimum 1 after photo must be uploaded in the worksheet.' });
      }
      if (!worksheet.customerSignatureUrl) {
        return res.status(400).json({ success: false, message: 'Validation failed: Customer signature must be captured in the worksheet.' });
      }
    }

    const updates = { status };
    if (status === 'in_progress' || status === 'started') updates.startedAt = new Date();
    if (status === 'completed' || status === 'payment_done') updates.completedAt = new Date();

    const job = await Job.findByIdAndUpdate(id, updates, { new: true }).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const io = req.app.get('io');
    io.emit('jobStatusUpdated', { jobId: id, status, note });

    // Notify client and admin on key status changes
    const clientNotifyStatuses = ['site_visited', 'reached', 'arrived', 'travelling', 'in_progress', 'started', 'completion_requested', 'completed'];
    if (job.client && clientNotifyStatuses.includes(status)) {
      const statusMessages = {
        site_visited: 'Your technician has reached your location.',
        reached: 'Your technician has reached your location.',
        arrived: 'Your technician has arrived at your location.',
        travelling: 'Your technician has started traveling to your location.',
        in_progress: 'Your service has started.',
        started: 'Your service has started.',
        completion_requested: 'Technician has requested service completion. Awaiting approval.',
        completed: 'Your service request has been successfully completed!',
      };
      const statusTitles = {
        site_visited: 'Technician Reached Location',
        reached: 'Technician Reached Location',
        arrived: 'Technician Reached Location',
        travelling: 'Technician Started Travel',
        in_progress: 'Service Started',
        started: 'Service Started',
        completion_requested: 'Service Awaiting Approval',
        completed: 'Service Completed',
      };
      await notificationService.createNotification(
        job.client,
        statusTitles[status] || 'Job Status Update',
        statusMessages[status] || `Status updated to: ${status}`,
        status === 'completed' ? 'job_completed' : 'status_update',
        io,
        { jobId: id }
      );
    }

    // Also notify admins if technician updates status
    if (req.user && req.user.role === 'technician') {
      const adminNotifyStatuses = ['started', 'in_progress', 'completion_requested', 'completed'];
      if (adminNotifyStatuses.includes(status)) {
        const admins = await User.find({ role: { $in: ['admin', 'manager'] }, isDeleted: { $ne: true } }).select('_id');
        for (const admin of admins) {
          await notificationService.createNotification(
            admin._id,
            'Job Status Updated by Technician',
            `Technician has updated job "${job.serviceName || job.title}" status to: ${status.replace(/_/g, ' ').toUpperCase()}`,
            'dispatch_update',
            io,
            { jobId: id }
          );
        }
      }
    }

    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

// ─── Request Payment (Technician) ────────────────────────────────────────────
async function requestPayment(req, res, next) {
  try {
    const { id } = req.params;
    const { amount, description } = req.body;

    const job = await Job.findByIdAndUpdate(
      id,
      {
        paymentStatus: 'requested',
        status: 'payment_requested',
        ...(amount !== undefined ? { amount } : {}),
        paymentDescription: description || '',
      },
      { new: true }
    ).lean();

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const io = req.app.get('io');
    io.emit('paymentRequested', { jobId: id, amount: job.amount });

    // Notify admins
    const admins = await User.find({ role: { $in: ['admin', 'manager'] }, isDeleted: { $ne: true } }).select('_id');
    await Promise.allSettled(admins.map(a =>
      notificationService.createNotification(
        a._id,
        'Payment Request',
        `Payment of ₹${job.amount} requested for job: ${job.title}`,
        'payment_request',
        io,
        { jobId: id, amount: job.amount, customerName: job.customerName }
      )
    ));

    // Notify client
    if (job.client) {
      await notificationService.createNotification(
        job.client,
        'Payment Required',
        `Your service is complete. Payment of ₹${job.amount} is due.`,
        'payment_request',
        io,
        { jobId: id, amount: job.amount }
      );
    }

    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

// ─── List Bookings ────────────────────────────────────────────────────────────
async function listBookings(req, res, next) {
  try {
    const { status, module: mod } = req.query;
    const query = {};
    if (status) query.status = status;
    if (mod) query.module = mod;
    if (req.user.role === 'client') query.client = req.user.id;
    if (req.user.role === 'technician') query.assignedTechnician = req.user.id;

    const jobs = await jobServiceV2.listJobsV2(query);
    res.json({ success: true, data: jobs });
  } catch (err) {
    next(err);
  }
}

// ─── Upload Work Proof ────────────────────────────────────────────────────────
async function uploadWork(req, res, next) {
  try {
    const { id } = req.params;
    const { images } = req.body;

    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    job.attachments = images || [];
    job.status = 'completion_requested';
    await job.save();

    const io = req.app.get('io');
    if (job.assignedManager) {
      io.to(job.assignedManager.toString()).emit('completionRequested', job);
    }
    io.emit('completionRequested', { jobId: id });

    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createBooking,
  assignById,
  assignBooking,
  acceptJob,
  updateJobStatus,
  requestPayment,
  listBookings,
  uploadWork,
};
