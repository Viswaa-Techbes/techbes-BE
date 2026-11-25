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
const QuoteRequest = require('../../models/QuoteRequest');
const { recordAudit } = require('../../services/auditService');
const { validatePasswordStrength } = require('../../utils/passwordPolicy');

function getV2Metadata(job) {
  if (!job?.v2Metadata) return {};
  if (job.v2Metadata instanceof Map) return Object.fromEntries(job.v2Metadata);
  return job.v2Metadata;
}

function formatServiceRequest(job, { address = null, payment = null, lead = null, statusHistory = null, worksheet = null, expenses = null } = {}) {
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
    dispatchStatus: job.dispatchStatus || null,
    assignmentMethod: job.assignmentMethod || null,
    assignmentTime: job.assignmentTime || null,
    dispatchNote: job.dispatchNote || '',
    startedAt: job.startedAt || null,
    actualStartTime: job.actualStartTime || null,
    completedAt: job.completedAt || null,
    acceptedAt: job.acceptedAt || null,
    technicianName: tech.name || null,
    technicianId: tech._id || job.technicianId || null,
    internalNotes: meta.internalNotes || meta.notes || cctv.notes || '',
    priority: meta.priority || lead?.priority || 'medium',
    tags: meta.tags || '',
    lead: lead ? { id: lead._id, leadId: lead.leadId, status: lead.status } : null,
    statusHistory: statusHistory || [],
    worksheet: worksheet || null,
    expenses: expenses || [],
    beforePhotos: (worksheet?.beforePhotos && worksheet.beforePhotos.length) ? worksheet.beforePhotos : (job.beforePhotos || []),
    afterPhotos: (worksheet?.afterPhotos && worksheet.afterPhotos.length) ? worksheet.afterPhotos : (job.afterPhotos || []),
    duringPhotos: worksheet?.duringPhotos || [],
    customerSignature: worksheet?.customerSignatureUrl || job.customerSignature || '',
    technicianSignature: worksheet?.technicianSignatureUrl || job.technicianSignature || '',
    technicianObservations: worksheet?.technicianObservations || '',
    adminVerified: Boolean(job.adminVerified),
    verificationStatus: job.verificationStatus || (job.adminVerified ? 'verified' : 'pending'),
    verifiedBy: job.verifiedBy || null,
    verifiedAt: job.verifiedAt || null,
    verificationNote: job.verificationNote || '',
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
      .populate('assignedTechnician', 'name email specialty phone mobileNumber lat lng availabilityStatus')
      .populate('addressId')
      .lean();

    if (!job) return res.status(404).json({ success: false, message: 'Service request not found' });

    const JobStatusHistory = mongoose.model('JobStatusHistory');
    const ServiceWorksheet = mongoose.models.ServiceWorksheet || require('../../models/ServiceWorksheet');
    const Expense = mongoose.models.Expense || require('../../models/Expense');

    const [payment, lead, statusHistory, worksheet, expenses] = await Promise.all([
      Payment.findOne({ jobId: job._id }).sort({ createdAt: -1 }).lean(),
      fetchLeadForJob(job),
      JobStatusHistory.find({ jobId: job._id }).sort({ timestamp: 1 }).populate('changedBy', 'name role').lean(),
      ServiceWorksheet.findOne({ jobId: job._id }).lean(),
      Expense.find({ jobId: job._id }).sort({ date: -1 }).lean(),
    ]);

    return res.json({
      success: true,
      data: formatServiceRequest(job, {
        address: job.addressId,
        payment,
        lead,
        statusHistory,
        worksheet,
        expenses,
      }),
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
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

    const [
      userCounts,
      jobCounts,
      leadsCount,
      liveTechnicians,
      pendingRequests,
      paymentQueue,
      reviews,
      revenueAgg,
      upcomingJobs,
      penaltyAgg,
      totalQuotesCount,
      quotesSentCount,
      quotesAcceptedCount,
      quotePipelineAgg,
      clientsWithBookings,
      reviewAgg,
      bookingsTodayCount,
      bookingsMonthCount
    ] = await Promise.all([
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
      Review.find().limit(5).populate('technicianId', 'name').sort({ createdAt: -1 }).lean(),
      Job.aggregate([
        { $match: { $or: [{ paymentStatus: 'paid' }, { status: { $in: ['completed', 'payment_done'] } }] } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', '$price'] } } } },
      ]),
      Job.find({ status: { $in: ['confirmed', 'assigned', 'travelling', 'arrived'] } }).limit(5).populate('assignedTechnician', 'name').lean(),
      User.aggregate([
        { $unwind: '$penalties' },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$penalties.amount' } } }
      ]),
      QuoteRequest.countDocuments({}),
      QuoteRequest.countDocuments({ status: { $in: ['quotation_sent', 'Quote Sent', 'Quotation Sent'] } }),
      QuoteRequest.countDocuments({ status: { $in: ['quotation_accepted', 'Accepted', 'converted_to_order', 'Converted to Booking', 'paid'] } }),
      QuoteRequest.aggregate([
        { $match: { status: { $in: ['quotation_sent', 'quotation_accepted', 'Quote Sent', 'Quotation Sent'] } } },
        { $group: { _id: null, total: { $sum: '$finalAmount' } } }
      ]),
      Job.distinct('client'),
      Review.aggregate([{ $group: { _id: null, avgRating: { $avg: '$rating' } } }]),
      Job.countDocuments({ createdAt: { $gte: startOfToday } }),
      Job.countDocuments({ createdAt: { $gte: startOfMonth } }),
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
    const completedJobs = (jobsByStatus.completed || 0) + (jobsByStatus.payment_done || 0);
    const totalRevenue = revenueAgg[0]?.total || 0;
    const totalQuotes = totalQuotesCount || 0;
    const quotesAccepted = quotesAcceptedCount || 0;
    const quotePipelineValue = quotePipelineAgg[0]?.total || 0;
    const quoteConversionRate = totalQuotes > 0 ? parseFloat(((quotesAccepted / totalQuotes) * 100).toFixed(1)) : 0;
    const totalClients = usersByRole.client || 0;
    const clientConversionRate = totalClients > 0 ? parseFloat(((clientsWithBookings.length / totalClients) * 100).toFixed(1)) : 0;
    const bookingCompletionRate = totalJobs > 0 ? parseFloat(((completedJobs / totalJobs) * 100).toFixed(1)) : 0;
    const averageRating = reviewAgg[0]?.avgRating ? parseFloat(reviewAgg[0].avgRating.toFixed(1)) : 5.0;

    return res.json({
      success: true,
      data: {
        summary: {
          totalLeads: leadsCount,
          totalUsers: Object.values(usersByRole).reduce((a, b) => a + b, 0),
          totalBookings: totalJobs,
          totalRevenue,
          totalJobs,
          completedJobs,
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
          bookingCompletionRate,
          bookingsToday: bookingsTodayCount,
          bookingsThisMonth: bookingsMonthCount,
          // Quotation Metrics
          totalQuotes,
          quotesSent: quotesSentCount,
          quotesAccepted,
          quotePipelineValue,
          quoteConversionRate,
          // Customer Conversion Metrics
          totalClients,
          clientsWithBookingsCount: clientsWithBookings.length,
          customerConversionRate: clientConversionRate,
          // Performance Metrics
          averageTechnicianRating: averageRating,
        },
        quotationMetrics: {
          totalQuotes,
          quotesSent: quotesSentCount,
          quotesAccepted,
          quotePipelineValue,
          quoteConversionRate,
        },
        customerConversionMetrics: {
          totalClients,
          clientsWithBookingsCount: clientsWithBookings.length,
          conversionRate: clientConversionRate,
        },
        technicianMetrics: {
          activeTechnicians: liveTechnicians.length,
          totalTechnicians: usersByRole.technician || 0,
          averageRating,
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

function normalizePhoneNumber(phone) {
  if (!phone) return '';
  const cleaned = String(phone).trim().replace(/\D/g, '');
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return cleaned.slice(2);
  }
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return cleaned.slice(1);
  }
  return cleaned;
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
    const { password, role, email, mobileNumber, name } = req.body;

    const rawMobile = mobileNumber || req.body.phone;
    if (!rawMobile) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    const normalizedMobile = normalizePhoneNumber(rawMobile);
    if (!/^\d{10}$/.test(normalizedMobile)) {
      return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number is required' });
    }

    if (password) {
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
      }
    }

    const allowedRoles = ['admin', 'manager', 'technician', 'client'];
    const safeRole = allowedRoles.includes(role) ? role : 'technician';

    const normalizedEmail = (typeof email === 'string' && email.trim() !== '') ? email.trim().toLowerCase() : undefined;

    // Check for existing user by mobileNumber variants
    const mobileVariants = [
      normalizedMobile,
      `+91${normalizedMobile}`,
      `91${normalizedMobile}`,
      `0${normalizedMobile}`,
    ];

    const existingUser = await User.findOne({
      $or: [
        { mobileNumber: { $in: mobileVariants } },
        { phone: { $in: mobileVariants } },
      ],
    }).select('+password');

    if (existingUser) {
      const isStaff = ['technician', 'manager', 'admin'].includes(existingUser.role);
      const isActiveStaff = isStaff && existingUser.isDeleted !== true && existingUser.employeeStatus !== 'Inactive';

      if (isActiveStaff) {
        return res.status(400).json({
          success: false,
          message: 'MobileNumber already registered or in use.',
        });
      }

      // Check if email conflicts with another user
      if (normalizedEmail) {
        const existingEmailUser = await User.findOne({
          _id: { $ne: existingUser._id },
          email: normalizedEmail,
          isDeleted: { $ne: true },
        });
        if (existingEmailUser) {
          return res.status(400).json({ success: false, message: 'Email already registered' });
        }
      }

      // Reactivate soft-deleted employee or promote customer account
      existingUser.isDeleted = false;
      existingUser.employeeStatus = req.body.employeeStatus || 'Active';
      existingUser.status = 'available';
      existingUser.availabilityStatus = 'ONLINE';
      existingUser.role = safeRole;
      existingUser.userType = 'member';
      existingUser.mobileNumber = normalizedMobile;
      existingUser.phone = normalizedMobile;

      if (name) existingUser.name = name.trim();
      if (normalizedEmail) existingUser.email = normalizedEmail;
      if (password) {
        existingUser.password = password; // Will be hashed by pre-save hook
      }

      if (req.body.specialty !== undefined) existingUser.specialty = req.body.specialty;
      if (req.body.specialty) {
        existingUser.serviceCategories = [req.body.specialty];
      } else if (req.body.serviceCategories !== undefined) {
        existingUser.serviceCategories = req.body.serviceCategories;
      }
      if (req.body.address !== undefined) existingUser.address = req.body.address;
      if (req.body.pincode !== undefined) existingUser.pincode = req.body.pincode;
      if (req.body.skills !== undefined) {
        existingUser.skills = Array.isArray(req.body.skills)
          ? req.body.skills
          : String(req.body.skills).split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (req.body.joiningDate) existingUser.joiningDate = new Date(req.body.joiningDate);

      // Ensure employeeId and employeeCode exist for staff roles
      if (['technician', 'manager', 'admin'].includes(safeRole)) {
        if (!existingUser.employeeId) {
          const ts = Math.floor(Date.now() / 1000);
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          existingUser.employeeId = `EMP-${ts}-${rand}`;
        }
        if (!existingUser.employeeCode) {
          const randNum = Math.floor(1000 + Math.random() * 9000);
          existingUser.employeeCode = `TECH-${randNum}`;
        }
      }

      await existingUser.save();

      console.log(`[ADMIN ACTION] Re-activated/promoted user ${existingUser._id} to ${safeRole} with mobile ${normalizedMobile} by ${req.user?.id || 'admin'}`);

      await recordAudit({
        actorId: req.user?.id,
        actorEmail: req.user?.email,
        actorRole: req.user?.role,
        action: isStaff ? 'reactivate_employee_v2' : 'promote_customer_to_employee_v2',
        entityType: 'user',
        entityId: existingUser._id.toString(),
        ip: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
        details: {
          email: existingUser.email,
          role: existingUser.role,
          name: existingUser.name,
          mobileNumber: normalizedMobile,
        },
      });

      return res.status(200).json({ success: true, data: existingUser.toSafeObject() });
    }

    // New user registration
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    if (normalizedEmail) {
      const existingEmailUser = await User.findOne({
        email: normalizedEmail,
        isDeleted: { $ne: true },
      });
      if (existingEmailUser) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }
    }

    const userData = {
      ...req.body,
      mobileNumber: normalizedMobile,
      phone: normalizedMobile,
      email: normalizedEmail,
      role: safeRole,
      userType: 'member',
      employeeStatus: req.body.employeeStatus || 'Active',
      isDeleted: false,
    };

    if (userData.specialty && (!userData.serviceCategories || userData.serviceCategories.length === 0)) {
      userData.serviceCategories = [userData.specialty];
    }
    if (typeof userData.skills === 'string') {
      userData.skills = userData.skills.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const user = await User.create(userData);

    await recordAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      action: 'create_user_v2',
      entityType: 'user',
      entityId: user._id.toString(),
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: { email: user.email, role: user.role, name: user.name, mobileNumber: user.mobileNumber },
    });

    const safeUser = user.toSafeObject();
    return res.status(201).json({ success: true, data: safeUser });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const updateData = { ...req.body };

    // Normalize mobileNumber if provided
    if (updateData.mobileNumber || updateData.phone) {
      const normalizedMobile = normalizePhoneNumber(updateData.mobileNumber || updateData.phone);
      if (!/^\d{10}$/.test(normalizedMobile)) {
        return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number is required' });
      }
      updateData.mobileNumber = normalizedMobile;
      updateData.phone = normalizedMobile;

      const existingUser = await User.findOne({
        _id: { $ne: user._id },
        $or: [
          { mobileNumber: { $in: [normalizedMobile, `+91${normalizedMobile}`, `91${normalizedMobile}`, `0${normalizedMobile}`] } },
          { phone: { $in: [normalizedMobile, `+91${normalizedMobile}`, `91${normalizedMobile}`, `0${normalizedMobile}`] } },
        ],
        isDeleted: { $ne: true },
      });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'MobileNumber already registered or in use.' });
      }
    }

    // Optional password update (from Edit Employee Account form or direct update)
    if (updateData.password !== undefined && String(updateData.password).trim() !== '') {
      const newPass = String(updateData.password).trim();
      if (newPass.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
      }
      user.password = newPass; // will be hashed by pre-save hook
      user.sessionActive = false;
      console.log(`[ADMIN ACTION] Password updated via edit user for ${user._id} by ${req.user?.id || 'admin'}`);
    }
    delete updateData.password;

    if (typeof updateData.email === 'string') {
      const normEmail = updateData.email.trim().toLowerCase();
      if (normEmail) {
        const existingEmail = await User.findOne({
          _id: { $ne: user._id },
          email: normEmail,
          isDeleted: { $ne: true },
        });
        if (existingEmail) {
          return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        user.email = normEmail;
      } else {
        user.email = undefined;
      }
      delete updateData.email;
    }

    if (updateData.specialty && (!updateData.serviceCategories || updateData.serviceCategories.length === 0)) {
      updateData.serviceCategories = [updateData.specialty];
    }
    if (typeof updateData.skills === 'string') {
      updateData.skills = updateData.skills.split(',').map((s) => s.trim()).filter(Boolean);
    }

    Object.keys(updateData).forEach((key) => {
      user[key] = updateData[key];
    });

    await user.save();

    await recordAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      action: 'update_user_v2',
      entityType: 'user',
      entityId: user._id.toString(),
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: { email: user.email, role: user.role, name: user.name, mobileNumber: user.mobileNumber },
    });

    return res.json({ success: true, data: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    if (targetUser.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admin accounts cannot be deleted or deactivated.' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        isDeleted: true,
        employeeStatus: 'Inactive',
        availabilityStatus: 'OFFLINE',
        isOnline: false,
        sessionActive: false,
        status: 'offline',
      },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    console.log(`[ADMIN ACTION] Employee ${user._id} deleted/deactivated by ${req.user?.id || 'admin'}`);

    await recordAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      action: 'delete_user_v2',
      entityType: 'user',
      entityId: user._id.toString(),
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: { email: user.email, role: user.role, name: user.name, mobileNumber: user.mobileNumber },
    });

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
      isAdminCreated: true,
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

async function getAvailableTechnicians(req, res, next) {
  try {
    const dispatchService = require('../../services/dispatchService');
    const technicians = await User.find({ role: 'technician', isDeleted: { $ne: true } })
      .select('name email phone mobileNumber specialty skills rating completedJobs availabilityStatus activeJobId lat lng locationUpdatedAt serviceCategories pincodeCoverage')
      .lean();

    let targetCoords = null;
    let targetPincode = null;

    if (req.query.bookingId) {
      const booking = await Job.findById(req.query.bookingId).populate('addressId').lean();
      if (booking) {
        targetCoords = await dispatchService.getJobCustomerCoords(booking);
        targetPincode = booking.addressDetails?.pincode || booking.addressId?.pincode || booking.pincode;
      }
    } else if (req.query.lat && req.query.lng) {
      targetCoords = { lat: parseFloat(req.query.lat), lng: parseFloat(req.query.lng) };
      if (req.query.pincode) targetPincode = req.query.pincode;
    }

    const activeJobs = await Job.aggregate([
      {
        $match: {
          assignedTechnician: { $in: technicians.map((t) => t._id) },
          status: { $in: ['assigned', 'accepted', 'travelling', 'arrived', 'working', 'started', 'in_progress', 'work_uploaded', 'completion_requested'] },
        },
      },
      {
        $group: {
          _id: '$assignedTechnician',
          count: { $sum: 1 },
        },
      },
    ]);

    const activeJobMap = {};
    activeJobs.forEach((item) => {
      activeJobMap[String(item._id)] = item.count;
    });

    const enriched = technicians.map((t) => {
      const activeCount = activeJobMap[String(t._id)] || (t.activeJobId ? 1 : 0);
      let distanceKm = null;
      if (targetCoords && t.lat && t.lng) {
        distanceKm = Math.round(dispatchService.haversineKm(targetCoords.lat, targetCoords.lng, t.lat, t.lng) * 10) / 10;
      }
      const isOnline = t.availabilityStatus === 'ONLINE';
      return {
        id: t._id,
        _id: t._id,
        name: t.name,
        phone: t.mobileNumber || t.phone || '',
        email: t.email || '',
        specialty: t.specialty || (Array.isArray(t.skills) && t.skills.length ? t.skills.join(', ') : 'CCTV & Network Specialist'),
        skills: t.skills || [],
        rating: t.rating || 5,
        completedJobs: t.completedJobs || 0,
        availabilityStatus: t.availabilityStatus || 'OFFLINE',
        isOnline,
        activeJobsCount: activeCount,
        activeJobId: t.activeJobId || null,
        lat: t.lat || null,
        lng: t.lng || null,
        locationUpdatedAt: t.locationUpdatedAt || null,
        distanceKm,
        pincodeMatch: targetPincode && t.pincodeCoverage ? t.pincodeCoverage.includes(String(targetPincode)) : false,
      };
    });

    enriched.sort((a, b) => {
      const statusScore = (s) => (s === 'ONLINE' ? 2 : s === 'BUSY' ? 1 : 0);
      const diffScore = statusScore(b.availabilityStatus) - statusScore(a.availabilityStatus);
      if (diffScore !== 0) return diffScore;

      if (a.activeJobsCount !== b.activeJobsCount) return a.activeJobsCount - b.activeJobsCount;

      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;

      return (b.rating || 0) - (a.rating || 0);
    });

    return res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
}

async function assignBooking(req, res, next) {
  try {
    const { id } = req.params;
    const { technicianId, dispatchNote } = req.body;

    if (!technicianId) {
      return res.status(400).json({ success: false, message: 'technicianId is required' });
    }

    const io = req.app.get('io') || global._socketIo;
    const dispatchService = require('../../services/dispatchService');
    const job = await dispatchService.adminOverrideAssignment(id, technicianId, req.user.id, io, dispatchNote);

    return res.json({ success: true, data: job, message: 'Technician assigned successfully' });
  } catch (err) {
    next(err);
  }
}

async function updateJobInstruction(req, res, next) {
  try {
    const { id } = req.params;
    const { instruction, dispatchNote, note } = req.body;
    const finalInstruction = (instruction || dispatchNote || note || '').trim();
    if (!finalInstruction) {
      return res.status(400).json({ success: false, message: 'Instruction or note is required' });
    }

    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ success: false, message: 'Service request not found' });

    job.dispatchNote = finalInstruction;
    await job.save();

    // Log in JobStatusHistory
    const JobStatusHistory = mongoose.model('JobStatusHistory');
    await JobStatusHistory.create({
      jobId: job._id.toString(),
      bookingId: (job.bookingNumber || job._id).toString(),
      status: job.status,
      note: `Admin Instruction: ${finalInstruction}`,
      updatedBy: req.user?.role || 'admin',
      updatedAt: new Date(),
    }).catch(err => console.error('[updateJobInstruction] History log error:', err));

    // Real-time socket broadcast
    const io = req.app.get('io') || global._socketIo;
    if (io) {
      const payload = {
        jobId: job._id.toString(),
        bookingId: (job.bookingNumber || job._id).toString(),
        dispatchNote: finalInstruction,
        status: job.status,
        updatedAt: new Date().toISOString(),
      };
      if (job.assignedTechnician) {
        io.to(job.assignedTechnician.toString()).emit('jobInstructionUpdated', payload);
        io.to(job.assignedTechnician.toString()).emit('bookingStatusUpdated', payload);
      }
      io.to('admin_room').emit('jobInstructionUpdated', payload);
      io.to('admin_room').emit('bookingStatusUpdated', payload);
    }

    // FCM Push Notification to technician
    if (job.assignedTechnician) {
      const notificationService = require('../../services/notificationService');
      await notificationService.createNotification(
        job.assignedTechnician,
        'Admin Instruction Update',
        `Admin note: ${finalInstruction}`,
        'instruction_updated',
        io,
        { jobId: job._id.toString(), dispatchNote: finalInstruction }
      ).catch(err => console.error('[updateJobInstruction] Notification error:', err));
    }

    return res.json({
      success: true,
      message: 'Instruction dispatched to technician successfully',
      data: {
        id: job._id,
        dispatchNote: job.dispatchNote,
      }
    });
  } catch (err) {
    next(err);
  }
}

async function verifyJobWork(req, res, next) {
  try {
    const { id } = req.params;
    const { status = 'verified', verificationNote, note } = req.body;
    const finalNote = (verificationNote || note || '').trim();

    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ success: false, message: 'Service request not found' });

    const isVerified = status === 'verified';
    job.adminVerified = isVerified;
    job.verificationStatus = isVerified ? 'verified' : 'rework_requested';
    job.verifiedBy = req.user?.id || null;
    job.verifiedAt = new Date();
    job.verificationNote = finalNote;

    if (isVerified) {
      const ServiceWorksheet = mongoose.models.ServiceWorksheet || require('../../models/ServiceWorksheet');
      await ServiceWorksheet.findOneAndUpdate(
        { jobId: job._id },
        { status: 'approved', approvedAt: new Date() }
      ).catch(err => console.error('[verifyJobWork] Worksheet approve error:', err));
    }

    await job.save();

    // Log in JobStatusHistory
    const JobStatusHistory = mongoose.model('JobStatusHistory');
    await JobStatusHistory.create({
      jobId: job._id.toString(),
      bookingId: (job.bookingNumber || job._id).toString(),
      status: job.status,
      note: isVerified
        ? `Work Verified & Approved by Admin${finalNote ? ': ' + finalNote : ''}`
        : `Admin Requested Rework / Query: ${finalNote}`,
      updatedBy: req.user?.role || 'admin',
      updatedAt: new Date(),
    }).catch(err => console.error('[verifyJobWork] History log error:', err));

    // Real-time socket broadcast
    const io = req.app.get('io') || global._socketIo;
    if (io) {
      const payload = {
        jobId: job._id.toString(),
        bookingId: (job.bookingNumber || job._id).toString(),
        adminVerified: job.adminVerified,
        verificationStatus: job.verificationStatus,
        verificationNote: job.verificationNote,
        verifiedAt: job.verifiedAt,
        status: job.status,
      };
      if (job.assignedTechnician) {
        io.to(job.assignedTechnician.toString()).emit('jobVerified', payload);
        io.to(job.assignedTechnician.toString()).emit('bookingStatusUpdated', payload);
      }
      io.to('admin_room').emit('jobVerified', payload);
      io.to('admin_room').emit('bookingStatusUpdated', payload);
    }

    // FCM Push Notification to technician
    if (job.assignedTechnician) {
      const notificationService = require('../../services/notificationService');
      const title = isVerified ? 'Work Approved by Admin ✓' : 'Admin Feedback / Rework Query ⚠️';
      const body = isVerified
        ? (finalNote || 'Your completed service has been verified and approved by Admin.')
        : `Action Required: ${finalNote || 'Please review Admin query on your worksheet.'}`;

      await notificationService.createNotification(
        job.assignedTechnician,
        title,
        body,
        isVerified ? 'job_verified' : 'rework_requested',
        io,
        { jobId: job._id.toString(), verificationStatus: job.verificationStatus, note: finalNote }
      ).catch(err => console.error('[verifyJobWork] Notification error:', err));
    }

    return res.json({
      success: true,
      message: isVerified ? 'Job work verified and approved successfully' : 'Rework query sent to technician',
      data: {
        id: job._id,
        adminVerified: job.adminVerified,
        verificationStatus: job.verificationStatus,
        verificationNote: job.verificationNote,
        verifiedAt: job.verifiedAt,
      }
    });
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
 * Change / Reset User/Employee Password (Admin action)
 */
async function changeUserPassword(req, res, next) {
  try {
    const { id } = req.params;
    const { newPassword, password } = req.body;
    const targetPassword = newPassword || password;

    if (!targetPassword || typeof targetPassword !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'New password is required',
      });
    }

    if (targetPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    const user = await User.findById(id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.password = targetPassword; // Will be hashed by pre-save hook using bcrypt
    user.sessionActive = false; // Invalidate current session for security
    await user.save();

    console.log(`[ADMIN ACTION] Password reset for employee ${user._id} by ${req.user?.id || 'admin'}`);

    await recordAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      action: 'admin_reset_employee_password',
      entityType: 'user',
      entityId: user._id.toString(),
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        targetUserEmail: user.email,
        targetUserRole: user.role,
        targetUserMobile: user.mobileNumber,
        targetUserName: user.name,
      },
    });

    return res.json({
      success: true,
      message: `Password reset successfully for ${user.name || 'employee'}`,
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
  getAvailableTechnicians,
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
  updateJobInstruction,
  verifyJobWork,
  changeUserPassword,
  getApplications,
  updateApplicationStatus,
};
