const mongoose = require('mongoose');
const User = require('../../models/User');
const UserProfile = require('../../models/UserProfile');
const Address = require('../../models/Address');
const Job = require('../../models/Job');
const Payment = require('../../models/Payment');

function asMoney(amount = 0) {
  return Math.round(Number(amount) || 0);
}

async function getProfile(req, res, next) {
  try {
    const [user, profile] = await Promise.all([
      User.findById(req.user.id).select('name email phone mobileNumber createdAt').lean(),
      UserProfile.findOne({ userId: req.user.id }).lean(),
    ]);
    res.json({ success: true, data: { ...user, profilePhoto: profile?.profilePhoto || '' } });
  } catch (err) { next(err); }
}

async function updateProfile(req, res, next) {
  try {
    const { name, email, phone, profilePhoto } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { ...(name !== undefined ? { name } : {}), ...(email !== undefined ? { email } : {}), ...(phone !== undefined ? { phone, mobileNumber: phone } : {}) },
      { new: true, runValidators: true }
    ).select('name email phone mobileNumber createdAt');
    const profile = await UserProfile.findOneAndUpdate(
      { userId: req.user.id },
      { profilePhoto: profilePhoto || '' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, data: { ...user.toObject(), profilePhoto: profile.profilePhoto || '' } });
  } catch (err) { next(err); }
}

async function listAddresses(req, res, next) {
  try {
    const data = await Address.find({ userId: req.user.id }).sort({ isDefault: -1, createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function createAddress(req, res, next) {
  try {
    if (req.body.isDefault) await Address.updateMany({ userId: req.user.id }, { isDefault: false });
    const data = await Address.create({ ...req.body, userId: req.user.id });
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

async function updateAddress(req, res, next) {
  try {
    if (req.body.isDefault) await Address.updateMany({ userId: req.user.id }, { isDefault: false });
    const data = await Address.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, req.body, { new: true, runValidators: true });
    if (!data) return res.status(404).json({ success: false, message: 'Address not found' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function deleteAddress(req, res, next) {
  try {
    const data = await Address.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!data) return res.status(404).json({ success: false, message: 'Address not found' });
    res.json({ success: true, message: 'Address deleted' });
  } catch (err) { next(err); }
}

async function getBookings(req, res, next) {
  try {
    const [bookings, activeOtps] = await Promise.all([
      Job.find({ client: req.user.id, useNewFlow: true })
        .sort({ createdAt: -1 })
        .populate('assignedTechnician', 'name phone mobileNumber')
        .lean(),
      mongoose.model('OtpVerification').find({
        customerId: req.user.id,
        purpose: 'start_job',
        used: false,
        expiresAt: { $gt: new Date() }
      }).lean()
    ]);

    const otpMap = {};
    activeOtps.forEach(o => {
      if (o.bookingId) {
        otpMap[o.bookingId.toString()] = o.otp;
      }
    });

    const data = bookings.map(b => ({
      ...b,
      startJobOtp: otpMap[b._id.toString()] || null
    }));

    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getPayments(req, res, next) {
  try {
    const data = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getServiceReports(req, res, next) {
  try {
    const data = await Job.find({ client: req.user.id, status: { $in: ['completed', 'payment_done'] } })
      .populate('assignedTechnician', 'name')
      .sort({ completedAt: -1, updatedAt: -1 })
      .lean();
    res.json({ success: true, data: data.map((job) => ({
      jobId: job._id,
      bookingNumber: job.bookingNumber || job.bookingId || '',
      technician: job.assignedTechnician?.name || 'Unassigned',
      completionDate: job.completedAt || job.updatedAt,
      pdfReport: job.attachments?.[0] || '',
    })) });
  } catch (err) { next(err); }
}

async function getDashboard(req, res, next) {
  try {
    const [profileRes, addresses, bookings, payments, reports, activeOtps] = await Promise.all([
      Promise.all([User.findById(req.user.id).select('name email phone mobileNumber createdAt').lean(), UserProfile.findOne({ userId: req.user.id }).lean()]),
      Address.find({ userId: req.user.id }).sort({ isDefault: -1, createdAt: -1 }).lean(),
      Job.find({ client: req.user.id, useNewFlow: true }).sort({ createdAt: -1 }).populate('assignedTechnician', 'name phone mobileNumber').lean(),
      Payment.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean(),
      Job.find({ client: req.user.id, status: { $in: ['completed', 'payment_done'] } }).populate('assignedTechnician', 'name').lean(),
      mongoose.model('OtpVerification').find({
        customerId: req.user.id,
        purpose: 'start_job',
        used: false,
        expiresAt: { $gt: new Date() }
      }).lean(),
    ]);
    const [user, profile] = profileRes;

    const otpMap = {};
    activeOtps.forEach(o => {
      if (o.bookingId) {
        otpMap[o.bookingId.toString()] = o.otp;
      }
    });

    const bookingsWithOtp = bookings.map(b => ({
      ...b,
      startJobOtp: otpMap[b._id.toString()] || null
    }));

    const upcomingStatuses = ['confirmed', 'assigned', 'travelling', 'arrived'];
    const upcomingBookings = bookingsWithOtp.filter((job) => upcomingStatuses.includes(job.status));
    res.json({
      success: true,
      data: {
        profile: { ...user, profilePhoto: profile?.profilePhoto || '' },
        addresses,
        bookings: bookingsWithOtp,
        upcomingBookings,
        payments,
        serviceReports: reports.map((job) => ({
          jobId: job._id,
          bookingNumber: job.bookingNumber || job.bookingId || '',
          technician: job.assignedTechnician?.name || 'Unassigned',
          completionDate: job.completedAt || job.updatedAt,
          pdfReport: job.attachments?.[0] || '',
        })),
        metrics: {
          upcomingServices: upcomingBookings.length,
          orderHistory: bookingsWithOtp.length,
          savedAddresses: addresses.length,
          payments: payments.length,
          totalPaid: asMoney(payments.filter(p => ['paid', 'verified'].includes(p.status)).reduce((sum, p) => sum + (Number(p.amount) || 0), 0) / 100),
        },
      },
    });
  } catch (err) { next(err); }
}

module.exports = {
  getDashboard,
  getProfile,
  updateProfile,
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  getBookings,
  getPayments,
  getServiceReports,
};
