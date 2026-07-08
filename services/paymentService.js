const crypto = require('crypto');
const Job = require('../models/Job');
const { getRazorpayCredentials, getRazorpayInstance } = require('../config/razorpay');
const Payment = require('../models/Payment');
const Lead = require('../models/Lead');
const jobServiceV2 = require('./jobServiceV2');
const PaymentAudit = require('../models/PaymentAudit');
const notificationService = require('./notificationService');
const Cart = require('../models/Cart');

async function createRazorpayOrder(amount, description, receipt, userId) {
  console.log('[Razorpay] Creating order', { amount, receipt, userId, hasDescription: Boolean(description) });
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Valid amount is required in paise');
  }

  const razorpay = getRazorpayInstance();
  const order = await razorpay.orders.create({
    amount: Math.round(amount),
    currency: 'INR',
    receipt,
    notes: {
      description,
      createdBy: userId,
    },
  });
  console.log('[Razorpay] Order response received', { orderId: order.id, amount: order.amount, currency: order.currency });

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    description,
    keyId: getRazorpayCredentials().keyId,
    razorpayKey: getRazorpayCredentials().keyId,
  };
}

async function verifyRazorpayPayment(jobId, orderId, paymentId, signature) {
  const { keySecret } = getRazorpayCredentials();
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new Error('Payment signature verification failed');
  }

  const job = await Job.findById(jobId);
  if (!job) throw new Error('Job not found');
  if (job.client && userId && job.client.toString() !== userId) {
    throw new Error('Not authorized to verify this payment');
  }

  job.orderId = orderId;
  job.paymentId = paymentId;
  job.paymentSignature = signature;
  job.paymentStatus = 'paid';
  
  // v2 flow might have different status updates
  if (job.useNewFlow) {
    job.status = 'completed'; 
  } else {
    job.status = 'completed'; // keeping consistency for now
  }
  
  await job.save();
  return job;
}

async function verifyAdvancePayment(jobId, orderId, paymentId, signature, amountPaise, userId) {
  const { keySecret } = getRazorpayCredentials();
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new Error('Payment signature verification failed');
  }

  const Job = require('../models/Job');
  const Payment = require('../models/Payment');

  const job = await Job.findById(jobId);
  if (!job) throw new Error('Job not found');

  // Record payment
  const pay = await Payment.create({
    jobId: job._id,
    userId: userId || null,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
    amount: amountPaise,
    status: 'verified',
  });

  job.advancePaid = true;
  job.advancePaymentId = paymentId;
  job.advanceAmount = Math.round((job.advanceAmount || 0));
  job.remainingAmount = Math.max((job.amount || job.price || 0) - (job.advanceAmount || 0), 0);
  job.paymentStatus = 'advance_paid';
  job.status = 'pending';
  job.dispatchStatus = 'pending_dispatch';
  job.transactionId = paymentId;
  await job.save();

  // ─── AUTO DISPATCH: Fire auto-assignment after advance payment ────────────
  // Non-blocking: runs in background so payment response is instant
  setImmediate(async () => {
    try {
      console.log(`[Payment] Triggering auto-dispatch for job ${job._id}`);
      const dispatchService = require('./dispatchService');
      // Get io from global if available (set by server.js)
      const io = global._socketIo || null;
      const dispatchResult = await dispatchService.autoAssignTechnician(job._id, io);
      console.log(`[Payment] Dispatch result for job ${job._id}:`, dispatchResult.method || dispatchResult.reason);
    } catch (dispatchErr) {
      console.error('[Payment] Auto-dispatch failed (non-critical):', dispatchErr.message);
    }
  });

  return { job, payment: pay };
}

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  verifyAdvancePayment,
  verifyPaymentForBooking,
};

async function verifyPaymentForBooking(orderId, paymentId, signature, userId) {
  console.log('[Razorpay] Verifying payment for booking', { orderId, paymentId, userId });
  const { keySecret } = getRazorpayCredentials();
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new Error('Payment signature verification failed');
  }

  const payment = await Payment.findOne({ razorpayOrderId: orderId });
  if (!payment) throw new Error('Payment record not found');

  if (payment.jobId) {
    console.log('[Payment] Booking already exists for this payment. Reusing it.', { jobId: payment.jobId });
    const existingJob = await Job.findById(payment.jobId);
    if (existingJob) {
      existingJob.paymentStatus = 'paid';
      existingJob.status = 'completed';
      existingJob.orderId = orderId;
      existingJob.paymentId = paymentId;
      existingJob.paymentSignature = signature;
      await existingJob.save();

      payment.razorpayPaymentId = paymentId;
      payment.razorpaySignature = signature;
      payment.status = 'verified';
      await payment.save();

      return { job: existingJob, payment };
    }
  }

  // Ensure booking payload exists
  const bookingPayload = payment.meta && payment.meta.bookingPayload;
  if (!bookingPayload) throw new Error('No booking payload found for this payment');

  // Create booking using job service
  const bookingData = {
    ...bookingPayload,
    clientId: userId || null,
  };

  const job = await jobServiceV2.createBookingV2(bookingData);
  console.log('[Payment] Booking created from verified payment', { jobId: job._id, paymentId: payment._id });

  let lead = null;
  try {
    if (bookingData.customerName && bookingData.customerPhone) {
      lead = await Lead.create({
        name: bookingData.customerName,
        phone: bookingData.customerPhone,
        address: bookingData.address || '',
        source: 'checkout-payment',
        requiredService: bookingData.serviceName || bookingData.service || 'Service Booking',
        budget: Number(bookingData.totalAmount || bookingData.cctvDetails?.priceBreakdown?.grandTotal || 0) || 0,
        status: 'Won',
        remarks: `Created automatically after Razorpay payment ${paymentId}. Job: ${job._id}`,
      });
      console.log('[Lead] Created from payment checkout', { leadId: lead._id, jobId: job._id });
    } else {
      console.warn('[Lead] Skipped checkout lead creation because customer name/phone was missing', { jobId: job._id });
    }
  } catch (err) {
    console.error('[Lead] Failed to create checkout lead', err.message);
  }

  // Update payment record
  payment.razorpayPaymentId = paymentId;
  payment.razorpaySignature = signature;
  payment.status = 'verified';
  payment.jobId = job._id;
  await payment.save();

  // Update job payment status
  job.paymentStatus = 'paid';
  job.status = 'pending';
  job.dispatchStatus = 'pending_dispatch';
  await job.save();

  // ─── AUTO DISPATCH: Fire auto-assignment after payment ────────────────────
  // Non-blocking: runs in background so payment response is instant
  setImmediate(async () => {
    try {
      console.log(`[Payment] Triggering auto-dispatch for job ${job._id}`);
      const dispatchService = require('./dispatchService');
      // Get io from global if available (set by server.js)
      const io = global._socketIo || null;
      const dispatchResult = await dispatchService.autoAssignTechnician(job._id, io);
      console.log(`[Payment] Dispatch result for job ${job._id}:`, dispatchResult.method || dispatchResult.reason);
    } catch (dispatchErr) {
      console.error('[Payment] Auto-dispatch failed (non-critical):', dispatchErr.message);
    }
  });


  // Clear user's persistent database cart
  try {
    if (userId) {
      await Cart.updateOne({ userId }, { $set: { items: [], totalAmount: 0 } });
      console.log('[Cart] Cleared database cart for user', userId);
    }
  } catch (cartErr) {
    console.error('[Cart] Failed to clear user cart after payment success', cartErr.message);
  }

  // Audit and notifications
  try {
    await PaymentAudit.create({ paymentId: payment._id, orderId, event: 'booking_created', payload: { jobId: job._id } });
    
    // 1. Notify Customer
    if (bookingData.clientId) {
      await notificationService.createNotification(
        bookingData.clientId,
        'Booking Confirmed',
        `Your booking ${job._id} has been confirmed.`,
        'booking_created'
      );
    }

    // 2. Notify Admins
    const User = require('../models/User');
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const admin of admins) {
      await notificationService.createNotification(
        admin._id,
        'New Booking Placed',
        `A new booking ${job._id} has been created by customer ${bookingData.customerName || 'Customer'}.`,
        'booking_created'
      );
    }

    // 3. Notify Technician (if assigned)
    if (job.assignedTechnician) {
      await notificationService.createNotification(
        job.assignedTechnician,
        'Job Payment Received',
        `Payment has been received for assigned Job ${job._id}.`,
        'status_update'
      );
    }
  } catch (err) {
    console.error('Failed to create audit/notification for booking:', err.message);
  }

  return { job, payment, lead };
}
