const User = require('../models/User');
const Job = require('../models/Job');
const Review = require('../models/Review');
const Expense = require('../models/Expense');
const Lead = require('../models/Lead');
const { signToken } = require('../utils/jwt');
const { markAttendance } = require('./v2/attendanceControllerV2');

/**
 * POST /admin/login — same as auth login but only succeeds if role is admin.
 */
async function adminLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user || user.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }

    const token = signToken(user._id, user.role);
    
    // Auto-mark attendance for admin login
    await markAttendance(user._id);

    // Activate session to bypass daily session check in middleware
    user.sessionActive = true;
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save({ validateBeforeSave: false }); // Bypass validation for missing mobileNumber if any

    user.password = undefined;

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
    const users = await User.find().sort({ createdAt: -1 }).lean();
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
    const technicians = await User.find({ role: 'technician' }).sort({ createdAt: -1 }).lean();
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
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, email, and password are required',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: 'manager',
      phone,
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
    const { name, email, password, phone, specialty, assignedManager } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, email, and password are required',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: 'technician',
      phone,
      specialty,
      assignedManager: assignedManager || null,
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
