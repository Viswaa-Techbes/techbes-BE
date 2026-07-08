const Attendance = require('../models/Attendance');

async function checkIn(userId, location) {
  const today = new Date().toISOString().split('T')[0];
  
  let attendance = await Attendance.findOne({ user: userId, date: today });
  if (attendance && attendance.checkIn) {
    throw new Error('Already checked in today');
  }

  if (!attendance) {
    attendance = new Attendance({
      user: userId,
      date: today,
    });
  }

  attendance.checkIn = new Date();
  attendance.location = location;
  attendance.status = 'present';
  
  await attendance.save();
  return attendance;
}

async function checkOut(userId) {
  const today = new Date().toISOString().split('T')[0];
  
  const attendance = await Attendance.findOne({ user: userId, date: today });
  if (!attendance || !attendance.checkIn) {
    throw new Error('No check-in found for today');
  }

  if (attendance.checkOut) {
    throw new Error('Already checked out today');
  }

  attendance.checkOut = new Date();
  await attendance.save();
  return attendance;
}

async function getAttendanceHistory(userId, startDate, endDate) {
  const query = { user: userId };
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = startDate;
    if (endDate) query.date.$lte = endDate;
  }

  return await Attendance.find(query).sort({ date: -1 });
}

async function getAllAttendance({ date, month, year }) {
  const query = {};
  
  if (date) {
    query.date = date;
  } else if (month && year) {
    // Match YYYY-MM-DD where MM is the month
    const monthStr = month.toString().padStart(2, '0');
    query.date = new RegExp(`^${year}-${monthStr}-`);
  } else if (year) {
    query.date = new RegExp(`^${year}-`);
  }

  return await Attendance.find(query)
    .populate('user', 'name mobileNumber role')
    .sort({ date: -1, checkIn: -1 });
}

module.exports = {
  checkIn,
  checkOut,
  getAttendanceHistory,
  getAllAttendance,
};
