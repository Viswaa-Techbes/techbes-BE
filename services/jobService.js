const Job = require('../models/Job');
const User = require('../models/User');

async function createJob(jobData) {
  const {
    title,
    description,
    location,
    googleMapsLink,
    attachments,
    scheduledTime,
    customerName,
    customerPhone,
    assignedManager,
    assignedTechnician,
    price,
    amount,
    paymentStatus,
    paymentDescription,
    orderId,
  } = jobData;

  const normalizedAmount = Number(amount ?? price ?? 0);

  const job = await Job.create({
    title,
    description,
    location,
    googleMapsLink,
    attachments,
    scheduledTime,
    customerName,
    customerPhone,
    assignedManager,
    assignedTechnician: assignedTechnician || null,
    status: assignedTechnician ? 'assigned' : 'pending',
    price: normalizedAmount,
    amount: normalizedAmount,
    paymentStatus: paymentStatus || 'pending',
    paymentDescription: paymentDescription || description || title,
    orderId: orderId || '',
    currency: 'INR',
  });

  return job;
}

async function assignTechnician(jobId, technicianId, managerId) {
  const technician = await User.findOne({ _id: technicianId, role: 'technician' });
  if (!technician) throw new Error('Technician not found');

  const job = await Job.findOneAndUpdate(
    { 
      _id: jobId, 
      assignedManager: managerId,
      assignedTechnician: null 
    },
    {
      assignedTechnician: technicianId,
      status: 'assigned',
    },
    { new: true }
  );

  if (!job) {
    const checkJob = await Job.findById(jobId);
    if (!checkJob) throw new Error('Job not found');
    if (checkJob.assignedManager.toString() !== managerId.toString()) {
      throw new Error('Not authorized to assign this job');
    }
    if (checkJob.assignedTechnician) {
      throw new Error('Job is already assigned to a technician');
    }
    throw new Error('Failed to assign technician');
  }

  return job;
}

async function listJobs(query, page, limit) {
  const skip = (page - 1) * limit;
  const [jobs, total] = await Promise.all([
    Job.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('assignedTechnician', 'name email role phone status')
      .populate('assignedManager', 'name email role phone')
      .lean(),
    Job.countDocuments(query),
  ]);

  return { jobs, total };
}

module.exports = {
  createJob,
  assignTechnician,
  listJobs,
};
