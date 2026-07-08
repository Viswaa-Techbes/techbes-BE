const Attendance = require('../../models/Attendance');
const User = require('../../models/User');
const moment = require('moment');

function todayDateStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function adminClockIn(req, res, next) {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const date = todayDateStr();
    const existing = await Attendance.findOne({ userId, date });
    if (existing) return res.status(400).json({ success: false, message: 'Already clocked in today' });
    const rec = await Attendance.create({ userId, name: user.name, role: user.role, date, loginTime: new Date() });
    res.status(201).json({ success: true, data: rec });
  } catch (err) { next(err); }
}

async function adminClockOut(req, res, next) {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    const date = todayDateStr();
    const rec = await Attendance.findOne({ userId, date });
    if (!rec) return res.status(404).json({ success: false, message: 'Attendance record not found' });
    if (rec.logoutTime) return res.status(400).json({ success: false, message: 'Already clocked out' });
    rec.logoutTime = new Date();
    rec.workingHours = Math.max(0, (rec.logoutTime - rec.loginTime) / (1000 * 60 * 60));
    await rec.save();
    res.json({ success: true, data: rec });
  } catch (err) { next(err); }
}

/**
 * Mark Attendance (Login)
 */
async function markAttendance(userId) {
  try {
    const today = moment().format('YYYY-MM-DD');
    const user = await User.findById(userId);
    if (!user) return;

    const existing = await Attendance.findOne({ userId, date: today });
    if (!existing) {
      await Attendance.create({
        userId,
        name: user.name,
        role: user.role,
        date: today,
        loginTime: new Date(),
        status: 'present'
      });
      console.log(`[Attendance] Marked present for ${user.name} on ${today}`);
    }
  } catch (err) {
    console.error('[Attendance] Mark login error:', err.message);
  }
}

/**
 * Mark Logout
 */
async function markLogout(userId) {
  try {
    const today = moment().format('YYYY-MM-DD');
    const record = await Attendance.findOne({ userId, date: today });
    
    if (record && !record.logoutTime) {
      const now = new Date();
      const loginTime = record.loginTime;
      const hours = (now - loginTime) / (1000 * 60 * 60);
      
      record.logoutTime = now;
      record.workingHours = parseFloat(hours.toFixed(2));
      await record.save();
      console.log(`[Attendance] Marked logout for ${record.name}. Hours: ${record.workingHours}`);
    }
  } catch (err) {
    console.error('[Attendance] Mark logout error:', err.message);
  }
}

/**
 * Admin: Get Today's Attendance (with Absent logic)
 */
async function getTodayAttendance(req, res, next) {
  try {
    const today = moment().format('YYYY-MM-DD');
    
    // 1. Get all staff (technicians and managers)
    const staff = await User.find({ 
      role: { $in: ['technician', 'manager'] },
      isDeleted: { $ne: true }
    }).select('name role status isOnline').lean();

    // 2. Get today's attendance records
    const records = await Attendance.find({ date: today }).lean();
    const recordMap = new Map(records.map(r => [r.userId.toString(), r]));

    // 3. Merge and identify (Default: Present)
    const results = staff.map(u => {
      const record = recordMap.get(u._id.toString());
      if (record) {
        return {
          id: record._id,
          userId: u._id,
          name: u.name,
          role: u.role,
          date: today,
          status: record.status || 'present',
          loginTime: record.loginTime,
          logoutTime: record.logoutTime,
          workingHours: record.workingHours
        };
      } else {
        return {
          id: `default-present-${u._id}`,
          userId: u._id,
          name: u.name,
          role: u.role,
          date: today,
          status: 'present',
          loginTime: null,
          logoutTime: null,
          workingHours: 0
        };
      }
    });

    return res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Get Monthly Stats
 */
async function getMonthlyAttendance(req, res, next) {
  try {
    const { month, year } = req.query; 
    if (!month || !year) {
      return res.status(400).json({ success: false, message: 'month and year are required' });
    }

    const startOfMonth = moment(`${year}-${month.toString().padStart(2, '0')}-01`, 'YYYY-MM-DD');
    const endOfMonth = startOfMonth.clone().endOf('month');
    
    // Calculate how many days to consider (don't count future days)
    const now = moment();
    let endDayToCount = endOfMonth.date();
    if (now.isBefore(endOfMonth) && now.isAfter(startOfMonth)) {
      endDayToCount = now.date();
    } else if (now.isBefore(startOfMonth)) {
      endDayToCount = 0;
    }

    const staff = await User.find({ 
      role: { $in: ['technician', 'manager'] },
      isDeleted: { $ne: true }
    }).select('name role').lean();

    const records = await Attendance.find({
      date: { 
        $gte: startOfMonth.format('YYYY-MM-DD'), 
        $lte: endOfMonth.format('YYYY-MM-DD') 
      }
    }).lean();

    const userRecords = records.reduce((acc, r) => {
      const uid = r.userId.toString();
      if (!acc[uid]) acc[uid] = [];
      acc[uid].push(r);
      return acc;
    }, {});

    const stats = staff.map(u => {
      const uid = u._id.toString();
      const recs = userRecords[uid] || [];
      const absentDays = recs.filter(r => r.status === 'absent').length;
      
      // Default present means: Total days passed - days marked absent
      const presentDays = Math.max(0, endDayToCount - absentDays);
      const totalHours = recs.reduce((sum, r) => sum + (r.workingHours || 0), 0);

      return {
        name: u.name,
        role: u.role,
        presentDays,
        totalHours
      };
    });

    return res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Attendance Range for a User (for Calendar)
 */
async function getAttendanceRange(req, res, next) {
  try {
    const { userId, month, year } = req.query;
    if (!userId || !month || !year) {
      return res.status(400).json({ success: false, message: 'userId, month and year are required' });
    }

    const startOfMonth = moment(`${year}-${month.toString().padStart(2, '0')}-01`, 'YYYY-MM-DD');
    const endOfMonth = startOfMonth.clone().endOf('month');
    const today = moment().format('YYYY-MM-DD');

    // 1. Get existing records
    const records = await Attendance.find({
      userId,
      date: { 
        $gte: startOfMonth.format('YYYY-MM-DD'), 
        $lte: endOfMonth.format('YYYY-MM-DD') 
      }
    }).lean();

    const recordMap = new Map(records.map(r => [r.date, r]));

    // 2. Generate full month list
    const results = [];
    let current = startOfMonth.clone();
    while (current.isSameOrBefore(endOfMonth)) {
      const d = current.format('YYYY-MM-DD');
      const rec = recordMap.get(d);
      
      let status = 'none';
      if (rec) {
        status = rec.status;
      } else if (current.isSameOrBefore(moment(), 'day')) {
        status = 'present'; // Default
      }

      results.push({
        date: d,
        status: status,
        loginTime: rec?.loginTime || null,
        logoutTime: rec?.logoutTime || null,
        workingHours: rec?.workingHours || 0
      });
      current.add(1, 'day');
    }

    return res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

// Export for routes
async function handleMarkAttendance(req, res, next) {
  try {
    await markAttendance(req.user.id);
    return res.json({ success: true, message: 'Attendance marked' });
  } catch (err) {
    next(err);
  }
}

async function handleLogoutAttendance(req, res, next) {
  try {
    await markLogout(req.user.id);
    return res.json({ success: true, message: 'Logout recorded' });
  } catch (err) {
    next(err);
  }
}

async function updateAttendanceRecord(req, res, next) {
  try {
    const { id: userId } = req.params; // Expecting User ID
    const { status, date } = req.body;
    const targetDate = date || moment().format('YYYY-MM-DD');

    console.log(`[Attendance] Updating record: userId=${userId}, status=${status}, date=${targetDate}`);

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Atomic findOneAndUpdate with upsert
    const updateData = {
      status,
      name: user.name,
      role: user.role
    };

    await Attendance.findOneAndUpdate(
      { userId, date: targetDate },
      { 
        $set: updateData,
        $setOnInsert: { loginTime: new Date() } 
      },
      { upsert: true, new: true, runValidators: true }
    );

    return res.json({ success: true, message: 'Attendance updated' });
  } catch (err) {
    console.error('[Attendance] Update Error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Attendance record already exists/updated' });
    }
    next(err);
  }
}

module.exports = {
  markAttendance,
  markLogout,
  getTodayAttendance,
  getMonthlyAttendance,
  getAttendanceRange,
  handleMarkAttendance,
  handleLogoutAttendance,
  updateAttendanceRecord,
  adminClockIn,
  adminClockOut,
};
