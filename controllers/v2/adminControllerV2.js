const User = require('../../models/User');
const Lead = require('../../models/Lead');
const Job = require('../../models/Job');
const Review = require('../../models/Review');
const Attendance = require('../../models/Attendance');
const Career = require('../../models/Career');
const Payment = require('../../models/Payment');
const Address = require('../../models/Address');
const ServiceWorksheet = require('../../models/ServiceWorksheet');
const CourseInquiry = require('../../models/CourseInquiry');

function getV2Metadata(job) {
  if (!job?.v2Metadata) return {};
  if (job.v2Metadata instanceof Map) return Object.fromEntries(job.v2Metadata);
  return job.v2Metadata;
}

function formatServiceRequest(job, { address = null, payment = null, lead = null } = {}) {
  const client = job.client || {};
  const tech = job.assignedTechnician || {};
  const cctv = job.cctvDetails || {};
  const priceBreakdown = cctv.priceBreakdown || {};
  const meta = getV2Metadata(job);
  const selectedMaterials = cctv.selectedMaterials || cctv.addons || [];
  const labourCharges = priceBreakdown.baseCharge || priceBreakdown.areaCharge || 0;
  const totalAmount = priceBreakdown.grandTotal || job.totalAmount || job.amount || job.price || 0;
  const addr = address && typeof address === 'object' ? address : null;

  return {
    id: job._id,
    customerName: client.name || job.customerName || 'Customer',
    customerPhone: client.phone || job.customerPhone || '',
    customerEmail: client.email || '',
    userId: client._id || job.userId || job.client || null,
    serviceName: job.serviceName || job.title || 'Service',
    serviceId: job.serviceId || '',
    serviceCategory: cctv.category?.name || '',
    serviceSubcategory: cctv.subcategory?.name || '',
    selectedMaterials,
    labourCharges,
    totalAmount,
    grandTotal: totalAmount,
    description: job.description || cctv.notes || '',
    cctvDetails: cctv || null,
    address: addr?.address || addr?.addressLine1 || job.location || '',
    city: addr?.city || '',
    state: addr?.state || '',
    pincode: addr?.pincode || '',
    mapLink: addr?.googleMapLink || job.googleMapsLink || cctv.mapLink || '',
    addressId: addr?._id || job.addressId?._id || job.addressId || null,
    date: job.bookingDate || job.scheduledDate || '',
    timeSlot: job.timeSlot || job.scheduledTime || '',
    paymentStatus: job.paymentStatus || 'pending',
    razorpayOrderId: payment?.razorpayOrderId || job.orderId || '',
    razorpayPaymentId: payment?.razorpayPaymentId || job.paymentId || '',
    amountPaid: ['paid', 'verified'].includes(payment?.status)
      ? Math.round((payment.amount || 0) / 100)
      : (job.advancePaid ? job.advanceAmount : 0),
    advancePaid: job.advancePaid || false,
    advanceAmount: job.advanceAmount || 0,
    remainingAmount: job.remainingAmount || 0,
    bookingId: job.bookingId || job.bookingNumber || '',
    bookingNumber: job.bookingNumber || '',
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    status: job.status,
    technicianName: tech.name || null,
    technicianId: tech._id || job.technicianId || null,
    internalNotes: meta.internalNotes || meta.notes || cctv.notes || '',
    priority: meta.priority || lead?.priority || 'medium',
    tags: meta.tags || '',
    lead: lead ? { id: lead._id, leadId: lead.leadId, status: lead.status } : null,
  };
}

function buildServiceRequestQuery(req) {
  const query = { useNewFlow: true };
  if (req.query.status && req.query.status !== 'all') query.status = req.query.status;
  if (req.query.paymentStatus && req.query.paymentStatus !== 'all') query.paymentStatus = req.query.paymentStatus;
  if (req.query.cctvCategory && req.query.cctvCategory !== 'all') query['cctvDetails.category.slug'] = req.query.cctvCategory;
  if (req.query.cctvSubcategory && req.query.cctvSubcategory !== 'all') query['cctvDetails.subcategory.slug'] = req.query.cctvSubcategory;
  if (req.query.cameraType && req.query.cameraType !== 'all') query['cctvDetails.cameraType.slug'] = req.query.cameraType;
  return query;
}

async function fetchLeadForJob(job) {
  const orConditions = [];
  if (job.client?.phone) orConditions.push({ phone: job.client.phone });
  if (job.customerPhone) orConditions.push({ phone: job.customerPhone });
  if (job.client?.email) orConditions.push({ email: job.client.email });
  if (!orConditions.length) return null;
  return Lead.findOne({ $or: orConditions, isDeleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
}

/**
 * Bookings (v2 service requests) — legacy alias
 */
async function getBookings(req, res, next) {
  return getServiceRequests(req, res, next);
}

/**
 * Service Requests — list with populated related data
 */
async function getServiceRequests(req, res, next) {
  try {
    const bookings = await Job.find(buildServiceRequestQuery(req))
      .sort({ createdAt: -1 })
      .populate('client', 'name phone email')
      .populate('assignedTechnician', 'name email specialty')
      .populate('addressId')
      .lean();

    const jobIds = bookings.map((b) => b._id);
    const payments = await Payment.find({ jobId: { $in: jobIds } }).sort({ createdAt: -1 }).lean();
    const paymentMap = {};
    for (const p of payments) {
      const key = String(p.jobId);
      if (!paymentMap[key]) paymentMap[key] = p;
    }

    return res.json({
      success: true,
      data: bookings.map((b) => formatServiceRequest(b, {
        address: b.addressId || null,
        payment: paymentMap[String(b._id)] || null,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Service Request — single record with full related data
 */
async function getServiceRequestById(req, res, next) {
  try {
    const job = await Job.findOne({ _id: req.params.id, useNewFlow: true })
      .populate('client', 'name phone email')
      .populate('assignedTechnician', 'name email specialty')
      .populate('addressId')
      .lean();

    if (!job) return res.status(404).json({ success: false, message: 'Service request not found' });

    const [payment, lead] = await Promise.all([
      Payment.findOne({ jobId: job._id }).sort({ createdAt: -1 }).lean(),
      fetchLeadForJob(job),
    ]);

    return res.json({
      success: true,
      data: formatServiceRequest(job, { address: job.addressId, payment, lead }),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Dashboard Stats
 */
async function getDashboard(req, res, next) {
  try {
    const [userCounts, jobCounts, leadsCount, liveTechnicians, pendingRequests, paymentQueue, reviews, revenueAgg, upcomingJobs, penaltyAgg] = await Promise.all([
      User.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      Job.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Lead.countDocuments({ isDeleted: { $ne: true } }),
      User.find({ role: 'technician', isOnline: true, isDeleted: { $ne: true } }).limit(5).lean(),
      Job.find({ status: { $in: ['completion_requested', 'pending_approval'] } }).limit(5).populate('assignedTechnician', 'name').lean(),
      Job.find({ paymentStatus: 'verification_pending' }).limit(5).lean(),
      Review.find().limit(5).populate('technicianId', 'name').sort({ createdAt: -1 }).lean()
      ,
      Payment.aggregate([
        { $match: { status: { $in: ['paid', 'verified'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Job.find({ status: { $in: ['confirmed', 'assigned', 'travelling', 'arrived'] } }).limit(5).populate('assignedTechnician', 'name').lean(),
      User.aggregate([
        { $unwind: '$penalties' },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$penalties.amount' } } }
      ])
    ]);

    const usersByRole = userCounts.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const jobsByStatus = jobCounts.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const totalJobs = Object.values(jobsByStatus).reduce((a, b) => a + b, 0);

    return res.json({
      success: true,
      data: {
        summary: {
          totalLeads: leadsCount,
          totalUsers: Object.values(usersByRole).reduce((a, b) => a + b, 0),
          totalBookings: totalJobs,
          totalRevenue: Math.round((revenueAgg[0]?.total || 0) / 100),
          totalJobs,
          completedJobs: (jobsByStatus.completed || 0) + (jobsByStatus.payment_done || 0),
          activeTechnicians: liveTechnicians.length,
          approvalQueue: pendingRequests.length,
          paymentQueue: paymentQueue.length,
          pendingPayments: paymentQueue.length,
          upcomingJobs: upcomingJobs.length,
          pendingRequests: jobsByStatus.pending || 0,
          assignedJobs: jobsByStatus.assigned || 0,
          inProgressJobs: (jobsByStatus.started || 0) + (jobsByStatus.in_progress || 0) + (jobsByStatus.work_uploaded || 0) + (jobsByStatus.travelling || 0) + (jobsByStatus.arrived || 0) + (jobsByStatus.accepted || 0),
          cancelledJobs: jobsByStatus.cancelled || 0,
          penalties: penaltyAgg[0]?.count || 0,
          penaltiesAmount: penaltyAgg[0]?.totalAmount || 0,
        },
        usersByRole,
        jobsByStatus,
        recentJobs: (await Job.find().sort({ createdAt: -1 }).limit(5).populate('assignedTechnician', 'name').lean()).map(j => ({
          id: j._id,
          customerName: j.customerName,
          title: j.title,
          location: j.location,
          status: j.status,
          technicianName: j.assignedTechnician?.name,
          createdAt: j.createdAt
        })),
        liveTechnicians: liveTechnicians.map(t => ({
          id: t._id,
          name: t.name,
          status: t.isOnline ? 'Available' : 'Offline',
          specialty: t.specialty
        })),
        pendingRequests: pendingRequests.map(j => ({
          id: j._id,
          customerName: j.customerName,
          technicianName: j.assignedTechnician?.name
        })),
        paymentRequests: paymentQueue.map(j => ({
          id: j._id,
          customerName: j.customerName,
          amount: j.amount
        })),
        recentReviews: reviews.map(r => ({
          id: r._id,
          technicianName: r.technicianId?.name,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt
        }))
        ,
        upcomingJobs: upcomingJobs.map(j => ({
          id: j._id,
          customerName: j.customerName,
          title: j.title,
          status: j.status,
          technicianName: j.assignedTechnician?.name,
          bookingDate: j.bookingDate,
          timeSlot: j.timeSlot,
        })),
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getAddresses(req, res, next) {
  try {
    const data = await Address.find()
      .populate('userId', 'name phone mobileNumber email')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: data.map((item) => ({
      id: item._id,
      customerName: item.userId?.name || 'Customer',
      phone: item.userId?.phone || item.userId?.mobileNumber || '',
      email: item.userId?.email || '',
      address: [item.addressLine1, item.addressLine2, item.landmark].filter(Boolean).join(', '),
      city: item.city,
      state: item.state,
      pincode: item.pincode,
      isDefault: item.isDefault,
      createdAt: item.createdAt,
    })) });
  } catch (err) { next(err); }
}

/**
 * Leads Management
 */
async function getLeads(req, res, next) {
  try {
    const leads = await Lead.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });
    return res.json({ success: true, data: leads });
  } catch (err) {
    next(err);
  }
}

async function updateLead(req, res, next) {
  try {
    const { status, lostReason } = req.body;
    if (status === 'Lost' && (!lostReason || lostReason.trim() === '')) {
      return res.status(400).json({ success: false, message: 'lostReason is required when lead status is Lost' });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    let jobCreated = false;
    if ((status === 'Won' || status === 'Project Created') && lead.status !== 'Won' && lead.status !== 'Project Created') {
      // Find or create Client User
      let clientUser = await User.findOne({ mobileNumber: lead.phone });
      if (!clientUser) {
        const password = Math.random().toString(36).substring(2, 10);
        clientUser = await User.create({
          name: lead.name,
          mobileNumber: lead.phone,
          email: lead.email || undefined,
          password,
          role: 'client',
          userType: 'web_user',
        });
      }

      const existingJob = await Job.findOne({ client: clientUser._id, title: lead.requiredService || 'Lead Project' });
      if (!existingJob) {
        // Create address for customer
        let addr = await Address.findOne({ userId: clientUser._id });
        if (!addr && lead.address) {
          addr = await Address.create({
            userId: clientUser._id,
            address: lead.address,
            pincode: lead.pincode || '',
          });
        }

        await Job.create({
          title: lead.requiredService || 'Service Project',
          description: lead.remarks || `Created from Lead ID: ${lead.leadId}`,
          customerName: lead.name,
          customerPhone: lead.phone,
          location: lead.address || '',
          addressId: addr ? addr._id : null,
          price: lead.budget || 0,
          amount: lead.budget || 0,
          status: 'pending',
          client: clientUser._id,
          useNewFlow: true,
        });
        jobCreated = true;
      }
      
      if (status === 'Won') {
        req.body.status = 'Project Created';
      }
    }

    Object.assign(lead, req.body);
    await lead.save();

    return res.json({ success: true, data: lead, jobCreated });
  } catch (err) {
    next(err);
  }
}

async function deleteLead(req, res, next) {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    return res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function createLead(req, res, next) {
  try {
    const { name, email, phone, pincode, status, service, plan, lostReason } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name is required' });
    if (status === 'Lost' && (!lostReason || lostReason.trim() === '')) {
      return res.status(400).json({ success: false, message: 'lostReason is required when lead status is Lost' });
    }
    const lead = await Lead.create({
      name: name.trim(),
      email: email?.toLowerCase().trim() || undefined,
      phone: phone?.trim() || '',
      pincode: pincode ? String(pincode).trim() : undefined,
      service: service?.trim() || undefined,
      plan: plan?.trim() || undefined,
      status: status || 'New',
      lostReason: lostReason || undefined,
    });
    return res.status(201).json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
}

/**
 * Customers Management
 */
const Customer = require('../../models/Customer');

async function getCustomers(req, res, next) {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: customers });
  } catch (err) {
    next(err);
  }
}

async function getCustomerById(req, res, next) {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    
    const userId = customer.userId || customer._id;

    // Fetch dynamic history
    const [addresses, bookings, payments, reviews, inquiries] = await Promise.all([
      Address.find({ userId }),
      Job.find({ client: userId }).populate('assignedTechnician', 'name email mobileNumber phone').sort({ createdAt: -1 }),
      Payment.find({ userId }).sort({ createdAt: -1 }),
      Review.find({ technicianId: { $ne: null } }).lean(),
      CourseInquiry.find({
        $or: [
          { email: customer.email },
          { phone: customer.mobileNumber }
        ]
      }).sort({ createdAt: -1 })
    ]);

    // Let's get worksheets for customer jobs
    const jobIds = bookings.map(b => b._id);
    const worksheets = await ServiceWorksheet.find({ jobId: { $in: jobIds } }).lean();

    // Filter reviews belonging to this customer's bookings
    const customerReviews = reviews.filter(r => 
      r.jobId && jobIds.map(id => id.toString()).includes(r.jobId.toString())
    );

    // Calculate Financial Summary
    let totalRevenue = 0;
    let pendingPayments = 0;
    let refunds = 0;

    payments.forEach(p => {
      const amountInRs = Math.round(p.amount / 100);
      if (['paid', 'verified', 'processing'].includes(p.status)) {
        totalRevenue += amountInRs;
      } else if (p.status === 'refunded') {
        refunds += amountInRs;
      }
    });

    bookings.forEach(j => {
      if (j.status !== 'cancelled' && ['pending', 'unpaid'].includes(j.paymentStatus || 'pending')) {
        pendingPayments += (j.price || j.amount || 0);
      }
    });

    // Build timeline events
    const timeline = [];

    // Account Created
    timeline.push({
      type: 'Account Created',
      date: customer.createdAt,
      description: `Customer account registered on platform.`
    });

    // Bookings Created
    bookings.forEach(b => {
      timeline.push({
        type: 'Booking Created',
        date: b.createdAt,
        description: `Booking for ${b.serviceName || b.title || 'Service'} created (Booking ID: ${b.bookingNumber || b.bookingId || b._id}).`
      });
      
      // If completed
      if (b.completedAt || b.status === 'completed') {
        timeline.push({
          type: 'Service Completed',
          date: b.completedAt || b.updatedAt,
          description: `Booking ${b.bookingNumber || b._id} was completed.`
        });
      }
    });

    // Payments Made
    payments.forEach(p => {
      timeline.push({
        type: 'Payment Made',
        date: p.createdAt,
        description: `Payment of ₹${Math.round(p.amount / 100)} initiated. Status: ${p.status.toUpperCase()}.`
      });
    });

    // Cancellations
    bookings.forEach(b => {
      if (b.status === 'cancelled') {
        timeline.push({
          type: 'Cancellation',
          date: b.cancellation?.cancelledAt || b.updatedAt,
          description: `Booking ${b.bookingNumber || b._id} cancelled. Reason: ${b.cancellation?.reason || 'Client request'}.`
        });
      }
    });

    // Ratings Submitted
    customerReviews.forEach(r => {
      timeline.push({
        type: 'Rating Submitted',
        date: r.createdAt || r.timestamp,
        description: `Submitted rating ★ ${r.rating} with review: "${r.comment || 'No comment left'}"`
      });
    });

    // Support Requests (Inquiries)
    inquiries.forEach(inq => {
      timeline.push({
        type: 'Support Request',
        date: inq.createdAt,
        description: `Inquiry message submitted: "${inq.message || ''}". Status: ${inq.status.toUpperCase()}.`
      });
    });

    // Sort timeline by date descending
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.json({
      success: true,
      data: {
        ...customer.toObject(),
        addresses,
        bookingHistory: bookings,
        paymentHistory: payments,
        feedbackHistory: customerReviews,
        worksheets,
        cancellationHistory: bookings.filter(b => b.status === 'cancelled').map(b => ({
          jobId: b._id,
          bookingNumber: b.bookingNumber || b.bookingId || b._id,
          reason: b.cancellation?.reason || 'Not provided',
          cancelledAt: b.cancellation?.cancelledAt || b.updatedAt,
          cancelledBy: b.cancellation?.cancelledBy || 'Unknown',
        })),
        financialSummary: {
          totalBookings: bookings.length,
          totalRevenueGenerated: totalRevenue,
          pendingPayments,
          refunds
        },
        timeline
      }
    });
  } catch (err) {
    next(err);
  }
}

async function createCustomer(req, res, next) {
  try {
    const { name, email, mobileNumber, phone, pincode, address } = req.body;
    const phoneNum = mobileNumber || phone;
    if (!name || !phoneNum) {
      return res.status(400).json({ success: false, message: 'name and mobileNumber are required' });
    }

    // Check if user already exists
    let user = await User.findOne({ mobileNumber: phoneNum.trim() });
    if (!user) {
      const password = Math.random().toString(36).substring(2, 10);
      user = await User.create({
        name: name.trim(),
        mobileNumber: phoneNum.trim(),
        email: email?.trim().toLowerCase() || undefined,
        password,
        role: 'client',
        userType: 'web_user',
      });
    }

    const customer = await Customer.findOne({ userId: user._id });
    if (customer) {
      return res.status(409).json({ success: false, message: 'Customer already exists' });
    }

    // Create address if specified
    let addressDoc = null;
    if (address) {
      addressDoc = await Address.create({
        userId: user._id,
        address,
        pincode: pincode || '',
      });
    }

    const newCustomer = await Customer.create({
      userId: user._id,
      name: name.trim(),
      mobileNumber: phoneNum.trim(),
      email: email?.trim().toLowerCase() || undefined,
      addresses: addressDoc ? [addressDoc._id] : [],
    });

    return res.status(201).json({ success: true, data: newCustomer });
  } catch (err) {
    next(err);
  }
}

async function updateCustomer(req, res, next) {
  try {
    const { name, email, mobileNumber } = req.body;
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    
    // Sync to User if linked
    if (customer.userId) {
      const updates = {};
      if (name) updates.name = name;
      if (email) updates.email = email;
      if (mobileNumber) updates.mobileNumber = mobileNumber;
      await User.findByIdAndUpdate(customer.userId, updates);
    }

    return res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
}

async function deleteCustomer(req, res, next) {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    return res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * Detailed Employee profile fetch
 */
async function getUserDetails(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found' });

    // Fetch dynamic performance metrics
    const [jobs, attendance, reviews] = await Promise.all([
      Job.find({ assignedTechnician: user._id }).sort({ createdAt: -1 }),
      Attendance.find({ userId: user._id }).sort({ date: -1 }),
      Review.find({ technicianId: user._id }).sort({ createdAt: -1 }),
    ]);

    // Calculate dynamic stats
    const completedJobsCount = jobs.filter(j => ['completed', 'closed', 'payment_done'].includes(j.status)).length;
    const totalEarnings = user.totalEarnings || 0;
    const activePenaltiesCount = user.penalties?.length || 0;

    return res.json({
      success: true,
      data: {
        ...user.toObject(),
        jobs,
        attendanceHistory: attendance,
        reviews,
        stats: {
          assignedJobs: jobs.length,
          completedJobs: completedJobsCount,
          totalEarnings,
          penalties: activePenaltiesCount,
          rating: user.rating || 5.0,
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * User Management
 */
async function getUsers(req, res, next) {
  try {
    const users = await User.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).select('-password');
    return res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const user = await User.create({ ...req.body, userType: 'member' });
    const safeUser = user.toSafeObject();
    return res.status(201).json({ success: true, data: { ...safeUser, password: req.body.password } });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * Jobs Management
 */
async function getJobs(req, res, next) {
  try {
    const jobs = await Job.find()
      .populate('assignedTechnician', 'name email specialty')
      .sort({ createdAt: -1 });
    return res.json({ success: true, data: jobs });
  } catch (err) {
    next(err);
  }
}

async function createJob(req, res, next) {
  try {
    const { title, customerName, customerPhone, location, technicianId, price, description, serviceType } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title is required' });
    const job = await Job.create({
      title: title.trim(),
      description: description?.trim() || '',
      customerName: customerName?.trim() || '',
      customerPhone: customerPhone?.trim() || '',
      location: location?.trim() || '',
      price: Number(price) || 0,
      amount: Number(price) || 0,
      serviceType: serviceType || 'installation',
      assignedTechnician: technicianId || null,
      assignedManager: req.user.id,
      status: technicianId ? 'assigned' : 'pending',
    });
    const populated = await Job.findById(job._id).populate('assignedTechnician', 'name email specialty').lean();
    return res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

async function updateJob(req, res, next) {
  try {
    console.log(`[updateJob] Updating job ID: ${req.params.id}`);
    console.log(`[updateJob] Request body:`, req.body);

    const allowedUpdates = {};
    const allowedFields = [
      'title',
      'description',
      'customerName',
      'customerPhone',
      'location',
      'assignedTechnician',
      'status',
      'price',
      'amount',
      'serviceType',
    ];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        allowedUpdates[field] = req.body[field];
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'technicianId')) {
      allowedUpdates.assignedTechnician = req.body.technicianId || null;
      if (req.body.technicianId && !allowedUpdates.status) {
        allowedUpdates.status = 'assigned';
      }
    }

    console.log(`[updateJob] Allowed updates:`, allowedUpdates);

    const job = await Job.findByIdAndUpdate(req.params.id, allowedUpdates, {
      new: true,
      runValidators: true,
    }).populate('assignedTechnician', 'name email specialty');

    console.log(`[updateJob] Job found:`, !!job);
    if (job) console.log(`[updateJob] Updated job status:`, job.status);

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    return res.json({ success: true, data: job });
  } catch (err) {
    console.error(`[updateJob] Error:`, err.message);
    next(err);
  }
}

async function deleteJob(req, res, next) {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    return res.json({ success: true, message: 'Job deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * Reviews
 */
async function getReviews(req, res, next) {
  try {
    const reviews = await Review.find()
      .populate('technicianId', 'name specialty')
      .sort({ createdAt: -1 });
    return res.json({
      success: true,
      data: reviews.map(r => ({
        id: r._id,
        technicianName: r.technicianId?.name || 'Unknown',
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Tracking
 */
async function getTracking(req, res, next) {
  try {
    const techs = await User.find({ role: 'technician', isDeleted: { $ne: true } })
      .select('name lat lng isOnline status updatedAt specialty');
    return res.json({
      success: true,
      data: techs.map(t => ({
        technicianId: t._id,
        name: t.name,
        lat: t.lat || 0,
        lng: t.lng || 0,
        isOnline: t.isOnline,
        status: t.status,
        specialty: t.specialty,
        lastUpdate: t.updatedAt
      }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Attendance
 */
async function getAttendance(req, res, next) {
  try {
    // Basic implementation - can be expanded with filters
    const users = await User.find({ role: { $in: ['technician', 'manager'] }, isDeleted: { $ne: true } })
      .select('name role status lastSeen');
    
    return res.json({
      success: true,
      data: users.map(u => ({
        id: u._id,
        name: u.name,
        role: u.role,
        status: u.isOnline ? 'Active' : 'Offline',
        loginTime: u.lastSeen,
      }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Requests & Approvals
 */
async function getCompletionRequests(req, res, next) {
  try {
    const jobs = await Job.find({ status: { $in: ['completion_requested', 'pending_approval'] } })
      .populate('assignedTechnician', 'name')
      .sort({ updatedAt: -1 });
    return res.json({
      success: true,
      data: jobs.map(j => ({
        id: j._id,
        customerName: j.customerName,
        serviceName: j.title,
        technicianName: j.assignedTechnician?.name,
        updatedAt: j.updatedAt,
        attachments: j.attachments || [],
        price: j.price,
        address: j.location
      }))
    });
  } catch (err) {
    next(err);
  }
}

async function updateCompletionRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { action } = req.body;
    console.log(`[V2] Update Completion Request - ID: ${id}, Action: ${action}`);

    if (!action) return res.status(400).json({ success: false, message: "Action required (approve/reject)" });

    let status = "";
    if (action === "approve") {
      status = "approved_by_manager";
    } else if (action === "reject") {
      status = "assigned"; // Return to assigned state for technician to fix
    } else {
      return res.status(400).json({ success: false, message: "Invalid action" });
    }

    const job = await Job.findByIdAndUpdate(id, { status }, { new: true });
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    
    return res.status(200).json({
      success: true,
      message: `Request ${action}d successfully`,
      data: job
    });
  } catch (err) {
    console.error("[V2] Completion Update Error:", err);
    next(err);
  }
}

async function getPaymentRequests(req, res, next) {
  try {
    const jobs = await Job.find({ paymentStatus: 'verification_pending' })
      .populate('assignedTechnician', 'name')
      .sort({ updatedAt: -1 });
    return res.json({
      success: true,
      data: jobs.map(j => ({
        id: j._id,
        customerName: j.customerName,
        customerPhone: j.customerPhone,
        serviceName: j.title,
        amount: j.amount,
        technicianName: j.assignedTechnician?.name,
        paymentId: j.paymentId,
        paymentStatus: j.paymentStatus
      }))
    });
  } catch (err) {
    next(err);
  }
}

async function updatePaymentRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { action } = req.body;
    console.log(`[V2] Update Payment Request - ID: ${id}, Action: ${action}`);

    if (!action) return res.status(400).json({ success: false, message: "Action required (approve/reject)" });

    const paymentStatus = action === 'approve' ? 'paid' : 'rejected';
    const updates = { paymentStatus };
    if (action === 'approve') updates.status = 'completed';
    
    const job = await Job.findByIdAndUpdate(id, updates, { new: true });
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    
    return res.status(200).json({
      success: true,
      message: `Payment ${action}d successfully`,
      data: job
    });
  } catch (err) {
    console.error("[V2] Payment Update Error:", err);
    next(err);
  }
}

async function assignBooking(req, res, next) {
  try {
    const { id } = req.params;
    const { technicianId } = req.body;

    if (!technicianId) {
      return res.status(400).json({ success: false, message: 'technicianId is required' });
    }

    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const technician = await User.findOne({ _id: technicianId, role: 'technician' });
    if (!technician) return res.status(404).json({ success: false, message: 'Technician not found' });

    job.assignedTechnician = technicianId;
    job.assignedManager = req.user.id;
    job.status = 'assigned';
    await job.save();

    // Notify technician
    const notificationService = require('../../services/notificationService');
    const io = req.app.get('io');
    io.to(technicianId.toString()).emit('bookingAssigned', job);
    await notificationService.createNotification(
      technicianId,
      'New Job Assigned',
      `You have a new service request: ${job.serviceName || job.title}${job.bookingDate ? ' on ' + job.bookingDate : ''} at ${job.timeSlot || 'TBD'}`,
      'job_assigned',
      io
    );

    return res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

async function updateServiceRequest(req, res, next) {
  try {
    const { id } = req.params;
    const job = await Job.findOne({ _id: id, useNewFlow: true });
    if (!job) return res.status(404).json({ success: false, message: 'Service request not found' });

    const {
      customerName,
      customerPhone,
      customerEmail,
      status,
      technicianId,
      assignedTechnician,
      date,
      bookingDate,
      timeSlot,
      address,
      city,
      state,
      pincode,
      mapLink,
      internalNotes,
      priority,
      tags,
      paymentStatus,
    } = req.body;

    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }
    if (customerPhone && customerPhone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ success: false, message: 'Phone must be at least 10 digits' });
    }

    if (customerName !== undefined) job.customerName = String(customerName).trim();
    if (customerPhone !== undefined) job.customerPhone = String(customerPhone).trim();
    if (status !== undefined) job.status = status;
    if (paymentStatus !== undefined) job.paymentStatus = paymentStatus;

    const techId = technicianId ?? assignedTechnician;
    if (techId !== undefined) {
      job.assignedTechnician = techId || null;
      job.technicianId = techId || null;
    }

    const schedDate = bookingDate ?? date;
    if (schedDate !== undefined) job.bookingDate = schedDate;
    if (timeSlot !== undefined) job.timeSlot = timeSlot;
    if (address !== undefined) job.location = address;
    if (mapLink !== undefined) job.googleMapsLink = mapLink;

    const meta = getV2Metadata(job);
    if (internalNotes !== undefined) meta.internalNotes = internalNotes;
    if (priority !== undefined) meta.priority = priority;
    if (tags !== undefined) meta.tags = tags;
    job.v2Metadata = meta;
    job.markModified('v2Metadata');

    await job.save();

    if (job.client && (customerName || customerPhone || customerEmail)) {
      const userUpdates = {};
      if (customerName !== undefined) userUpdates.name = customerName;
      if (customerPhone !== undefined) userUpdates.phone = customerPhone;
      if (customerEmail !== undefined) userUpdates.email = customerEmail;
      await User.findByIdAndUpdate(job.client, userUpdates);
    }

    if (job.addressId) {
      const addrUpdates = {};
      if (address !== undefined) {
        addrUpdates.address = address;
        addrUpdates.addressLine1 = address;
      }
      if (city !== undefined) addrUpdates.city = city;
      if (state !== undefined) addrUpdates.state = state;
      if (pincode !== undefined) addrUpdates.pincode = pincode;
      if (mapLink !== undefined) addrUpdates.googleMapLink = mapLink;
      if (Object.keys(addrUpdates).length) {
        await Address.findByIdAndUpdate(job.addressId, addrUpdates);
      }
    } else if (address || city || state || pincode || mapLink) {
      const ownerId = job.client || job.userId;
      if (ownerId) {
        const newAddr = await Address.create({
          userId: ownerId,
          address: address || job.location || '',
          addressLine1: address || job.location || '',
          city: city || '',
          state: state || '',
          pincode: pincode || '',
          googleMapLink: mapLink || '',
        });
        job.addressId = newAddr._id;
        await job.save();
      }
    }

    const updated = await Job.findById(id)
      .populate('client', 'name phone email')
      .populate('assignedTechnician', 'name email specialty')
      .populate('addressId')
      .lean();

    const [payment, lead] = await Promise.all([
      Payment.findOne({ jobId: id }).sort({ createdAt: -1 }).lean(),
      fetchLeadForJob(updated),
    ]);

    return res.json({
      success: true,
      message: 'Service request updated successfully',
      data: formatServiceRequest(updated, { address: updated.addressId, payment, lead }),
    });
  } catch (err) {
    next(err);
  }
}

async function deleteServiceRequest(req, res, next) {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Service request not found' });
    return res.json({ success: true, message: 'Service request deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * Change User Password (Admin action)
 */
async function changeUserPassword(req, res, next) {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    const user = await User.findById(id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.password = newPassword; // Will be hashed by pre-save hook
    await user.save();

    return res.json({
      success: true,
      message: `Password changed successfully for ${user.name || 'user'}`,
    });
  } catch (err) {
    next(err);
  }
}

async function getApplications(req, res, next) {
  try {
    const applications = await Career.find().sort({ createdAt: -1 });
    res.json({ success: true, data: applications });
  } catch (err) {
    next(err);
  }
}

async function updateApplicationStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const application = await Career.findByIdAndUpdate(id, { status }, { new: true });
    if (!application) return res.status(404).json({ success: false, message: 'Application not found' });
    res.json({ success: true, message: `Status updated to ${status}`, data: application });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBookings,
  getServiceRequests,
  getServiceRequestById,
  assignBooking,
  getDashboard,
  getLeads,
  createLead,
  updateLead,
  deleteLead,
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getUserDetails,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getJobs,
  createJob,
  updateJob,
  deleteJob,
  getReviews,
  getTracking,
  getAttendance,
  getAddresses,
  getCompletionRequests,
  updateCompletionRequest,
  getPaymentRequests,
  updatePaymentRequest,
  updateServiceRequest,
  deleteServiceRequest,
  changeUserPassword,
  getApplications,
  updateApplicationStatus,
};
