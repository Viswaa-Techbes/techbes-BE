const Address = require('../../models/Address');
const UserProfile = require('../../models/UserProfile');
const Payment = require('../../models/Payment');
const Job = require('../../models/Job');

async function getDashboard(req, res, next) {
  try {
    // user metrics: upcoming bookings, payments summary, saved addresses
    const userId = req.user.id;
    const upcoming = await Job.find({ client: userId, status: { $in: ['confirmed','assigned','travelling'] }, bookingDate: { $gte: new Date() } }).sort({ bookingDate: 1 }).limit(10).lean();
    const bookings = await Job.find({ client: userId }).sort({ createdAt: -1 }).limit(20).lean();
    const payments = await Payment.find({ userId }).sort({ createdAt: -1 }).limit(20).lean();
    const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean();

    res.json({ success: true, data: { upcoming, bookings, payments, addresses } });
  } catch (err) {
    next(err);
  }
}

async function getProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const User = require('../../models/User');
    const user = await User.findById(userId).select('name email mobileNumber createdAt').lean();
    const profile = await UserProfile.findOne({ userId }).lean();
    res.json({ success: true, data: { user, profile } });
  } catch (err) { next(err); }
}

async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { profilePhoto, bio } = req.body;
    let profile = await UserProfile.findOne({ userId });
    if (!profile) profile = await UserProfile.create({ userId, profilePhoto, bio });
    else {
      profile.profilePhoto = profilePhoto || profile.profilePhoto;
      profile.bio = bio || profile.bio;
      await profile.save();
    }
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
}

// Addresses
async function listAddresses(req, res, next) {
  try {
    const userId = req.user.id;
    const addrs = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean();
    res.json({ success: true, data: addrs });
  } catch (err) { next(err); }
}

async function createAddress(req, res, next) {
  try {
    const userId = req.user.id;
    const payload = { ...req.body, userId };
    if (payload.isDefault) {
      await Address.updateMany({ userId }, { $set: { isDefault: false } });
    }
    const addr = await Address.create(payload);
    res.json({ success: true, data: addr });
  } catch (err) { next(err); }
}

async function updateAddress(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const payload = req.body;
    if (payload.isDefault) await Address.updateMany({ userId }, { $set: { isDefault: false } });
    const addr = await Address.findOneAndUpdate({ _id: id, userId }, { $set: payload }, { new: true });
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });
    res.json({ success: true, data: addr });
  } catch (err) { next(err); }
}

async function deleteAddress(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const addr = await Address.findOneAndDelete({ _id: id, userId });
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });
    res.json({ success: true, data: addr });
  } catch (err) { next(err); }
}

async function getUserBookings(req, res, next) {
  try {
    const userId = req.user.id;
    const bookings = await Job.find({ client: userId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: bookings });
  } catch (err) { next(err); }
}

async function getUserPayments(req, res, next) {
  try {
    const userId = req.user.id;
    const payments = await Payment.find({ userId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: payments });
  } catch (err) { next(err); }
}

async function getServiceReports(req, res, next) {
  try {
    const userId = req.user.id;
    const reports = await Job.find({ client: userId, status: 'completed' }).select('_id assignedTechnician completedAt reportPdf').populate('assignedTechnician', 'name').lean();
    res.json({ success: true, data: reports });
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
  getUserBookings,
  getUserPayments,
  getServiceReports,
};
