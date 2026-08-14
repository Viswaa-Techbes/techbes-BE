const Masterclass = require('../../models/Masterclass');
const Registration = require('../../models/Registration');
const CctvPayment = require('../../models/CctvPayment');
const Certificate = require('../../models/Certificate');
const paymentService = require('../../services/paymentService');
const { getRazorpayCredentials } = require('../../config/razorpay');
const cctvCertificateService = require('../../services/cctvCertificateService');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
    auth: { user, pass },
  });
}

// 1. POST /api/v2/cctv-course/registrations
async function createRegistration(req, res, next) {
  try {
    const { name, email, mobile, location, qualification, whatsapp, masterclassId } = req.body;

    if (!name || !email || !mobile || !location || !qualification) {
      return res.status(400).json({ success: false, message: 'Missing required registration fields' });
    }

    let targetMasterclassId = masterclassId;

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

    // Basic duplicate prevention
    const existing = await Registration.findOne({
      $or: [{ email }, { mobile }],
      masterclassId: targetMasterclassId,
    });

    if (existing && existing.paymentStatus === 'PAID') {
      return res.status(409).json({ success: false, message: 'Already registered and paid for this masterclass' });
    }

    // If registration exists but is pending, reuse or create new
    let registration = existing;
    if (!registration || registration.paymentStatus === 'PAID') {
      registration = new Registration({
        masterclassId: targetMasterclassId,
        name,
        email,
        mobile,
        location,
        qualification,
        whatsapp,
        paymentStatus: 'PENDING',
        registrationStatus: 'PENDING',
        amount: mc.price,
      });
      await registration.save();
    } else {
      // update details of existing pending registration
      registration.name = name;
      registration.location = location;
      registration.qualification = qualification;
      registration.whatsapp = whatsapp;
      registration.amount = mc.price;
      await registration.save();
    }

    return res.status(201).json({
      success: true,
      registrationId: registration._id,
      message: 'created',
    });
  } catch (err) {
    next(err);
  }
}

// 2. POST /api/v2/cctv-course/razorpay/create-order
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

    const mc = await Masterclass.findById(reg.masterclassId);
    if (!mc) {
      return res.status(404).json({ success: false, message: 'Masterclass not found' });
    }

    const amount = mc.price * 100; // in paise
    const description = `Enrollment fee for ${mc.title}`;
    const receipt = `reg_${reg._id}`;

    // Call paymentService helper
    const order = await paymentService.createRazorpayOrder(amount, description, receipt, null);

    reg.razorpayOrderId = order.orderId;
    await reg.save();

    // order returned structure: { orderId, amount, currency, receipt, keyId }
    return res.json({
      success: true,
      order: {
        id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      },
    });
  } catch (err) {
    next(err);
  }
}

// 3. POST /api/v2/cctv-course/razorpay/verify
async function verifyRazorpayPayment(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment signature verification details' });
    }

    const { keySecret } = getRazorpayCredentials();
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const signatureVerified = expectedSignature === razorpay_signature;

    const reg = await Registration.findOne({ razorpayOrderId: razorpay_order_id });
    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    const mc = await Masterclass.findById(reg.masterclassId);
    if (!mc) {
      return res.status(404).json({ success: false, message: 'Masterclass not found' });
    }

    // Record payment
    const payment = await CctvPayment.create({
      registrationId: reg._id,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: reg.amount || mc.price,
      currency: 'INR',
      status: signatureVerified ? 'captured' : 'failed',
      signatureVerified,
      webhookVerified: false,
      paidAt: new Date(),
    });

    if (!signatureVerified) {
      return res.status(400).json({ success: false, message: 'Payment signature verification failed' });
    }

    // Success flow
    reg.paymentStatus = 'PAID';
    reg.registrationStatus = 'REGISTERED';
    reg.razorpayPaymentId = razorpay_payment_id;
    reg.paidAt = new Date();
    await reg.save();

    // Create Certificate record
    let certificate = null;
    if (mc.certificateEnabled) {
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
    }

    // Send confirmation email
    const transporter = getTransporter();
    if (transporter) {
      const fromMail = process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER;
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      let emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0f172a; color: #ffffff; padding: 28px; border-radius: 12px;">
          <h2 style="color: #e5a833; margin-top: 0;">Payment Confirmed!</h2>
          <p>Hello ${reg.name},</p>
          <p>Your enrollment in <strong>${mc.title}</strong> is confirmed. We have successfully processed your payment of ₹${reg.amount}.</p>
          
          <div style="background-color: #1e293b; padding: 18px; border-radius: 8px; margin: 24px 0; border: 1px solid #334155;">
            <h3 style="margin-top: 0; color: #e5a833;">Masterclass Schedule</h3>
            <p style="margin: 4px 0;"><strong>Date:</strong> ${new Date(mc.date).toDateString()}</p>
            <p style="margin: 4px 0;"><strong>Time:</strong> ${mc.startTime || '10:00 AM'} - ${mc.endTime || '04:00 PM'}</p>
            <p style="margin: 4px 0;"><strong>Duration:</strong> ${mc.duration || '1 Day'}</p>
          </div>
      `;

      if (certificate) {
        emailHtml += `
          <p>Your participation certificate has been generated. You can verify and view it online:</p>
          <p style="margin: 24px 0;">
            <a href="${frontendUrl}/certificate/${certificate.certificateId}" style="display: inline-block; background-color: #e5a833; color: #0f172a; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Certificate</a>
          </p>
        `;
      }

      emailHtml += `
          <p style="color: #94a3b8; font-size: 13px; margin-top: 32px; border-top: 1px solid #334155; padding-top: 16px;">If you have any questions, feel free to reply directly to this email.</p>
          <p style="color: #e5a833; font-weight: bold; margin: 0;">TechBes Team</p>
        </div>
      `;

      try {
        await transporter.sendMail({
          from: fromMail,
          to: reg.email,
          subject: `Enrollment Confirmed: ${mc.title}`,
          html: emailHtml,
        });
      } catch (mailErr) {
        console.error('[Email] Failed to send payment confirmation email:', mailErr.message);
      }
    }

    return res.json({
      success: true,
      ok: true,
      certificateId: certificate ? certificate.certificateId : null,
    });
  } catch (err) {
    next(err);
  }
}

// 4. POST /api/v2/cctv-course/razorpay/webhook
async function webhookHandler(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'] || '';
    const payload = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);

    const { keySecret } = getRazorpayCredentials();
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || keySecret).update(payload).digest('hex');

    if (expected !== signature) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const body = JSON.parse(payload);
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
        await reg.save();

        let certificate = null;
        if (mc && mc.certificateEnabled) {
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
        }

        // Record payment
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
    }

    return res.json({ success: true, ok: true });
  } catch (err) {
    next(err);
  }
}

// 5. GET /api/v2/cctv-course/certificates/:id
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

// 6. GET /api/v2/cctv-course/admin/masterclass/stats
async function getAdminStats(req, res, next) {
  try {
    const total = await Registration.countDocuments();
    const paid = await Registration.countDocuments({ paymentStatus: 'PAID' });
    const pending = await Registration.countDocuments({ paymentStatus: 'PENDING' });

    return res.json({
      success: true,
      data: { total, paid, pending },
      stats: { total, paid, pending },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createRegistration,
  createRazorpayOrder,
  verifyRazorpayPayment,
  webhookHandler,
  getCertificateDetails,
  getAdminStats,
};
