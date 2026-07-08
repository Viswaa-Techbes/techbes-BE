const User = require('../models/User');
const { signToken } = require('../utils/jwt');

async function loginUser(identifier, password) {
  const normalizedIdentifier = identifier.trim();
  const normalizedLower = identifier.trim().toLowerCase();
  const user = await User.findOne({
    $or: [
      { mobileNumber: normalizedIdentifier },
      { email: normalizedLower },
      { employeeId: normalizedIdentifier },
      { employeeCode: normalizedIdentifier },
      { employeeId: normalizedIdentifier.toUpperCase() },
      { employeeCode: normalizedIdentifier.toUpperCase() },
    ],
  }).select('+password');
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const ok = await user.comparePassword(password);
  if (!ok) {
    throw new Error('Invalid credentials');
  }

  const token = signToken(user._id, user.role);
  
  // Update status
  user.isOnline = true;
  user.sessionActive = true;
  user.lastSeen = new Date();
  await user.save();

  return { token, user: user.toSafeObject() };
}

async function registerUser(userData) {
  const { name, mobileNumber, email, password, role = 'client', phone, specialty, assignedManager, userType } = userData;

  if (!mobileNumber && !phone) {
    throw new Error('phone is required');
  }

  if (!password) {
    throw new Error('password is required');
  }

  const normalizedMobile = String(mobileNumber || phone).trim();
  const normalizedEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : '';

  const existing = await User.findOne({ mobileNumber: normalizedMobile });
  if (existing) {
    throw new Error('Mobile number already registered');
  }

  if (normalizedEmail) {
    const existingEmailUser = await User.findOne({ email: normalizedEmail });
    if (existingEmailUser) {
      throw new Error('Email already registered');
    }
  }

  const user = await User.create({
    name: (name ?? '').trim(),
    mobileNumber: normalizedMobile,
    ...(normalizedEmail ? { email: normalizedEmail } : {}),
    password,
    role: ['admin', 'manager', 'technician'].includes(role) ? role : 'client',
    phone: phone ?? normalizedMobile,
    specialty,
    assignedManager,
    userType,
    isOnline: true,
    sessionActive: true,
    lastSeen: new Date(),
  });

  const token = signToken(user._id, user.role);
  return { token, user: user.toSafeObject() };
}

async function logoutUser(userId) {
  const user = await User.findById(userId);
  if (user) {
    user.isOnline = false;
    user.sessionActive = false;
    await user.save();
  }
}

module.exports = {
  loginUser,
  registerUser,
  logoutUser,
};
