const mongoose = require('mongoose');
const crypto = require('crypto');
const Masterclass = require('../../models/Masterclass');
const Registration = require('../../models/Registration');
const CctvPayment = require('../../models/CctvPayment');
const Certificate = require('../../models/Certificate');
const AuditLog = require('../../models/AuditLog');
const paymentService = require('../../services/paymentService');
const { getRazorpayCredentials } = require('../../config/razorpay');
const cctvCertificateService = require('../../services/cctvCertificateService');
const { getTransporter, formatFromAddress, sendZoomClassEmail } = require('../../services/emailService');

// Helper to format/validate URL
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// ─── 1. POST /api/v2/cctv-course/registrations ──────────────────────────────
async function createRegistration(req, res, next) {
  try {
    const { name, email, mobile, location, qualification, whatsapp, masterclassId, courseId } = req.body;

    if (!name || !email || !mobile || !location || !qualification) {
      return res.status(400).json({ success: false, message: 'Missing required registration fields' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanMobile = String(mobile).trim();

    let targetMasterclassId = masterclassId || courseId;

    // If masterclassId is not provided, auto-select the latest published active masterclass
    if (!targetMasterclassId) {
      const activeMc = await Masterclass.findOne({ registrationOpen: true, status: 'published' }).sort({ date: 1 });
      if (!activeMc) {
        return res.status(404).json({ success: false, message: 'No active masterclass found' });
      }
      targetMasterclassId = activeMc._id;
    }

    const mc = await Masterclass.findById(targetMasterclassId);
    if (!mc || !mc.registrationOpen) {
      return res.status(400).json({ success: false, message: 'Registration is closed for this masterclass' });
    }

    // Duplicate check: if user has already paid for this course
    const existing = await Registration.findOne({
      $or: [{ email: cleanEmail }, { mobile: cleanMobile }],
      masterclassId: targetMasterclassId,
    });

    if (existing && existing.paymentStatus === 'PAID') {
      return res.status(409).json({
        success: false,
        message: 'You are already registered and confirmed for this masterclass.',
        registrationId: existing._id,
        enrollmentId: existing.enrollmentId,
      });
    }

    // If registration exists but is pending/failed/cancelled, reuse and update it
    let registration = existing;
    if (!registration) {
      registration = new Registration({
        masterclassId: targetMasterclassId,
        courseId: targetMasterclassId,
        courseName: mc.title,
        name: String(name).trim(),
        email: cleanEmail,
        mobile: cleanMobile,
        location: String(location).trim(),
        qualification: String(qualification).trim(),
        whatsapp: whatsapp ? String(whatsapp).trim() : cleanMobile,
        paymentStatus: 'PENDING',
        registrationStatus: 'PENDING',
        amount: mc.price || 499,
        currency: 'INR',
      });
      await registration.save();
    } else {
      registration.name = String(name).trim();
      registration.location = String(location).trim();
      registration.qualification = String(qualification).trim();
      registration.whatsapp = whatsapp ? String(whatsapp).trim() : registration.whatsapp || cleanMobile;
      registration.amount = mc.price || 499;
      registration.currency = 'INR';
      registration.courseId = targetMasterclassId;
      registration.courseName = mc.title;
      registration.paymentStatus = 'PENDING';
      registration.registrationStatus = 'PENDING';
      await registration.save();
    }

    return res.status(201).json({
      success: true,
      registrationId: registration._id,
      amount: registration.amount,
      courseName: mc.title,
      message: 'Registration initiated successfully',
    });
  } catch (err) {
    next(err);
  }
}

// ─── 2. POST /api/v2/cctv-course/razorpay/create-order ───────────────────────
async function createRazorpayOrder(req, res, next) {
  try {
    const { registrationId } = req.body;
    if (!registrationId) {
      return res.status(400).json({ success: false, message: 'Missing registrationId' });
    }

    const reg = await Registration.findById(registrationId);
    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    if (reg.paymentStatus === 'PAID') {
      return res.status(400).json({ success: false, message: 'This registration has already been paid and confirmed.' });
    }

    const mc = await Masterclass.findById(reg.masterclassId);
    if (!mc) {
      return res.status(404).json({ success: false, message: 'Masterclass not found' });
    }

    // Authoritative pricing from Masterclass record (defaults to ₹499)
    const authoritativePrice = mc.price || 499;
    reg.amount = authoritativePrice;
    const amountInPaise = Math.round(authoritativePrice * 100);
    const description = `Enrollment fee for ${mc.title}`;
    const receipt = `reg_${reg._id}`;

    // Call paymentService helper
    const order = await paymentService.createRazorpayOrder(amountInPaise, description, receipt, null);

    reg.razorpayOrderId = order.orderId;
    await reg.save();

    return res.json({
      success: true,
      key_id: order.keyId || order.razorpayKey,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency || 'INR',
      courseName: reg.courseName || mc.title,
      order: {
        id: order.orderId,
        amount: order.amount,
        currency: order.currency || 'INR',
        receipt: order.receipt,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── 3. POST /api/v2/cctv-course/razorpay/verify ─────────────────────────────
async function verifyRazorpayPayment(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, registrationId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment signature verification details' });
    }

    // Cryptographic signature verification
    const { keySecret } = getRazorpayCredentials();
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const signatureVerified = (expectedSignature === razorpay_signature);

    // Locate registration by order id or provided registrationId
    let reg = await Registration.findOne({ razorpayOrderId: razorpay_order_id });
    if (!reg && registrationId) {
      reg = await Registration.findById(registrationId);
    }

    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration record not found for this order' });
    }

    // Idempotent handling: If already PAID, return success response immediately
    if (reg.paymentStatus === 'PAID') {
      const cert = await Certificate.findOne({ registrationId: reg._id });
      return res.json({
        success: true,
        ok: true,
        alreadyPaid: true,
        registrationId: reg._id,
        enrollmentId: reg.enrollmentId,
        name: reg.name,
        email: reg.email,
        amount: reg.amount,
        courseName: reg.courseName,
        paymentStatus: 'PAID',
        certificateId: cert ? cert.certificateId : null,
      });
    }

    const mc = await Masterclass.findById(reg.masterclassId);
    const amountNum = mc ? (mc.price || 499) : 499;
    reg.amount = amountNum;

    // Record payment attempt
    await CctvPayment.create({
      registrationId: reg._id,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: amountNum,
      currency: 'INR',
      status: signatureVerified ? 'captured' : 'failed',
      signatureVerified,
      webhookVerified: false,
      paidAt: new Date(),
    });

    if (!signatureVerified) {
      reg.paymentStatus = 'FAILED';
      await reg.save();
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed. The payment signature could not be verified.',
      });
    }

    // Mark registration as PAID
    reg.paymentStatus = 'PAID';
    reg.registrationStatus = 'REGISTERED';
    reg.razorpayPaymentId = razorpay_payment_id;
    reg.razorpaySignature = razorpay_signature;
    reg.paidAt = new Date();
    reg.courseType = 'CCTV_MASTERCLASS';
    if (!reg.courseName && mc) {
      reg.courseName = mc.title;
    }

    // Generate unique sequential enrollment ID: TB-CCTV-2026-XXXXXX
    if (!reg.enrollmentId) {
      const count = await Registration.countDocuments({ enrollmentId: { $exists: true, $ne: null } });
      const seq = String(count + 1).padStart(6, '0');
      reg.enrollmentId = `TB-CCTV-2026-${seq}`;
      reg.registrationId = reg.enrollmentId;
    }

    await reg.save();

    // Certificate generation (safe, non-blocking)
    let certificate = null;
    if (mc && mc.certificateEnabled) {
      try {
        const certificateId = `CERT-CCTV-${Math.floor(100000 + Math.random() * 900000)}`;
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        const pdfUrlPath = await cctvCertificateService.generateCertificatePdf({
          participantName: reg.name,
          programName: mc.title,
          issueDate: new Date(),
          certificateId,
        });

        certificate = await Certificate.create({
          certificateId,
          registrationId: reg._id,
          masterclassId: mc._id,
          participantName: reg.name,
          programName: mc.title,
          issueDate: new Date(),
          pdfPath: pdfUrlPath,
          verificationUrl: `${frontendUrl}/certificate/${certificateId}`,
        });

        reg.certificateStatus = 'ELIGIBLE';
        await reg.save();
      } catch (certErr) {
        console.error('[Certificate] Failed to generate certificate during payment verification:', certErr.message);
      }
    }

    // Confirmation Email (safe, non-blocking - email failure MUST NOT break registration)
    try {
      const transporter = getTransporter();
      if (transporter && mc) {
        const rawFrom = process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER;
        const fromMail = formatFromAddress(rawFrom);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        let emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0f172a; color: #ffffff; padding: 28px; border-radius: 12px;">
            <h2 style="color: #e5a833; margin-top: 0;">Payment Confirmed!</h2>
            <p>Hello ${reg.name},</p>
            <p>Your enrollment in <strong>${mc.title}</strong> is confirmed. We have successfully processed your payment of ₹${reg.amount}.</p>
            
            <div style="background-color: #1e293b; padding: 18px; border-radius: 8px; margin: 24px 0; border: 1px solid #334155;">
              <h3 style="margin-top: 0; color: #e5a833;">Masterclass Schedule</h3>
              <p style="margin: 4px 0;"><strong>Date:</strong> ${mc.date ? new Date(mc.date).toDateString() : 'Upcoming'}</p>
              <p style="margin: 4px 0;"><strong>Time:</strong> ${mc.startTime || '10:00 AM'} - ${mc.endTime || '04:00 PM'}</p>
              <p style="margin: 4px 0;"><strong>Duration:</strong> ${mc.duration || '1 Day'}</p>
              <p style="margin: 4px 0;"><strong>Enrollment ID:</strong> <span style="color: #e5a833; font-family: monospace;">${reg.enrollmentId}</span></p>
            </div>
        `;

        if (certificate) {
          emailHtml += `
            <p>Your participation certificate record is registered online:</p>
            <p style="margin: 24px 0;">
              <a href="${frontendUrl}/certificate/${certificate.certificateId}" style="display: inline-block; background-color: #e5a833; color: #0f172a; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Certificate Record</a>
            </p>
          `;
        }

        emailHtml += `
            <p style="color: #94a3b8; font-size: 13px; margin-top: 32px; border-top: 1px solid #334155; padding-top: 16px;">
              You will receive the online class link via email before the session. If you have any questions, reply to this email.
            </p>
            <p style="color: #e5a833; font-weight: bold; margin: 0;">TechBes Team</p>
          </div>
        `;

        await transporter.sendMail({
          from: fromMail,
          to: reg.email,
          subject: `Enrollment Confirmed: ${mc.title}`,
          html: emailHtml,
        });
      }
    } catch (mailErr) {
      console.error('[Email] Failed to send payment confirmation email:', mailErr.message);
    }

    return res.json({
      success: true,
      ok: true,
      registrationId: reg._id,
      enrollmentId: reg.enrollmentId,
      name: reg.name,
      email: reg.email,
      amount: reg.amount,
      courseName: reg.courseName || (mc ? mc.title : 'CCTV Masterclass'),
      paymentStatus: 'PAID',
      certificateId: certificate ? certificate.certificateId : null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── 4. POST /api/v2/cctv-course/cancel-payment ──────────────────────────────
async function cancelPayment(req, res, next) {
  try {
    const { registrationId, status = 'CANCELLED', reason } = req.body;
    if (!registrationId) {
      return res.status(400).json({ success: false, message: 'Missing registrationId' });
    }

    const reg = await Registration.findById(registrationId);
    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    // Do not downgrade an already PAID registration
    if (reg.paymentStatus !== 'PAID') {
      reg.paymentStatus = status === 'FAILED' ? 'FAILED' : 'CANCELLED';
      await reg.save();
    }

    return res.json({ success: true, message: `Payment marked as ${reg.paymentStatus}` });
  } catch (err) {
    next(err);
  }
}

// ─── 5. GET /api/v2/cctv-course/registrations/:id ────────────────────────────
async function getPublicRegistrationDetails(req, res, next) {
  try {
    const reg = await Registration.findById(req.params.id)
      .select('name email mobile location qualification amount paymentStatus registrationStatus enrollmentId courseName createdAt paidAt certificateStatus')
      .lean();

    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    return res.json({
      success: true,
      data: {
        registrationId: reg._id,
        enrollmentId: reg.enrollmentId || null,
        name: reg.name,
        email: reg.email,
        mobile: reg.mobile,
        courseName: reg.courseName || 'TechBes CCTV Masterclass',
        amount: reg.amount || 499,
        paymentStatus: reg.paymentStatus,
        registrationStatus: reg.registrationStatus,
        certificateStatus: reg.certificateStatus,
        createdAt: reg.createdAt,
        paidAt: reg.paidAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── 6. POST /api/v2/cctv-course/razorpay/webhook ────────────────────────────
async function webhookHandler(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'] || '';
    const payload = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);

    const { keySecret } = getRazorpayCredentials();
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || keySecret;
    const expected = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    if (expected !== signature) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const body = typeof req.body === 'object' ? req.body : JSON.parse(payload);
    const event = body.event;

    if (event === 'payment.captured') {
      const { order_id, payment_id, amount } = body.payload.payment.entity;

      const reg = await Registration.findOne({ razorpayOrderId: order_id });
      if (reg && reg.paymentStatus !== 'PAID') {
        const mc = await Masterclass.findById(reg.masterclassId);

        reg.paymentStatus = 'PAID';
        reg.registrationStatus = 'REGISTERED';
        reg.razorpayPaymentId = payment_id;
        reg.paidAt = new Date();
        reg.courseType = 'CCTV_MASTERCLASS';
        if (mc && !reg.courseName) reg.courseName = mc.title;

        if (!reg.enrollmentId) {
          const count = await Registration.countDocuments({ enrollmentId: { $exists: true, $ne: null } });
          const seq = String(count + 1).padStart(6, '0');
          reg.enrollmentId = `TB-CCTV-2026-${seq}`;
          reg.registrationId = reg.enrollmentId;
        }
        await reg.save();

        await CctvPayment.create({
          registrationId: reg._id,
          razorpayOrderId: order_id,
          razorpayPaymentId: payment_id,
          amount: amount / 100,
          currency: 'INR',
          status: 'captured',
          signatureVerified: true,
          webhookVerified: true,
          paidAt: new Date(),
        });
      }
    } else if (event === 'payment.failed') {
      const { order_id } = body.payload.payment.entity;
      const reg = await Registration.findOne({ razorpayOrderId: order_id });
      if (reg && reg.paymentStatus !== 'PAID') {
        reg.paymentStatus = 'FAILED';
        await reg.save();
      }
    }

    return res.json({ success: true, ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── 7. GET /api/v2/cctv-course/certificates/:id ─────────────────────────────
async function getCertificateDetails(req, res, next) {
  try {
    const cert = await Certificate.findOne({ certificateId: req.params.id });
    if (!cert) {
      return res.status(404).json({ success: false, message: 'Certificate not found or invalid' });
    }
    return res.json({ success: true, data: cert, certificate: cert });
  } catch (err) {
    next(err);
  }
}

// ─── 8. GET /api/v2/cctv-course/admin/masterclass/stats ──────────────────────
async function getAdminStats(req, res, next) {
  try {
    const total = await Registration.countDocuments();
    const paid = await Registration.countDocuments({ paymentStatus: 'PAID' });
    const pending = await Registration.countDocuments({ paymentStatus: 'PENDING' });
    const failed = await Registration.countDocuments({ paymentStatus: { $in: ['FAILED', 'CANCELLED'] } });
    const zoomSent = await Registration.countDocuments({ zoomLinkSent: true });

    // Revenue: sum amount for PAID registrations
    const revenueAgg = await Registration.aggregate([
      { $match: { paymentStatus: 'PAID' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const revenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

    return res.json({
      success: true,
      data: { total, paid, pending, failed, zoomSent, revenue },
      stats: { total, paid, pending, failed, zoomSent, revenue },
    });
  } catch (err) {
    next(err);
  }
}

// ─── 9. GET /api/v2/cctv-course/admin/registrations ──────────────────────────
async function getAdminRegistrations(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = {};

    // Payment Status filter
    if (req.query.status && req.query.status !== 'ALL') {
      const allowed = ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'];
      if (allowed.includes(req.query.status)) {
        filter.paymentStatus = req.query.status;
      }
    }

    // Zoom Status filter
    if (req.query.zoomStatus && req.query.zoomStatus !== 'ALL') {
      if (req.query.zoomStatus === 'SENT') {
        filter.zoomLinkSent = true;
      } else if (req.query.zoomStatus === 'NOT_SENT') {
        filter.zoomLinkSent = false;
      } else if (req.query.zoomStatus === 'FAILED') {
        filter.zoomLinkEmailStatus = 'FAILED';
      }
    }

    // Course filter
    if (req.query.courseId && req.query.courseId !== 'ALL') {
      filter.masterclassId = req.query.courseId;
    }

    // Date filter
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const to = new Date(req.query.to);
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }

    // Search filter
    if (req.query.search) {
      const term = String(req.query.search).trim();
      const re = new RegExp(term, 'i');
      filter.$or = [{ name: re }, { email: re }, { mobile: re }, { enrollmentId: re }, { registrationId: re }];
    }

    // Sort order
    const sortField = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortOrder };

    const [registrations, total] = await Promise.all([
      Registration.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('masterclassId', 'title date startTime endTime price')
        .lean(),
      Registration.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: registrations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── 10. GET /api/v2/cctv-course/admin/registrations/:id ─────────────────────
async function getAdminRegistrationById(req, res, next) {
  try {
    const reg = await Registration.findById(req.params.id)
      .populate('masterclassId')
      .populate('lastZoomSentBy', 'name email')
      .lean();

    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    const payments = await CctvPayment.find({ registrationId: reg._id }).sort({ createdAt: -1 }).lean();
    const certificate = await Certificate.findOne({ registrationId: reg._id }).lean();

    return res.json({
      success: true,
      data: {
        ...reg,
        payments,
        certificate,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Helper to safely check and cast ObjectId
function getValidObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

// Helper to safely mask email for audit/logging (e.g., sp****@gmail.com)
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '****';
  const parts = email.split('@');
  if (parts.length !== 2) return '****';
  const name = parts[0];
  const domain = parts[1];
  const visible = name.length > 2 ? name.substring(0, 2) : name.substring(0, 1);
  return `${visible}****@${domain}`;
}

// ─── 11. POST /api/v2/cctv-course/admin/registrations/bulk-send-zoom ─────────
async function bulkSendZoomLink(req, res, next) {
  try {
    const {
      registrationIds,
      zoomLink,
      classTitle = 'TechBes CCTV Masterclass',
      classDate = '',
      classTime = '',
      message = '',
    } = req.body;

    if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select at least one student to send the Zoom link.' });
    }

    if (registrationIds.length > 200) {
      return res.status(400).json({ success: false, message: 'Maximum 200 students can be processed in a single batch.' });
    }

    const cleanZoomLink = String(zoomLink || '').trim();
    if (!cleanZoomLink || !isValidUrl(cleanZoomLink)) {
      return res.status(400).json({
        success: false,
        message: 'A valid HTTP/HTTPS Zoom meeting URL is required (e.g., https://zoom.us/j/1234567890).',
      });
    }

    // Fetch the target registrations
    const registrations = await Registration.find({
      _id: { $in: registrationIds },
    });

    if (registrations.length === 0) {
      return res.status(404).json({ success: false, message: 'No matching registrations found.' });
    }

    const results = [];
    let sentCount = 0;
    let failedCount = 0;

    // Process in controlled batches of 5 to protect SMTP connection limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < registrations.length; i += BATCH_SIZE) {
      const batch = registrations.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (reg) => {
          // Check for registered email
          if (!reg.email || !reg.email.includes('@')) {
            console.error(`[Masterclass Email]\nrecipient: (missing)\ntemplate: CCTV_MASTERCLASS_CLASS_LINK\nstatus: failure\nerror: No valid email address registered`);
            reg.zoomLinkSent = false;
            reg.zoomLinkEmailStatus = 'FAILED';
            reg.zoomLinkEmailError = 'No valid email address registered';
            reg.classLinkSendStatus = 'FAILED';
            reg.classLinkSendError = 'No valid email address registered';
            await reg.save();

            failedCount++;
            results.push({
              id: reg._id,
              name: reg.name,
              email: reg.email || '(none)',
              status: 'FAILED',
              error: 'No valid email address registered',
            });
            return;
          }

          try {
            await sendZoomClassEmail({
              to: reg.email,
              name: reg.name,
              courseName: classTitle || reg.courseName || 'TechBes CCTV Masterclass',
              classDate,
              classTime,
              zoomLink: cleanZoomLink,
              message,
            });

            // Update registration with success status
            const now = new Date();
            reg.zoomLinkSent = true;
            reg.zoomLinkSentAt = now;
            reg.zoomLinkEmailStatus = 'SENT';
            reg.zoomLinkEmailError = '';
            reg.zoomMeetingLink = cleanZoomLink;
            reg.zoomClassTitle = classTitle;
            reg.zoomClassDate = classDate;
            reg.zoomClassTime = classTime;
            const sentBy = getValidObjectId(req.user?.id || req.user?._id);
            reg.lastZoomSentBy = sentBy;

            // Compatibility status fields
            reg.classLinkSentAt = now;
            reg.classLinkSendStatus = 'SENT';
            reg.classLinkSendError = '';
            reg.classLinkSentBy = sentBy;
            await reg.save();

            sentCount++;
            results.push({
              id: reg._id,
              name: reg.name,
              email: reg.email,
              status: 'SENT',
            });

            console.log(`[Masterclass Email]\nrecipient: ${maskEmail(reg.email)}\ntemplate: CCTV_MASTERCLASS_CLASS_LINK\nstatus: success`);
          } catch (err) {
            console.error(`[Masterclass Email]\nrecipient: ${maskEmail(reg.email)}\ntemplate: CCTV_MASTERCLASS_CLASS_LINK\nstatus: failure\nerror: ${err.message || 'SMTP delivery failed'}`);

            // Record failure on user record
            reg.zoomLinkSent = false;
            reg.zoomLinkEmailStatus = 'FAILED';
            reg.zoomLinkEmailError = err.message || 'SMTP delivery failed';
            reg.classLinkSendStatus = 'FAILED';
            reg.classLinkSendError = err.message || 'SMTP delivery failed';
            await reg.save();

            failedCount++;
            results.push({
              id: reg._id,
              name: reg.name,
              email: reg.email,
              status: 'FAILED',
              error: err.message || 'Failed to deliver email. Please check SMTP settings or retry.',
            });
          }
        })
      );

      // Brief delay between batches
      if (i + BATCH_SIZE < registrations.length) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    // Structured lists for detailed reporting
    const sentList = results.filter((r) => r.status === 'SENT').map((r) => ({
      studentId: r.id,
      name: r.name,
      email: r.email,
    }));
    const failedList = results.filter((r) => r.status === 'FAILED').map((r) => ({
      studentId: r.id,
      name: r.name,
      email: r.email,
      reason: r.error || 'Delivery failed',
    }));

    // Audit Logging
    try {
      await AuditLog.create({
        actorId: getValidObjectId(req.user?.id || req.user?._id),
        actorEmail: req.user?.email || 'admin',
        actorRole: req.user?.role || 'admin',
        action: 'BULK_SEND_ZOOM',
        entityType: 'cctv_course',
        status: failedCount > 0 ? (sentCount > 0 ? 'warning' : 'failure') : 'success',
        details: {
          total: registrations.length,
          sent: sentCount,
          failed: failedCount,
          course: classTitle,
          zoomLink: cleanZoomLink,
        },
      });
    } catch (auditErr) {
      console.warn('[AuditLog] Failed to record zoom send log:', auditErr.message);
    }

    return res.json({
      success: true,
      message: `Completed: ${sentCount} sent, ${failedCount} failed`,
      total: registrations.length,
      sent: sentCount,
      failed: failedCount,
      results,
      sentList,
      failedList,
    });
  } catch (err) {
    next(err);
  }
}

// ─── 12. POST /api/v2/cctv-course/admin/registrations/:id/send-zoom ──────────
async function sendSingleZoomLink(req, res, next) {
  try {
    const {
      zoomLink,
      classTitle = 'TechBes CCTV Masterclass',
      classDate = '',
      classTime = '',
      message = '',
    } = req.body;

    const cleanZoomLink = String(zoomLink || '').trim();
    if (!cleanZoomLink || !isValidUrl(cleanZoomLink)) {
      return res.status(400).json({
        success: false,
        message: 'A valid HTTP/HTTPS Zoom meeting URL is required.',
      });
    }

    const reg = await Registration.findById(req.params.id);
    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    if (!reg.email || !reg.email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Student has no valid registered email address.',
      });
    }

    try {
      await sendZoomClassEmail({
        to: reg.email,
        name: reg.name,
        courseName: classTitle || reg.courseName || 'TechBes CCTV Masterclass',
        classDate,
        classTime,
        zoomLink: cleanZoomLink,
        message,
      });

      const now = new Date();
      reg.zoomLinkSent = true;
      reg.zoomLinkSentAt = now;
      reg.zoomLinkEmailStatus = 'SENT';
      reg.zoomLinkEmailError = '';
      reg.zoomMeetingLink = cleanZoomLink;
      reg.zoomClassTitle = classTitle;
      reg.zoomClassDate = classDate;
      reg.zoomClassTime = classTime;
      const sentBy = getValidObjectId(req.user?.id || req.user?._id);
      reg.lastZoomSentBy = sentBy;

      reg.classLinkSentAt = now;
      reg.classLinkSendStatus = 'SENT';
      reg.classLinkSendError = '';
      reg.classLinkSentBy = sentBy;
      await reg.save();

      console.log(`[Masterclass Email]\nrecipient: ${maskEmail(reg.email)}\ntemplate: CCTV_MASTERCLASS_CLASS_LINK\nstatus: success`);

      // Audit Log
      try {
        await AuditLog.create({
          actorId: getValidObjectId(req.user?.id || req.user?._id),
          actorEmail: req.user?.email || 'admin',
          actorRole: req.user?.role || 'admin',
          action: 'SEND_ZOOM_SINGLE',
          entityType: 'cctv_course',
          entityId: reg._id.toString(),
          status: 'success',
          details: { student: reg.name, email: reg.email, zoomLink: cleanZoomLink },
        });
      } catch (_) {}

      return res.json({
        success: true,
        message: `Zoom link sent successfully to ${reg.name}`,
        zoomLinkSent: true,
        zoomLinkEmailStatus: 'SENT',
        classLinkSendStatus: 'SENT',
      });
    } catch (err) {
      console.error(`[Masterclass Email]\nrecipient: ${maskEmail(reg.email)}\ntemplate: CCTV_MASTERCLASS_CLASS_LINK\nstatus: failure\nerror: ${err.message || 'SMTP delivery failed'}`);

      reg.zoomLinkSent = false;
      reg.zoomLinkEmailStatus = 'FAILED';
      reg.zoomLinkEmailError = err.message || 'SMTP delivery failed';
      reg.classLinkSendStatus = 'FAILED';
      reg.classLinkSendError = err.message || 'SMTP delivery failed';
      await reg.save();

      return res.status(500).json({
        success: false,
        reason: 'SMTP_CONNECTION_FAILED',
        message: 'Email service is temporarily unavailable. Please try again later.',
        error: err.message,
        zoomLinkSent: false,
        zoomLinkEmailStatus: 'FAILED',
        classLinkSendStatus: 'FAILED',
      });
    }
  } catch (err) {
    next(err);
  }
}

/**
 * Diagnostic health check for SMTP connection status (safe for administrators).
 * Never exposes secrets, passwords, or tokens.
 */
async function checkSmtpHealth(req, res) {
  try {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    const isConfigured = Boolean(
      host && user && pass && 
      !user.includes('your-email') && 
      !user.includes('your_email') && 
      !pass.includes('your-app-password')
    );

    if (!isConfigured) {
      return res.json({
        success: false,
        smtpConfigured: 'NO',
        smtpHost: host,
        smtpPort: port,
        smtpConnectivity: 'FAIL',
        error: 'SMTP credentials not configured or using placeholders in environment',
      });
    }

    const { getTransporter } = require('../../services/emailService');
    const transporter = getTransporter(port);
    try {
      await transporter.verify();
      return res.json({
        success: true,
        smtpConfigured: 'YES',
        smtpHost: host,
        smtpPort: port,
        smtpConnectivity: 'PASS',
      });
    } catch (verifyErr) {
      const altPort = port === 465 ? 587 : 465;
      try {
        const altTransporter = getTransporter(altPort);
        await altTransporter.verify();
        return res.json({
          success: true,
          smtpConfigured: 'YES',
          smtpHost: host,
          smtpPort: altPort,
          smtpConnectivity: 'PASS',
          note: `Port ${port} failed (${verifyErr.message}), but alternate port ${altPort} passed.`,
        });
      } catch (altErr) {
        return res.json({
          success: false,
          smtpConfigured: 'YES',
          smtpHost: host,
          smtpPort: port,
          smtpConnectivity: 'FAIL',
          error: `Port ${port} failed (${verifyErr.message}); Port ${altPort} failed (${altErr.message})`,
        });
      }
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      smtpConfigured: 'YES',
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtpPort: Number(process.env.SMTP_PORT || 587),
      smtpConnectivity: 'FAIL',
      error: err.message,
    });
  }
}

module.exports = {
  createRegistration,
  createRazorpayOrder,
  verifyRazorpayPayment,
  cancelPayment,
  getPublicRegistrationDetails,
  webhookHandler,
  getCertificateDetails,
  getAdminStats,
  getAdminRegistrations,
  getAdminRegistrationById,
  bulkSendZoomLink,
  sendSingleZoomLink,
  checkSmtpHealth,
};
