/**
 * Analytics Controller V2
 * Provides aggregated business metrics for the Admin Dashboard.
 *
 * Endpoints:
 *   GET /api/v2/analytics/summary        — KPI cards
 *   GET /api/v2/analytics/revenue        — Revenue over time (daily/weekly/monthly)
 *   GET /api/v2/analytics/jobs           — Jobs by status + service type breakdown
 *   GET /api/v2/analytics/technicians    — Per-technician performance
 *   GET /api/v2/analytics/bookings       — Booking conversion funnel
 */

const Job = require('../../models/Job');
const User = require('../../models/User');
const Attendance = require('../../models/Attendance');

// ─────────────────────────────────────────────
// KPI Summary
// ─────────────────────────────────────────────
async function getSummary(req, res, next) {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalBookings,
      completedJobs,
      activeJobs,
      pendingJobs,
      totalRevenue,
      monthRevenue,
      lastMonthRevenue,
      totalTechnicians,
      onlineTechnicians,
      totalMembers,
    ] = await Promise.all([
      Job.countDocuments({}),
      Job.countDocuments({ status: { $in: ['completed', 'payment_done'] } }),
      Job.countDocuments({ status: { $in: ['assigned', 'in_progress', 'started', 'site_visited'] } }),
      Job.countDocuments({ status: 'pending' }),
      Job.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Job.aggregate([
        { $match: { paymentStatus: 'paid', updatedAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Job.aggregate([
        { $match: { paymentStatus: 'paid', updatedAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      User.countDocuments({ role: 'technician', isDeleted: { $ne: true } }),
      User.countDocuments({ role: 'technician', isOnline: true, isDeleted: { $ne: true } }),
      User.countDocuments({ role: 'client', isDeleted: { $ne: true } }),
    ]);

    const totalRev = totalRevenue[0]?.total || 0;
    const monthRev = monthRevenue[0]?.total || 0;
    const lastMonthRev = lastMonthRevenue[0]?.total || 0;

    const conversionRate = totalBookings > 0
      ? ((completedJobs / totalBookings) * 100).toFixed(1)
      : '0.0';

    const revenueGrowth = lastMonthRev > 0
      ? (((monthRev - lastMonthRev) / lastMonthRev) * 100).toFixed(1)
      : '0.0';

    return res.json({
      success: true,
      data: {
        totalBookings,
        completedJobs,
        activeJobs,
        pendingJobs,
        conversionRate: parseFloat(conversionRate),
        totalRevenue: totalRev,
        monthRevenue: monthRev,
        revenueGrowth: parseFloat(revenueGrowth),
        totalTechnicians,
        onlineTechnicians,
        totalMembers,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────
// Revenue Over Time
// ─────────────────────────────────────────────
async function getRevenue(req, res, next) {
  try {
    const { period = 'monthly', months = 6 } = req.query;
    const periodsBack = parseInt(months, 10) || 6;
    const now = new Date();

    let groupId, dateFrom;

    if (period === 'daily') {
      dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - periodsBack);
      groupId = {
        year: { $year: '$updatedAt' },
        month: { $month: '$updatedAt' },
        day: { $dayOfMonth: '$updatedAt' },
      };
    } else if (period === 'weekly') {
      dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - periodsBack * 7);
      groupId = {
        year: { $year: '$updatedAt' },
        week: { $week: '$updatedAt' },
      };
    } else {
      // monthly
      dateFrom = new Date(now.getFullYear(), now.getMonth() - periodsBack + 1, 1);
      groupId = {
        year: { $year: '$updatedAt' },
        month: { $month: '$updatedAt' },
      };
    }

    const revenue = await Job.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          updatedAt: { $gte: dateFrom },
        },
      },
      {
        $group: {
          _id: groupId,
          revenue: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } },
    ]);

    // Format labels
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const formatted = revenue.map((r) => {
      let label = '';
      if (period === 'daily') {
        label = `${r._id.day}/${r._id.month}`;
      } else if (period === 'weekly') {
        label = `W${r._id.week} ${r._id.year}`;
      } else {
        label = `${MONTH_NAMES[(r._id.month || 1) - 1]} ${r._id.year}`;
      }
      return { label, revenue: r.revenue, jobs: r.count };
    });

    return res.json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────
// Jobs Breakdown
// ─────────────────────────────────────────────
async function getJobsBreakdown(req, res, next) {
  try {
    const [byStatus, byServiceType] = await Promise.all([
      Job.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Job.aggregate([
        { $group: { _id: '$serviceType', count: { $sum: 1 } } },
      ]),
    ]);

    return res.json({
      success: true,
      data: {
        byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
        byServiceType: byServiceType.map((s) => ({ type: s._id || 'other', count: s.count })),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────
// Technician Performance
// ─────────────────────────────────────────────
async function getTechnicianPerformance(req, res, next) {
  try {
    const [jobStats, attendanceStats] = await Promise.all([
      Job.aggregate([
        { $match: { assignedTechnician: { $ne: null } } },
        {
          $group: {
            _id: '$assignedTechnician',
            totalJobs: { $sum: 1 },
            completedJobs: {
              $sum: {
                $cond: [{ $in: ['$status', ['completed', 'payment_done']] }, 1, 0],
              },
            },
            totalRevenue: {
              $sum: {
                $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$amount', 0],
              },
            },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'technician',
          },
        },
        { $unwind: { path: '$technician', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            technicianId: '$_id',
            name: '$technician.name',
            specialty: '$technician.specialty',
            isOnline: '$technician.isOnline',
            totalJobs: 1,
            completedJobs: 1,
            totalRevenue: 1,
            completionRate: {
              $cond: [
                { $gt: ['$totalJobs', 0] },
                { $multiply: [{ $divide: ['$completedJobs', '$totalJobs'] }, 100] },
                0,
              ],
            },
          },
        },
        { $sort: { completedJobs: -1 } },
        { $limit: 20 },
      ]),
      Attendance.aggregate([
        {
          $group: {
            _id: '$userId',
            daysPresent: { $sum: 1 },
            totalHours: { $sum: '$workingHours' },
          },
        },
      ]),
    ]);

    // Merge attendance data
    const attendanceMap = attendanceStats.reduce((acc, a) => {
      acc[a._id.toString()] = { daysPresent: a.daysPresent, totalHours: a.totalHours };
      return acc;
    }, {});

    const result = jobStats.map((t) => ({
      ...t,
      completionRate: parseFloat((t.completionRate || 0).toFixed(1)),
      daysPresent: attendanceMap[t.technicianId?.toString()]?.daysPresent || 0,
      totalHours: parseFloat((attendanceMap[t.technicianId?.toString()]?.totalHours || 0).toFixed(1)),
    }));

    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────
// Booking Funnel
// ─────────────────────────────────────────────
async function getBookingFunnel(req, res, next) {
  try {
    const [total, assigned, inProgress, completed, paid] = await Promise.all([
      Job.countDocuments({}),
      Job.countDocuments({ status: { $in: ['assigned', 'site_visited', 'in_progress', 'started'] } }),
      Job.countDocuments({ status: { $in: ['in_progress', 'started', 'work_uploaded'] } }),
      Job.countDocuments({ status: { $in: ['completed', 'payment_done', 'completion_requested', 'approved_by_manager'] } }),
      Job.countDocuments({ paymentStatus: 'paid' }),
    ]);

    return res.json({
      success: true,
      data: [
        { stage: 'Booking Created', count: total },
        { stage: 'Technician Assigned', count: assigned },
        { stage: 'Work In Progress', count: inProgress },
        { stage: 'Job Completed', count: completed },
        { stage: 'Payment Received', count: paid },
      ],
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
  getRevenue,
  getJobsBreakdown,
  getTechnicianPerformance,
  getBookingFunnel,
};
