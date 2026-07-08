const Admission = require('../models/Admission');
const AdmissionPayment = require('../models/AdmissionPayment');
const AdmissionDocument = require('../models/AdmissionDocument');

function buildQuery(params = {}) {
  const query = {};
  
  if (params.status) {
    if (params.status.includes(',')) {
      query.admissionStatus = { $in: params.status.split(',') };
    } else {
      query.admissionStatus = params.status;
    }
  }

  if (params.paymentStatus) {
    if (params.paymentStatus.includes(',')) {
      query.paymentStatus = { $in: params.paymentStatus.split(',') };
    } else {
      query.paymentStatus = params.paymentStatus;
    }
  }

  if (params.programType) query.programType = params.programType;
  if (params.city) query.city = params.city;
  if (params.search) {
    query.$text = { $search: String(params.search).trim() };
  }
  return query;
}

async function listApplications(params = {}) {
  const page = Math.max(parseInt(params.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;
  const sortBy = params.sortBy || 'createdAt';
  const sortOrder = params.sortOrder === 'asc' ? 1 : -1;
  const query = buildQuery(params);

  const pipeline = [
    { $match: query },
    { $sort: { [sortBy]: sortOrder } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: 'admissionPayments',
        localField: '_id',
        foreignField: 'admissionId',
        as: 'payment'
      }
    },
    { $unwind: { path: '$payment', preserveNullAndEmptyArrays: true } }
  ];

  const [items, total] = await Promise.all([
    Admission.aggregate(pipeline),
    Admission.countDocuments(query),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

async function getApplicationById(id) {
  const application = await Admission.findById(id).lean();
  if (!application) return null;
  const [payment, documents] = await Promise.all([
    AdmissionPayment.findOne({ admissionId: id }).lean(),
    AdmissionDocument.find({ admissionId: id, isActive: true }).sort({ createdAt: -1 }).lean(),
  ]);
  return { ...application, payment, documents };
}

async function createApplication(payload) {
  const paymentData = payload.payment;
  delete payload.payment;

  // Sync paymentStatus to the main Admission model if provided
  if (paymentData && paymentData.paymentStatus) {
    payload.paymentStatus = paymentData.paymentStatus;
  }

  const admission = await Admission.create(payload);

  if (paymentData) {
    await AdmissionPayment.create({
      admissionId: admission._id,
      totalFees: paymentData.totalFees || 0,
      paidAmount: paymentData.paidAmount || 0,
      pendingAmount: (paymentData.totalFees || 0) - (paymentData.paidAmount || 0),
      paymentStatus: paymentData.paymentStatus || 'pending',
      transactionLogs: paymentData.transactionLogs || []
    });
  }

  return admission;
}

async function updateApplication(id, payload) {
  return Admission.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
}

async function deleteApplication(id) {
  const [app] = await Promise.all([
    Admission.findByIdAndDelete(id),
    AdmissionPayment.deleteMany({ admissionId: id }),
    AdmissionDocument.deleteMany({ admissionId: id }),
  ]);
  return app;
}

module.exports = {
  listApplications,
  getApplicationById,
  createApplication,
  updateApplication,
  deleteApplication,
};
