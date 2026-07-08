const Course = require('../../models/Course');
const CourseEnrollment = require('../../models/CourseEnrollment');
const CourseInquiry = require('../../models/CourseInquiry');
const CoursePayment = require('../../models/CoursePayment');
const paymentService = require('../../services/paymentService');
const { getRazorpayCredentials } = require('../../config/razorpay');
const crypto = require('crypto');

const PLAN_AMOUNTS = {
  basic: 1,
  'job-ready': 1,
  premium: 1,
};

function normalizeCoursePayload(body) {
  return {
    title: body.title,
    slug: body.slug,
    description: body.description,
    long_description: body.long_description || '',
    price: Number(body.price) || 0,
    duration: body.duration,
    level: body.level || 'beginner',
    instructor_name: body.instructor_name,
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    max_students: Number.parseInt(body.max_students, 10) || 30,
    status: body.status || 'draft',
  };
}

async function listCourses(req, res, next) {
  try {
    const filter = { isDeleted: { $ne: true } };
    if (req.query.status) filter.status = req.query.status;

    const courses = await Course.find(filter).sort({ createdAt: -1 });
    return res.json({ success: true, courses, data: courses });
  } catch (err) {
    next(err);
  }
}

async function getCourse(req, res, next) {
  try {
    const filter = { _id: req.params.id, isDeleted: { $ne: true } };
    if (req.query.status) filter.status = req.query.status;

    const course = await Course.findOne(filter);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    return res.json({ success: true, course, data: course });
  } catch (err) {
    next(err);
  }
}

async function createCourse(req, res, next) {
  try {
    const course = await Course.create(normalizeCoursePayload(req.body));
    return res.status(201).json({ success: true, course, data: course });
  } catch (err) {
    next(err);
  }
}

async function deleteCourse(req, res, next) {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, status: 'archived' },
      { new: true }
    );
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    return res.json({ success: true, message: 'Course deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function listEnrollments(req, res, next) {
  try {
    const enrollments = await CourseEnrollment.find().sort({ enrollment_date: -1 });
    return res.json({ success: true, enrollments, data: enrollments });
  } catch (err) {
    next(err);
  }
}

async function createEnrollment(req, res, next) {
  try {
    const { course_id, student_name, student_email, student_phone } = req.body;
    if (!course_id || !student_name || !student_email || !student_phone) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const course = await Course.findOne({ _id: course_id, isDeleted: { $ne: true } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const enrollment = await CourseEnrollment.create({
      course_id,
      student_name,
      student_email,
      student_phone,
    });

    return res.status(201).json({
      success: true,
      enrollment,
      course: { id: course.id, title: course.title },
      message: 'Enrollment successful! Check your email for confirmation.',
      data: enrollment,
    });
  } catch (err) {
    next(err);
  }
}

async function updateEnrollment(req, res, next) {
  try {
    const enrollment = await CourseEnrollment.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!enrollment) return res.status(404).json({ success: false, message: 'Enrollment not found' });

    return res.json({ success: true, enrollment, data: enrollment });
  } catch (err) {
    next(err);
  }
}

async function listInquiries(req, res, next) {
  try {
    const inquiries = await CourseInquiry.find().sort({ createdAt: -1 });
    return res.json({ success: true, inquiries, data: inquiries });
  } catch (err) {
    next(err);
  }
}

async function createInquiry(req, res, next) {
  try {
    const { name, email, phone, message, course_interest } = req.body;
    if (!name || !email || !phone || !message) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const inquiry = await CourseInquiry.create({
      name,
      email,
      phone,
      message,
      course_interest: course_interest || null,
    });

    return res.status(201).json({
      success: true,
      inquiry,
      message: 'Thank you for your inquiry! We will get back to you soon.',
      data: inquiry,
    });
  } catch (err) {
    next(err);
  }
}

async function updateInquiry(req, res, next) {
  try {
    const inquiry = await CourseInquiry.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });

    return res.json({ success: true, inquiry, data: inquiry });
  } catch (err) {
    next(err);
  }
}

async function loginCourseAdmin(req, res) {
  const { email, password } = req.body;
  const adminEmail = process.env.COURSE_ADMIN_EMAIL;
  const adminPassword = process.env.COURSE_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return res.status(500).json({ success: false, message: 'Course admin credentials are not configured' });
  }

  if (email !== adminEmail || password !== adminPassword) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  return res.json({
    success: true,
    admin: {
      admin_id: 'course-admin',
      email: adminEmail,
      name: process.env.COURSE_ADMIN_NAME || 'Course Admin',
    },
  });
}

async function createCoursePaymentOrder(req, res, next) {
  try {
    const { name, email, phone, course = 'cctv-it', plan } = req.body;
    const amount = PLAN_AMOUNTS[plan];

    if (!name || !email || !phone || !plan || !amount) {
      return res.status(400).json({ success: false, message: 'Valid name, email, phone, and plan are required' });
    }

    const order = await paymentService.createRazorpayOrder(
      amount * 100,
      `TECHBES ${plan} course admission`,
      `course_${plan}_${Date.now()}`,
      null
    );

    const payment = await CoursePayment.create({
      name,
      email,
      phone,
      course,
      plan,
      amount,
      currency: order.currency,
      razorpayOrderId: order.orderId,
    });

    return res.status(201).json({
      success: true,
      data: {
        payment,
        order,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function verifyCoursePayment(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification details are required' });
    }

    const { keySecret } = getRazorpayCredentials();
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      await CoursePayment.findOneAndUpdate({ razorpayOrderId: razorpay_order_id }, { status: 'failed' });
      return res.status(400).json({ success: false, message: 'Payment signature verification failed' });
    }

    const payment = await CoursePayment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: 'paid',
      },
      { new: true }
    );

    if (!payment) return res.status(404).json({ success: false, message: 'Payment record not found' });

    return res.json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
}

async function getCourseAnalytics(req, res, next) {
  try {
    const [courses, publishedCourses, enrollments, inquiries, payments, paidPayments, revenueAgg, planBreakdown] =
      await Promise.all([
        Course.countDocuments({ isDeleted: { $ne: true } }),
        Course.countDocuments({ isDeleted: { $ne: true }, status: 'published' }),
        CourseEnrollment.countDocuments(),
        CourseInquiry.countDocuments(),
        CoursePayment.countDocuments(),
        CoursePayment.countDocuments({ status: 'paid' }),
        CoursePayment.aggregate([
          { $match: { status: 'paid' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        CoursePayment.aggregate([
          { $group: { _id: '$plan', count: { $sum: 1 }, revenue: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } } } },
          { $sort: { count: -1 } },
        ]),
      ]);

    const recentInquiries = await CourseInquiry.find().sort({ createdAt: -1 }).limit(5);
    const recentPayments = await CoursePayment.find().sort({ createdAt: -1 }).limit(5);

    return res.json({
      success: true,
      data: {
        totals: {
          courses,
          publishedCourses,
          enrollments,
          inquiries,
          payments,
          paidPayments,
          revenue: revenueAgg[0]?.total || 0,
        },
        planBreakdown,
        recentInquiries,
        recentPayments,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCourses,
  getCourse,
  createCourse,
  deleteCourse,
  listEnrollments,
  createEnrollment,
  updateEnrollment,
  listInquiries,
  createInquiry,
  updateInquiry,
  loginCourseAdmin,
  createCoursePaymentOrder,
  verifyCoursePayment,
  getCourseAnalytics,
};
