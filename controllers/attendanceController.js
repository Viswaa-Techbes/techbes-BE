const Attendance = require('../models/Attendance');
const User = require('../models/User');

exports.markAttendance = async (req, res, next) => {
  try {
    const userId = req.user.id; // from auth middleware
    const today = new Date().toISOString().split('T')[0];

    // Check if attendance already exists for today
    let attendance = await Attendance.findOne({ userId, date: today });

    if (!attendance) {
      attendance = await Attendance.create({
        userId,
        date: today,
        loginTime: new Date(),
        status: 'present'
      });
      console.log(`[Attendance] Marked Present for ${userId} on ${today}`);
      
      // Emit to websocket
      const io = req.app.get('io');
      if (io) io.emit('attendance_updated', attendance);
    } else {
      console.log(`[Attendance] Already marked for ${userId} on ${today}`);
    }

    return res.status(200).json({ success: true, data: attendance });
  } catch (err) {
    next(err);
  }
};

exports.markLogout = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const attendance = await Attendance.findOne({ userId, date: today });
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'No attendance record found for today' });
    }

    attendance.logoutTime = new Date();
    // Calculate working hours
    const diffMs = attendance.logoutTime - attendance.loginTime;
    attendance.workingHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

    await attendance.save();
    console.log(`[Attendance] Marked Logout for ${userId} on ${today}, worked ${attendance.workingHours} hours`);

    const io = req.app.get('io');
    if (io) io.emit('attendance_updated', attendance);

    return res.status(200).json({ success: true, data: attendance });
  } catch (err) {
    next(err);
  }
};

exports.getAttendanceByUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const records = await Attendance.find({ userId }).sort({ date: -1 });
    return res.status(200).json({ success: true, data: records });
  } catch (err) {
    next(err);
  }
};

exports.getAllAttendance = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch all users (technicians)
    const technicians = await User.find({ role: 'technician' });
    
    // Fetch today's attendance
    const todayAttendances = await Attendance.find({ date: today }).populate('userId', 'name email role');
    
    const attendanceMap = {};
    todayAttendances.forEach(a => {
      attendanceMap[a.userId._id.toString()] = a;
    });

    const result = technicians.map(tech => {
      const att = attendanceMap[tech._id.toString()];
      return {
        technicianId: tech._id,
        name: tech.name,
        email: tech.email,
        status: att ? att.status : 'absent',
        loginTime: att ? att.loginTime : null,
        logoutTime: att ? att.logoutTime : null,
        workingHours: att ? att.workingHours : 0
      };
    });

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
