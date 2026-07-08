const mongoose = require('mongoose');
const jobService = require('../services/jobService');
const Job = require('../models/Job');
const notificationService = require('../services/notificationService');

async function listJobs(req, res, next) {
  try {
    const { role, id } = req.user;
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = {};
    if (role === 'manager') {
      query.assignedManager = id;
    } else if (role === 'technician') {
      query.assignedTechnician = id;
    }
    
    if (status) {
      if (status === 'active') {
        query.status = { $ne: 'completed' };
      } else {
        query.status = status;
      }
    }

    const { jobs, total } = await jobService.listJobs(query, page, limit);

    return res.json({
      success: true,
      data: jobs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getJobDetails(req, res, next) {
  try {
    const { id: jobId } = req.params;
    const job = await Job.findById(jobId)
      .populate('assignedTechnician', 'name email role phone status')
      .populate('assignedManager', 'name email role phone');

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (req.user.role === 'manager' && job.assignedManager && job.assignedManager.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (req.user.role === 'technician' && job.assignedTechnician && job.assignedTechnician._id.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const otpRecord = await mongoose.model('OtpVerification').findOne({
      $or: [
        { bookingId: job._id, purpose: 'start_job', used: false, expiresAt: { $gt: new Date() } },
        { email: jobId.toString(), purpose: 'start_job', used: false, expiresAt: { $gt: new Date() } }
      ]
    }).lean();

    const jobObj = job.toObject();
    jobObj.startJobOtp = otpRecord ? otpRecord.otp : null;

    return res.json({
      success: true,
      data: jobObj,
    });
  } catch (err) {
    next(err);
  }
}

async function createJob(req, res, next) {
  try {
    const jobData = { ...req.body, assignedManager: req.user.id };
    if (!jobData.title) return res.status(400).json({ success: false, message: 'Title is required' });
    if (!Number.isFinite(Number(jobData.amount ?? jobData.price ?? 0)) || Number(jobData.amount ?? jobData.price ?? 0) <= 0) {
      return res.status(400).json({ success: false, message: 'A valid amount is required' });
    }

    const job = await jobService.createJob(jobData);
    return res.status(201).json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

async function assignJob(req, res, next) {
  try {
    const { jobId, technicianId } = req.body;
    if (!jobId || !technicianId) return res.status(400).json({ success: false, message: 'jobId and technicianId are required' });

    const job = await jobService.assignTechnician(jobId, technicianId, req.user.id);
    
    const io = req.app.get('io');
    await notificationService.createNotification(
      technicianId,
      'New Job Assigned',
      `You have been assigned a new project: ${job.title}`,
      'job_assigned',
      io
    );

    return res.json({ success: true, message: 'Technician assigned successfully', data: job });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updateJobStatus(req, res, next) {
  try {
    const { id: jobId } = req.params;
    let { status, attachments } = req.body;
    
    // Auto-map legacy statuses
    const statusMap = {
      'inProgress': 'started',
      'in_progress': 'started',
      'pendingApproval': 'completion_requested',
      'pending_approval': 'completion_requested',
      'workUploaded': 'work_uploaded',
      'completionRequested': 'completion_requested',
      'approvedByManager': 'approved_by_manager',
      'paymentRequested': 'payment_requested',
      'paymentPending': 'payment_pending',
      'paymentDone': 'payment_done',
    };
    if (statusMap[status]) status = statusMap[status];

    const { JOB_STATUSES } = require('../models/Job');
    if (!status || !JOB_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: `Invalid status: ${status}` });
    }

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // Authorization & Rules
    if (req.user.role === 'technician') {
        if (job.assignedTechnician?.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not assigned to this job' });
        }
        
        // Technician can only set specific statuses
        const techAllowed = ['started', 'work_uploaded', 'completion_requested', 'payment_done', 'travelling', 'arrived', 'accepted'];
        if (!techAllowed.includes(status)) {
            return res.status(403).json({ success: false, message: 'Technician cannot move job to this status' });
        }
        
        // Handling Work Upload
        if (status === 'work_uploaded') {
            if (attachments && Array.isArray(attachments)) {
                job.attachments = attachments;
            }
        }
    } else if (req.user.role === 'manager' || req.user.role === 'admin') {
        // Manager can set to approved or payment pending
        if (status === 'approved_by_manager') {
            // Unlocks payment
        }
    } else {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Auto complete if payment done
    if (status === 'payment_done') {
        status = 'completed';
    }

    if (status === 'completed') {
      const ServiceWorksheet = require('../models/ServiceWorksheet');
      const worksheet = await ServiceWorksheet.findOne({ jobId });
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

    job.status = status;
    if (status === 'completed') {
      job.completedAt = new Date();
    }

    await job.save();

    const io = req.app.get('io');
    // Notify customer
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
        { jobId: jobId.toString() }
      );
    }

    if (req.user.role === 'technician') {
        if (job.assignedManager) {
            await notificationService.createNotification(
                job.assignedManager.toString(),
                'Job Update',
                `Technician updated job status to ${status}`,
                'status_update',
                io,
                { jobId: jobId.toString() }
            );
        }
    } else {
        if (job.assignedTechnician) {
            await notificationService.createNotification(
                job.assignedTechnician.toString(),
                'Job Update',
                `Manager updated job status to ${status}`,
                'status_update',
                io,
                { jobId: jobId.toString() }
            );
        }
    }

    return res.json({ success: true, message: `Job status updated to ${status}`, data: job });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listJobs,
  getJobDetails,
  createJob,
  assignJob,
  updateJobStatus,
};
