/**
 * dispatchService.js
 * ==================
 * Core dispatch engine for Uber/Rapido style technician assignment.
 *
 * Flow:
 *   1. autoAssignTechnician(jobId)
 *      → Find best ONLINE technician matching service + pincode + distance
 *      → If found → assign directly (AUTO)
 *      → If not found → broadcastJobRequest (FALLBACK)
 *
 *   2. broadcastJobRequest(jobId)
 *      → Send request to up to 5 nearest eligible technicians
 *      → First to accept wins (atomic claim via MongoDB)
 *      → Others get expired after 60s
 *
 *   3. acceptJobRequest(jobId, technicianId)
 *      → Atomic claim — only one technician can win
 *      → Expire all other pending requests for this job
 */

const Job = require('../models/Job');
const User = require('../models/User');
const JobRequest = require('../models/JobRequest');
const BangalorePincode = require('../models/BangalorePincode');
const notificationService = require('./notificationService');

// ─── Haversine distance (returns km) ─────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function toRad(deg) { return deg * (Math.PI / 180); }

// ─── Get lat/lng for a pincode ────────────────────────────────────────────────
async function getPincodeCoords(pincode) {
  if (!pincode) return null;
  const record = await BangalorePincode.findOne({ pincode: String(pincode).trim(), active: true }).lean();
  return record ? { lat: record.latitude, lng: record.longitude } : null;
}

// ─── Find eligible technicians for a job ─────────────────────────────────────
async function findEligibleTechnicians(job, customerCoords, limit = 10) {
  // Resolve the service category from the job
  const serviceCategory = job.serviceId || job.serviceName || '';

  // Build the query for eligible technicians (do NOT filter strictly by pincode here)
  const technicianQuery = {
    role: 'technician',
    availabilityStatus: 'ONLINE',
    isDeleted: { $ne: true },
  };

  const customerPincode = await getJobPincode(job);

  // Filter by service category if set on technician
  // (only restrict if technician has serviceCategories defined)
  const allOnline = await User.find(technicianQuery)
    .select('name lat lng rating completedJobs availabilityStatus serviceCategories pincodeCoverage activeJobId fcmToken')
    .lean();

  // Filter by service category compatibility
  let eligible = allOnline.filter(tech => {
    // If technician has no serviceCategories set, treat as eligible for all
    if (!tech.serviceCategories || tech.serviceCategories.length === 0) return true;
    // Otherwise check if they handle this service
    const cat = serviceCategory.toLowerCase();
    return tech.serviceCategories.some(sc => sc.toLowerCase().includes(cat) || cat.includes(sc.toLowerCase()));
  });

  // Exclude technicians already on an active job
  eligible = eligible.filter(tech => !tech.activeJobId);

  if (!customerCoords || !customerCoords.lat || !customerCoords.lng) {
    // No coords → sort by rating only
    return eligible.sort((a, b) => (b.rating || 5) - (a.rating || 5)).slice(0, limit);
  }

  // Add distance and pincode match flag, and sort primarily by straight-line distance
  let withDistance = eligible
    .filter(tech => tech.lat && tech.lng)
    .map(tech => {
      const distanceKm = haversineKm(customerCoords.lat, customerCoords.lng, tech.lat, tech.lng);
      const coversPincode = customerPincode && tech.pincodeCoverage && tech.pincodeCoverage.includes(customerPincode);
      return {
        ...tech,
        distanceKm,
        coversPincode: !!coversPincode,
      };
    })
    .filter(tech => tech.distanceKm <= 30) // Max 30km radius
    .sort((a, b) => a.distanceKm - b.distanceKm);

  // Optimize ORS: only resolve driving directions for the top 5 closest candidates
  const topCandidates = withDistance.slice(0, 5);
  const remainingCandidates = withDistance.slice(5);

  const routingService = require('./routingService');
  const resolvedCandidates = await Promise.all(
    topCandidates.map(async (tech) => {
      try {
        const directions = await routingService.getDirections(
          { lat: customerCoords.lat, lng: customerCoords.lng },
          { lat: tech.lat, lng: tech.lng }
        );
        return {
          ...tech,
          distanceKm: directions.distanceKm,
          durationMinutes: directions.durationMinutes,
          source: directions.source,
        };
      } catch (err) {
        return tech; // fallback to straight-line haversine
      }
    })
  );

  const allCandidates = [...resolvedCandidates, ...remainingCandidates].sort((a, b) => {
    // 1. Distance (closest first)
    const distDiff = a.distanceKm - b.distanceKm;
    if (distDiff !== 0) return distDiff;
    
    // 2. Rating (higher first)
    const ratingDiff = (b.rating || 5) - (a.rating || 5);
    if (ratingDiff !== 0) return ratingDiff;

    // 3. Workload (fewer completed jobs first)
    const workloadDiff = (a.completedJobs || 0) - (b.completedJobs || 0);
    if (workloadDiff !== 0) return workloadDiff;

    // 4. Covers Pincode (secondary filter)
    if (a.coversPincode && !b.coversPincode) return -1;
    if (!a.coversPincode && b.coversPincode) return 1;

    return 0;
  });

  return allCandidates.slice(0, limit);
}

// ─── Get pincode from job ─────────────────────────────────────────────────────
async function getJobPincode(job) {
  if (job.addressId) {
    const Address = require('../models/Address');
    const addr = await Address.findById(job.addressId).lean();
    return addr?.pincode || null;
  }
  // Try to extract pincode from v2Metadata
  if (job.v2Metadata) {
    const meta = job.v2Metadata instanceof Map ? Object.fromEntries(job.v2Metadata) : job.v2Metadata;
    if (meta.pincode) return meta.pincode;
  }
  return null;
}

// ─── Get customer coordinates for a job ──────────────────────────────────────
async function getJobCustomerCoords(job) {
  // Try root-level coordinates first if available
  if (job.latitude && job.longitude) {
    return { lat: Number(job.latitude), lng: Number(job.longitude) };
  }

  // Try addressId next
  if (job.addressId) {
    const Address = require('../models/Address');
    const addr = await Address.findById(job.addressId).lean();
    if (addr?.latitude && addr?.longitude) {
      return { lat: addr.latitude, lng: addr.longitude };
    }
    // Look up pincode coords
    if (addr?.pincode) {
      return getPincodeCoords(addr.pincode);
    }
  }

  // Try v2Metadata lat/lng
  if (job.v2Metadata) {
    const meta = job.v2Metadata instanceof Map ? Object.fromEntries(job.v2Metadata) : job.v2Metadata;
    if (meta.lat && meta.lng) {
      return { lat: parseFloat(meta.lat), lng: parseFloat(meta.lng) };
    }
  }

  return null;
}

// ─── AUTO ASSIGN ──────────────────────────────────────────────────────────────
/**
 * Attempts to automatically assign the best technician to a job.
 * Returns { success, technician, method } or { success: false, reason }
 */
async function autoAssignTechnician(jobId, io = null) {
  console.log(`[Dispatch] Auto-assign started for job ${jobId}`);

  const job = await Job.findById(jobId).populate('addressId').lean();
  if (!job) {
    console.error(`[Dispatch] Job ${jobId} not found`);
    return { success: false, reason: 'job_not_found' };
  }

  if (job.assignedTechnician) {
    console.log(`[Dispatch] Job ${jobId} already has technician assigned`);
    return { success: true, method: 'already_assigned' };
  }

  // Mark as dispatching
  await Job.findByIdAndUpdate(jobId, {
    dispatchStatus: 'dispatching',
    $inc: { dispatchAttempts: 1 },
  });

  const customerCoords = await getJobCustomerCoords(job);
  const eligible = await findEligibleTechnicians(job, customerCoords, 1);

  if (eligible.length === 0) {
    console.log(`[Dispatch] No eligible technician found for job ${jobId} — falling back to broadcast`);
    await Job.findByIdAndUpdate(jobId, { dispatchStatus: 'no_tech_found' });
    // Try fallback broadcast
    return broadcastJobRequest(jobId, io);
  }

  const best = eligible[0];
  console.log(`[Dispatch] Best technician: ${best.name} (${best.distanceKm?.toFixed(1) || '?'} km away)`);

  // Assign the job with a race condition guard
  const assignedJob = await Job.findOneAndUpdate(
    { _id: jobId, assignedTechnician: null },
    {
      assignedTechnician: best._id,
      assignmentMethod: 'AUTO',
      assignmentTime: new Date(),
      dispatchStatus: 'assigned',
      status: 'assigned',
      technicianId: best._id,
    },
    { new: true }
  );

  if (!assignedJob) {
    console.warn(`[Dispatch] Auto-assignment failed or race condition hit for job ${jobId}. Already assigned.`);
    return { success: false, reason: 'already_assigned_race' };
  }

  // Mark technician as busy
  await User.findByIdAndUpdate(best._id, {
    availabilityStatus: 'BUSY',
    activeJobId: jobId,
  });

  // Notify technician
  if (io) {
    io.to(best._id.toString()).emit('bookingAssigned', {
      jobId: job._id,
      customerName: job.customerName,
      serviceName: job.serviceName || job.title,
      address: job.location,
      date: job.bookingDate,
      timeSlot: job.timeSlot,
      amount: job.totalAmount || job.amount || job.price,
      distanceKm: best.distanceKm?.toFixed(1),
    });
  }

  await notificationService.createNotification(
    best._id,
    '🎉 New Job Assigned',
    `Auto-assigned: ${job.serviceName || job.title} on ${job.bookingDate || 'TBD'} at ${job.timeSlot || 'TBD'}. Customer: ${job.customerName}`,
    'job_assigned_tech',
    io,
    {
      jobId: jobId.toString(),
      serviceName: job.serviceName || job.title,
      customerName: job.customerName,
      address: job.location,
      date: job.bookingDate,
      timeSlot: job.timeSlot,
      distanceKm: best.distanceKm?.toFixed(1),
    }
  );

  // Notify customer that technician is assigned
  if (job.client) {
    if (io) {
      io.to(job.client.toString()).emit('technicianAssigned', {
        jobId: job._id,
        technicianName: best.name,
        assignmentMethod: 'AUTO',
      });
    }
    await notificationService.createNotification(
      job.client,
      '✅ Technician Assigned',
      `${best.name} has been assigned to your service request and will contact you shortly.`,
      'technician_assigned',
      io,
      { technicianName: best.name, jobId: jobId.toString() }
    );
  }

  // Notify admins
  await notifyAdmins(
    io,
    '🤖 Auto Assignment',
    `Job auto-assigned to ${best.name} (${best.distanceKm?.toFixed(1) || '?'} km) for ${job.serviceName || job.title}`,
    'dispatch_update',
    { jobId: jobId.toString() }
  );

  console.log(`[Dispatch] ✅ Auto-assigned job ${jobId} to technician ${best.name}`);
  return { success: true, technician: best, method: 'AUTO' };
}

// ─── FALLBACK BROADCAST ───────────────────────────────────────────────────────
/**
 * Broadcasts job request to multiple nearby technicians.
 * First one to accept wins.
 */
async function broadcastJobRequest(jobId, io = null) {
  console.log(`[Dispatch] Broadcasting job ${jobId} to nearby technicians`);

  const job = await Job.findById(jobId).populate('addressId').lean();
  if (!job) return { success: false, reason: 'job_not_found' };

  const customerCoords = await getJobCustomerCoords(job);
  const eligible = await findEligibleTechnicians(job, customerCoords, 5);

  if (eligible.length === 0) {
    console.warn(`[Dispatch] No technicians available for fallback broadcast on job ${jobId}`);
    await Job.findByIdAndUpdate(jobId, {
      dispatchStatus: 'no_tech_found',
      status: 'pending',
    });

    // Notify admins that no tech is available
    await notifyAdmins(io, '⚠️ No Technician Available',
      `No available technicians found for job: ${job.serviceName || job.title}. Manual assignment needed.`,
      'dispatch_failed', { jobId: jobId.toString() }
    );
    return { success: false, reason: 'no_technicians_available' };
  }

  // Create JobRequest records for each technician
  const techIds = eligible.map(t => t._id);
  const requestExpiry = new Date(Date.now() + 30 * 1000); // 30 seconds

  // Delete any stale pending requests for this job
  await JobRequest.deleteMany({ jobId, status: 'pending' });

  const requests = await Promise.allSettled(
    eligible.map(tech =>
      JobRequest.create({
        jobId,
        technicianId: tech._id,
        distanceKm: tech.distanceKm || 0,
        expiresAt: requestExpiry,
        status: 'pending',
      })
    )
  );

  // Update job with broadcasted technician ids
  await Job.findByIdAndUpdate(jobId, {
    dispatchStatus: 'dispatching',
    broadcastedTo: techIds,
    assignmentMethod: 'FALLBACK',
  });

  // Emit socket events to each technician
  for (const tech of eligible) {
    const jobRequestPayload = {
      type: 'new_job_request',
      jobId: job._id.toString(),
      customerName: job.customerName,
      serviceName: job.serviceName || job.title,
      serviceCategory: job.cctvDetails?.category?.name || '',
      address: job.location || '',
      distanceKm: tech.distanceKm?.toFixed(1) || '?',
      amount: job.totalAmount || job.amount || job.price || 0,
      date: job.bookingDate,
      timeSlot: job.timeSlot || 'TBD',
      expiresAt: requestExpiry.toISOString(),
      expiresInSeconds: 30,
    };

    if (io) {
      io.to(tech._id.toString()).emit('newJobRequest', jobRequestPayload);
    }

    await notificationService.createNotification(
      tech._id,
      '📲 New Job Request',
      `${job.serviceName || job.title} near you (${tech.distanceKm?.toFixed(1) || '?'} km). Tap to Accept/Reject. Expires in 30s.`,
      'new_job_request',
      io,
      jobRequestPayload
    );
  }

  // Auto-expire pending requests after 30 seconds
  setTimeout(async () => {
    try {
      const expired = await JobRequest.updateMany(
        { jobId, status: 'pending' },
        { status: 'expired' }
      );
      if (expired.modifiedCount > 0) {
        console.log(`[Dispatch] Expired ${expired.modifiedCount} pending requests for job ${jobId}`);
        // Check if job got assigned during this window
        const updatedJob = await Job.findById(jobId).lean();
        if (!updatedJob?.assignedTechnician) {
          await Job.findByIdAndUpdate(jobId, { dispatchStatus: 'no_tech_found' });
          await notifyAdmins(io, '⚠️ Job Request Expired',
            `No technician accepted job: ${job.serviceName || job.title}. Manual assignment required.`,
            'dispatch_failed', { jobId: jobId.toString() }
          );
        }
      }
    } catch (err) {
      console.error('[Dispatch] Error expiring job requests:', err.message);
    }
  }, 32 * 1000);

  console.log(`[Dispatch] Broadcast sent to ${eligible.length} technicians for job ${jobId}`);
  return { success: true, broadcastedTo: eligible.length, method: 'FALLBACK' };
}

// ─── ACCEPT JOB REQUEST ───────────────────────────────────────────────────────
/**
 * Technician accepts a broadcasted job request.
 * Atomic — only the first acceptance wins.
 */
async function acceptJobRequest(jobId, technicianId, io = null) {
  console.log(`[Dispatch] Technician ${technicianId} accepting job ${jobId}`);

  // Atomic: find and update the specific pending request for this tech
  const request = await JobRequest.findOneAndUpdate(
    {
      jobId,
      technicianId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    },
    {
      status: 'accepted',
      respondedAt: new Date(),
    },
    { new: true }
  );

  if (!request) {
    // Either already claimed by another tech, or expired
    const existingRequest = await JobRequest.findOne({ jobId, technicianId }).lean();
    if (existingRequest?.status === 'expired') {
      throw new Error('This job request has expired. Please wait for the next available job.');
    }
    throw new Error('This job request is no longer available. Another technician may have accepted it first.');
  }

  // Check if the job is still unassigned (race condition guard)
  const job = await Job.findOneAndUpdate(
    { _id: jobId, assignedTechnician: null },
    {
      assignedTechnician: technicianId,
      assignmentMethod: 'ACCEPTED',
      assignmentTime: new Date(),
      dispatchStatus: 'assigned',
      status: 'assigned',
      technicianId,
      acceptedAt: new Date(),
    },
    { new: true }
  );

  if (!job) {
    // Job was already assigned by another technician's concurrent accept
    await JobRequest.findByIdAndUpdate(request._id, { status: 'expired' });
    throw new Error('This job was just accepted by another technician. Please wait for the next request.');
  }

  // Expire all other pending requests for this job
  await JobRequest.updateMany(
    { jobId, technicianId: { $ne: technicianId }, status: 'pending' },
    { status: 'expired', respondedAt: new Date() }
  );

  // Mark technician as BUSY
  await User.findByIdAndUpdate(technicianId, {
    availabilityStatus: 'BUSY',
    activeJobId: jobId,
  });

  const technician = await User.findById(technicianId).select('name phone').lean();

  // Notify customer
  if (job.client) {
    if (io) {
      io.to(job.client.toString()).emit('technicianAssigned', {
        jobId,
        technicianName: technician?.name,
        assignmentMethod: 'ACCEPTED',
      });
    }
    await notificationService.createNotification(
      job.client,
      '✅ Technician Accepted Your Request',
      `${technician?.name || 'A technician'} has accepted your service request and is on the way!`,
      'technician_assigned',
      io,
      { technicianName: technician?.name, jobId: jobId.toString() }
    );
  }

  // Notify admin
  await notifyAdmins(io, '✅ Job Accepted',
    `${technician?.name} accepted job: ${job.serviceName || job.title}`,
    'dispatch_update', { jobId: jobId.toString() }
  );

  console.log(`[Dispatch] ✅ Job ${jobId} accepted by technician ${technician?.name}`);
  return { job, request };
}

// ─── REJECT JOB REQUEST ───────────────────────────────────────────────────────
async function rejectJobRequest(jobId, technicianId, reason = '', io = null) {
  const request = await JobRequest.findOneAndUpdate(
    { jobId, technicianId, status: 'pending' },
    { status: 'rejected', respondedAt: new Date(), rejectionReason: reason },
    { new: true }
  );

  if (!request) {
    throw new Error('Job request not found or already responded');
  }

  const technician = await User.findById(technicianId).select('name').lean();
  const job = await Job.findById(jobId).select('serviceName title').lean();

  // Notify admins
  await notifyAdmins(
    io,
    '❌ Job Request Declined',
    `${technician?.name || 'Technician'} declined dispatch request for: ${job?.serviceName || job?.title || 'Job'}. Reason: ${reason || 'Not specified'}`,
    'dispatch_update',
    { jobId: jobId.toString() }
  );

  console.log(`[Dispatch] Technician ${technicianId} rejected job ${jobId}. Reason: ${reason}`);
  return { success: true };
}

// ─── OVERRIDE ASSIGNMENT (Admin) ──────────────────────────────────────────────
async function adminOverrideAssignment(jobId, technicianId, adminId, io = null) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error('Job not found');

  const tech = await User.findOne({ _id: technicianId, role: 'technician' });
  if (!tech) throw new Error('Technician not found');

  // Release previous technician if any
  if (job.assignedTechnician && job.assignedTechnician.toString() !== technicianId.toString()) {
    await User.findByIdAndUpdate(job.assignedTechnician, {
      availabilityStatus: 'ONLINE',
      activeJobId: null,
    });
  }

  job.assignedTechnician = technicianId;
  job.assignedManager = adminId;
  job.assignmentMethod = 'MANUAL';
  job.assignmentTime = new Date();
  job.dispatchStatus = 'assigned';
  job.status = 'assigned';
  job.technicianId = technicianId;
  await job.save();

  await User.findByIdAndUpdate(technicianId, {
    availabilityStatus: 'BUSY',
    activeJobId: jobId,
  });

  // Notify technician
  if (io) {
    io.to(technicianId.toString()).emit('bookingAssigned', {
      jobId: job._id,
      customerName: job.customerName,
      serviceName: job.serviceName || job.title,
      assignmentMethod: 'MANUAL',
    });
  }

  await notificationService.createNotification(
    technicianId,
    '📋 Job Assigned by Admin',
    `Admin assigned you to: ${job.serviceName || job.title} on ${job.bookingDate || 'TBD'}`,
    'job_assigned_tech',
    io,
    { jobId: jobId.toString(), serviceName: job.serviceName || job.title }
  );

  return job;
}

// ─── TECHNICIAN CANCELS JOB (after accepting) ─────────────────────────────────
async function technicianCancelJob(jobId, technicianId, reason = '', io = null) {
  const PENALTY_AMOUNT = 50; // ₹50 penalty

  const job = await Job.findOne({ _id: jobId, assignedTechnician: technicianId });
  if (!job) throw new Error('Job not found or not assigned to you');

  if (!['assigned', 'accepted', 'in_progress'].includes(job.status)) {
    throw new Error('Cannot cancel job in current status');
  }

  // Apply penalty to technician
  await User.findByIdAndUpdate(technicianId, {
    availabilityStatus: 'ONLINE',
    activeJobId: null,
    $inc: { penaltyPoints: 1, performanceScore: -5 },
    $push: {
      penalties: {
        amount: PENALTY_AMOUNT,
        reason: `Cancelled job: ${job.serviceName || job.title}. Reason: ${reason}`,
        penaltyDate: new Date(),
        jobId,
      },
    },
  });

  // Notify technician of penalty
  await notificationService.createNotification(
    technicianId,
    '⚠️ Cancellation Penalty Applied',
    `A penalty of ₹${PENALTY_AMOUNT} has been applied to your account for cancelling job "${job.serviceName || job.title}".`,
    'penalty_applied',
    io,
    { jobId: jobId.toString(), penaltyAmount: PENALTY_AMOUNT }
  );

  // Update job
  job.assignedTechnician = null;
  job.technicianId = null;
  job.status = 'pending';
  job.dispatchStatus = 'pending_dispatch';
  job.assignmentMethod = null;
  job.technicianPenalty = {
    amount: PENALTY_AMOUNT,
    reason: `Technician cancelled: ${reason}`,
    penaltyDate: new Date(),
  };
  await job.save();

  // Notify customer
  if (job.client) {
    if (io) io.to(job.client.toString()).emit('technicianCancelled', { jobId });
    await notificationService.createNotification(
      job.client,
      '⚠️ Technician Cancelled',
      `Your assigned technician cancelled. We\'re finding another technician for you.`,
      'technician_cancelled',
      io,
      { jobId: jobId.toString() }
    );
  }

  // Notify admin
  await notifyAdmins(io, '⚠️ Technician Cancelled Job',
    `Technician cancelled job: ${job.serviceName || job.title}. ₹${PENALTY_AMOUNT} penalty applied.`,
    'dispatch_update', { jobId: jobId.toString() }
  );

  // Re-dispatch automatically
  setTimeout(() => autoAssignTechnician(jobId, io), 2000);

  return { success: true, penaltyApplied: PENALTY_AMOUNT };
}

// ─── Helper: notify all admins ────────────────────────────────────────────────
async function notifyAdmins(io, title, message, type, extraData = {}) {
  try {
    const admins = await User.find({ role: 'admin', isDeleted: { $ne: true } }).select('_id').lean();
    await Promise.allSettled(
      admins.map(admin =>
        notificationService.createNotification(admin._id, title, message, type, io, extraData)
      )
    );
  } catch (err) {
    console.error('[Dispatch] Failed to notify admins:', err.message);
  }
}

// ─── GET DISPATCH STATUS ──────────────────────────────────────────────────────
async function getDispatchStatus(jobId) {
  const job = await Job.findById(jobId)
    .populate('assignedTechnician', 'name phone availabilityStatus rating')
    .populate('broadcastedTo', 'name phone availabilityStatus')
    .lean();

  if (!job) throw new Error('Job not found');

  const requests = await JobRequest.find({ jobId })
    .populate('technicianId', 'name phone')
    .sort({ sentAt: -1 })
    .lean();

  return {
    jobId,
    dispatchStatus: job.dispatchStatus,
    assignmentMethod: job.assignmentMethod,
    assignmentTime: job.assignmentTime,
    dispatchAttempts: job.dispatchAttempts,
    assignedTechnician: job.assignedTechnician,
    broadcastedTo: job.broadcastedTo,
    requests: requests.map(r => ({
      id: r._id,
      technician: r.technicianId,
      status: r.status,
      distanceKm: r.distanceKm,
      sentAt: r.sentAt,
      respondedAt: r.respondedAt,
      expiresAt: r.expiresAt,
    })),
  };
}

module.exports = {
  autoAssignTechnician,
  broadcastJobRequest,
  acceptJobRequest,
  rejectJobRequest,
  adminOverrideAssignment,
  technicianCancelJob,
  getDispatchStatus,
  findEligibleTechnicians,
  getJobCustomerCoords,
  haversineKm,
  notifyAdmins,
};
