const paymentService = require('../../services/paymentService');
const Job = require('../../models/Job');
const PaymentAudit = require('../../models/PaymentAudit');

async function createOrder(req, res, next) {
  try {
    const { jobId, amount, description, receipt, bookingPayload } = req.body;
    console.log('[Payment] create-order requested', {
      userId: req.user?.id,
      jobId: jobId || null,
      hasBookingPayload: Boolean(bookingPayload),
      requestedAmount: amount || null,
    });
    let payableAmount = Number(amount || 0);
    let paymentDescription = description;
    let paymentReceipt = receipt;

    if (jobId) {
      const job = await Job.findById(jobId);
      if (!job) return res.status(404).json({ success: false, message: 'Booking not found' });
      if (job.client && job.client.toString() !== req.user.id && !['admin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Not authorized to pay for this booking' });
      }
      payableAmount = Math.round(Number(job.advanceAmount || Math.round((job.amount || job.price || 0) / 2)) * 100);
      paymentDescription = paymentDescription || `Advance for booking ${job._id}`;
      paymentReceipt = paymentReceipt || `job_${job._id}`;
    }

    // If bookingPayload provided, derive amount from payload (grandTotal or totalAmount)
    if (!jobId && bookingPayload) {
      const grand = Number(bookingPayload.cctvDetails?.priceBreakdown?.grandTotal || bookingPayload.totalAmount || 0) || 0;
      payableAmount = Math.round(grand * 100);
      paymentDescription = paymentDescription || `Advance for new booking`;
      paymentReceipt = paymentReceipt || `booking_${Date.now()}`;
      console.log('[Payment] Derived booking payable amount', { grandTotal: grand, payableAmount });
    }

    const orderData = await paymentService.createRazorpayOrder(payableAmount, paymentDescription, paymentReceipt, req.user.id);
    console.log('[Payment] Razorpay order created', {
      orderId: orderData.orderId,
      amount: orderData.amount,
      currency: orderData.currency,
    });

    // Create Payment record when bookingPayload exists or when jobId not provided
    if (bookingPayload || !jobId) {
      const Payment = require('../../models/Payment');
      const existingPending = await Payment.findOne({
        userId: req.user.id,
        status: 'pending',
      }).sort({ createdAt: -1 });

      if (existingPending) {
        console.log('[Payment] Reusing existing pending payment record', existingPending._id);
        existingPending.razorpayOrderId = orderData.orderId;
        existingPending.amount = orderData.amount;
        existingPending.meta = { bookingPayload: bookingPayload || null };
        await existingPending.save();

        await PaymentAudit.create({ paymentId: existingPending._id, orderId: orderData.orderId, event: 'order_updated', payload: { orderData } });
        return res.status(201).json({ success: true, data: { ...orderData, paymentId: existingPending._id } });
      }

      const pay = await Payment.create({
        jobId: jobId || null,
        userId: req.user.id,
        razorpayOrderId: orderData.orderId,
        amount: orderData.amount,
        status: 'pending',
        meta: { bookingPayload: bookingPayload || null },
      });
      // Audit log
      await PaymentAudit.create({ paymentId: pay._id, orderId: orderData.orderId, event: 'order_created', payload: { orderData } });
      return res.status(201).json({ success: true, data: { ...orderData, paymentId: pay._id } });
    }

    res.status(201).json({ success: true, data: orderData });
  } catch (err) {
    console.error('[Payment createOrder Error]', err);
    if (err && err.code === 11000) {
      console.error('[Payment createOrder Duplicate Key]', {
        code: err.code,
        keyPattern: err.keyPattern,
        keyValue: err.keyValue
      });
    }
    next(err);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const { jobId, razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
    console.log('[Payment] verify-payment requested', {
      userId: req.user?.id,
      jobId: jobId || null,
      orderId: razorpay_order_id || null,
      paymentId: razorpay_payment_id || null,
      hasSignature: Boolean(razorpay_signature),
    });

    // If jobId provided -> legacy flow (verify advance for existing job)
    if (jobId) {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ success: false, message: 'jobId, razorpay_order_id, razorpay_payment_id and razorpay_signature are required' });
      }
      const amountPaise = Number(amount) || 0;
      const job = await Job.findById(jobId);
      if (!job) return res.status(404).json({ success: false, message: 'Booking not found' });
      if (job.client && job.client.toString() !== req.user.id && !['admin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Not authorized to verify this payment' });
      }

      const result = await paymentService.verifyAdvancePayment(jobId, razorpay_order_id, razorpay_payment_id, razorpay_signature, amountPaise, req.user?.id);
      await PaymentAudit.create({ paymentId: null, orderId: razorpay_order_id, event: 'payment_verified', payload: { jobId } });
      console.log(`[Payment] Verified advance payment for Job ${jobId}.`);
      return res.json({ success: true, data: result });
    }

    // Booking-based verification: find Payment by order id and create booking
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required' });
    }

    const result = await paymentService.verifyPaymentForBooking(razorpay_order_id, razorpay_payment_id, razorpay_signature, req.user?.id);
    // Audit log payment verification and booking creation
    await PaymentAudit.create({ paymentId: result.payment?._id || null, orderId: razorpay_order_id, event: 'payment_verified', payload: { payment: result.payment ? result.payment._id : null } });
    if (result.job) {
      await PaymentAudit.create({ paymentId: result.payment?._id || null, orderId: razorpay_order_id, event: 'booking_created', payload: { jobId: result.job._id } });
    }
    console.log('[Payment] Verified payment and created booking.', result.job ? `Job ${result.job._id}` : '');
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function requestPayment(req, res, next) {
  try {
    const { jobId, amount, description } = req.body;
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    job.amount = amount;
    job.paymentDescription = description || 'Technician requested payment';
    job.paymentStatus = 'requested';
    job.status = 'payment_requested';
    await job.save();

    console.log(`[Payment] Payment requested for Job ${jobId}, Amount: ${amount}`);
    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

async function getPaymentRequests(req, res, next) {
  try {
    const requests = await Job.find({ paymentStatus: 'requested' })
      .populate('assignedTechnician', 'name')
      .populate('client', 'name mobileNumber')
      .sort({ updatedAt: -1 });
    res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
}

async function approvePaymentRequest(req, res, next) {
  try {
    const { jobId } = req.body;
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // Create Razorpay Order
    const orderData = await paymentService.createRazorpayOrder(
      job.amount * 100, // to paise
      job.paymentDescription,
      `job_${jobId}`,
      req.user.id
    );

    job.orderId = orderData.orderId;
    job.paymentStatus = 'pending_payment';
    job.status = 'payment_pending';
    await job.save();

    console.log(`[Payment] Approved payment request for Job ${jobId}. Order created: ${orderData.orderId}`);
    res.json({ success: true, data: { ...job.toObject(), razorpayOrder: orderData } });
  } catch (err) {
    next(err);
  }
}

// Webhook handler from Razorpay
async function webhookHandler(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'] || req.headers['x-razorpay-signature'.toLowerCase()];
    const payload = req.body || {};
    const { keySecret } = require('../../config/razorpay').getRazorpayCredentials();
    const crypto = require('crypto');

    // Prefer raw body (buffer) for HMAC calculation. Fall back to stringified body.
    const raw = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(payload));
    const expected = crypto.createHmac('sha256', keySecret).update(raw).digest('hex');

    if (!signature || expected !== signature) {
      console.warn('[Payment Webhook] signature mismatch');
      return res.status(400).send('invalid signature');
    }

    // Handle payment captured events
    const event = payload.event;
    // payment captured / order paid -> mark verified
    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload && (payload.payload.payment || payload.payload.order);
      // prefer payment object
      const paymentObj = paymentEntity?.entity || null;
      if (paymentObj) {
        const Payment = require('../../models/Payment');
        const orderId = paymentObj.order_id || (paymentObj.notes && paymentObj.notes.receipt) || null;
        const paymentId = paymentObj.id || paymentObj.payment_id || null;
        if (orderId) {
          const pay = await Payment.findOne({ razorpayOrderId: orderId });
          if (pay) {
            pay.razorpayPaymentId = paymentId;
            pay.status = 'verified';
            await pay.save();
            console.log('[Payment Webhook] Marked payment verified for order', orderId);
            await PaymentAudit.create({ paymentId: pay._id, orderId, event: 'webhook_received', payload: { status: 'verified' } });
          }
        }
      }
    }

    // payment failed -> mark failed
    if (event === 'payment.failed') {
      const paymentEntity = payload.payload && payload.payload.payment;
      const paymentObj = paymentEntity?.entity || null;
      if (paymentObj) {
        const Payment = require('../../models/Payment');
        const orderId = paymentObj.order_id || (paymentObj.notes && paymentObj.notes.receipt) || null;
        const paymentId = paymentObj.id || paymentObj.payment_id || null;
        if (orderId) {
          const pay = await Payment.findOne({ razorpayOrderId: orderId });
          if (pay) {
            pay.razorpayPaymentId = paymentId;
            pay.status = 'failed';
            await pay.save();
            console.log('[Payment Webhook] Marked payment failed for order', orderId);
            await PaymentAudit.create({ paymentId: pay._id, orderId, event: 'payment_failed', payload: {} });
          }
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
}

async function myPayments(req, res, next) {
  try {
    const Payment = require('../../models/Payment');
    const payments = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: payments });
  } catch (err) {
    next(err);
  }
}

async function getPaymentById(req, res, next) {
  try {
    const { id } = req.params;
    const Payment = require('../../models/Payment');
    const pay = await Payment.findById(id).lean();
    if (!pay) return res.status(404).json({ success: false, message: 'Payment not found' });

    // Only allow owner or admin
    if (pay.userId && req.user && pay.userId.toString() !== req.user.id && !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const { getRazorpayCredentials } = require('../../config/razorpay');
    const keyId = getRazorpayCredentials().keyId;

    res.json({ success: true, data: { payment: pay, keyId } });
  } catch (err) {
    next(err);
  }
}

async function getPaymentAudit(req, res, next) {
  try {
    const { id } = req.params;
    const audits = await PaymentAudit.find({ paymentId: id }).sort({ createdAt: 1 }).lean();
    res.json({ success: true, data: audits });
  } catch (err) {
    next(err);
  }
}

// Admin: list all payments with pagination
async function getAllPayments(req, res, next) {
  try {
    const Payment = require('../../models/Payment');
    const { page = 1, limit = 50 } = req.query;
    const payments = await Payment.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();
    res.json({ success: true, data: payments });
  } catch (err) {
    next(err);
  }
}

// Admin: refund a payment
async function refundPayment(req, res, next) {
  try {
    const { paymentId, amount } = req.body; // amount optional (in paise)
    if (!paymentId) return res.status(400).json({ success: false, message: 'paymentId is required' });
    const Payment = require('../../models/Payment');
    const pay = await Payment.findById(paymentId);
    if (!pay) return res.status(404).json({ success: false, message: 'Payment not found' });

    const { getRazorpayInstance } = require('../../config/razorpay');
    const razorpay = getRazorpayInstance();
    if (!pay.razorpayPaymentId) return res.status(400).json({ success: false, message: 'No razorpayPaymentId to refund' });

    const refundOptions = {};
    if (amount) refundOptions.amount = Number(amount);
    const resp = await razorpay.payments.refund(pay.razorpayPaymentId, refundOptions);

    pay.status = 'refunded';
    await pay.save();
    await PaymentAudit.create({ paymentId: pay._id, orderId: pay.razorpayOrderId, event: 'refund_initiated', payload: resp });

    res.json({ success: true, data: resp });
  } catch (err) {
    next(err);
  }
}

// Admin: retry a failed payment by creating a new Razorpay order using stored booking payload
async function retryPayment(req, res, next) {
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ success: false, message: 'paymentId is required' });
    const Payment = require('../../models/Payment');
    const orig = await Payment.findById(paymentId);
    if (!orig) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (!orig.meta || !orig.meta.bookingPayload) return res.status(400).json({ success: false, message: 'No booking payload available to retry' });

    const bookingPayload = orig.meta.bookingPayload;
    const grand = Number(bookingPayload.cctvDetails?.priceBreakdown?.grandTotal || bookingPayload.totalAmount || 0) || 0;
    const amountPaise = Math.round(grand * 100);

    const orderData = await paymentService.createRazorpayOrder(amountPaise, `Retry order for payment ${orig._id}`, `retry_${Date.now()}`, req.user.id);

    const newPay = await Payment.create({
      jobId: null,
      userId: req.user.id,
      razorpayOrderId: orderData.orderId,
      amount: orderData.amount,
      status: 'pending',
      meta: { bookingPayload: bookingPayload, originalPaymentId: orig._id },
    });

    await PaymentAudit.create({ paymentId: newPay._id, orderId: orderData.orderId, event: 'order_created_retry', payload: { originalPayment: orig._id } });

    res.json({ success: true, data: { ...orderData, paymentId: newPay._id } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrder,
  verifyPayment,
  requestPayment,
  getPaymentRequests,
  approvePaymentRequest,
  webhookHandler,
  myPayments,
  getPaymentById,
  getPaymentAudit,
  getAllPayments,
  refundPayment,
  retryPayment,
};



