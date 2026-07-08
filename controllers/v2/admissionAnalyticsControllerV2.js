const Admission = require('../../models/Admission');

// GET /api/v2/analytics/admissions/summary
async function getAdmissionSummary(req, res, next) {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [total, byStatus, byProgram, enrolledCount, monthly] = await Promise.all([
      Admission.countDocuments({}),
      Admission.aggregate([{ $group: { _id: '$admissionStatus', count: { $sum: 1 } } }]),
      Admission.aggregate([{ $group: { _id: '$programType', count: { $sum: 1 } } }]),
      Admission.countDocuments({ admissionStatus: 'enrolled' }),
      Admission.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    const monthlyFormatted = monthly.map(m => ({ month: `${m._id.year}-${String(m._id.month).padStart(2,'0')}`, value: m.count }));

    return res.json({ success: true, data: { total, byStatus, byProgram, enrolledCount, monthly: monthlyFormatted } });
  } catch (err) { next(err); }
}

// GET /api/v2/analytics/admissions/course-popularity
async function getCoursePopularity(req, res, next) {
  try {
    const data = await Admission.aggregate([
      { $group: { _id: '$assignedCourse', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

// GET /api/v2/analytics/admissions/geo
async function getGeo(req, res, next) {
  try {
    const byCity = await Admission.aggregate([
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 100 }
    ]);
    return res.json({ success: true, data: { byCity } });
  } catch (err) { next(err); }
}

// GET /api/v2/analytics/admissions/conversion
async function getConversion(req, res, next) {
  try {
    const total = await Admission.countDocuments({});
    const enrolled = await Admission.countDocuments({ admissionStatus: 'enrolled' });
    const conversion = total > 0 ? (enrolled / total) * 100 : 0;
    return res.json({ success: true, data: { total, enrolled, conversion: Number(conversion.toFixed(2)) } });
  } catch (err) { next(err); }
}

module.exports = { getAdmissionSummary, getCoursePopularity, getGeo, getConversion };
