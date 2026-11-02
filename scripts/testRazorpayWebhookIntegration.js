require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
const Payment = require('../models/Payment');
const PaymentAudit = require('../models/PaymentAudit');

const BASE_URL = 'http://localhost:5000/api/v2/payment';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

async function runWebhookTests() {
  console.log('====================================================');
  console.log('STARTING RAZORPAY WEBHOOK INTEGRATION TEST SUITE');
  console.log('====================================================');
  console.log('Webhook Secret configured:', WEBHOOK_SECRET ? 'YES (Strong secret)' : 'NO');

  await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
  console.log('Connected to MongoDB Atlas for verification.');

  const results = [];

  try {
    // 1. Create a test pending payment record in DB
    const testOrderId = `order_wh_test_${Date.now()}`;
    const dummyUserId = new mongoose.Types.ObjectId();
    const testPayment = await Payment.create({
      userId: dummyUserId,
      razorpayOrderId: testOrderId,
      amount: 150000,
      status: 'pending',
      meta: { test: true },
    });
    console.log(`Created test payment record: ID ${testPayment._id}, orderId: ${testOrderId}`);

    // TEST 1: Missing signature rejected
    try {
      await axios.post(`${BASE_URL}/webhook`, { event: 'payment.captured' }, {
        headers: { 'Content-Type': 'application/json' }
      });
      results.push({ name: 'TEST 1: Missing signature rejection', pass: false, note: 'Expected 400 but succeeded' });
    } catch (err) {
      const pass = err.response && err.response.status === 400;
      results.push({ name: 'TEST 1: Missing signature rejection', pass, note: `Status: ${err.response?.status}` });
      console.log(`[TEST 1] Missing signature: ${pass ? 'PASS (HTTP 400)' : 'FAIL'}`);
    }

    // TEST 2: Tampered / invalid signature rejected
    try {
      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { order_id: testOrderId, id: 'pay_tampered_123' } } }
      });
      await axios.post(`${BASE_URL}/webhook`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': 'invalid_tampered_hmac_signature_0000000000'
        }
      });
      results.push({ name: 'TEST 2: Tampered signature rejection', pass: false, note: 'Expected 400 but succeeded' });
    } catch (err) {
      const pass = err.response && err.response.status === 400;
      results.push({ name: 'TEST 2: Tampered signature rejection', pass, note: `Status: ${err.response?.status}` });
      console.log(`[TEST 2] Tampered signature: ${pass ? 'PASS (HTTP 400)' : 'FAIL'}`);
    }

    // Verify DB still 'pending'
    const checkPending = await Payment.findById(testPayment._id);
    if (checkPending.status !== 'pending') {
      console.error('FAIL: Payment status changed despite invalid signature!');
    }

    // TEST 3: Valid payment.captured event verification
    const testPaymentId = `pay_valid_${Date.now()}`;
    const capturedPayloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: testPaymentId,
            order_id: testOrderId,
            amount: 150000,
            status: 'captured'
          }
        }
      }
    };
    const capturedRawBody = JSON.stringify(capturedPayloadObj);
    const validCapturedSignature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(capturedRawBody).digest('hex');

    const res3 = await axios.post(`${BASE_URL}/webhook`, capturedRawBody, {
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validCapturedSignature
      }
    });

    // Check DB record
    const updatedPayment = await Payment.findById(testPayment._id);
    const auditVerified = await PaymentAudit.findOne({ orderId: testOrderId, event: 'webhook_received' });
    const pass3 = res3.status === 200 && updatedPayment.status === 'verified' && updatedPayment.razorpayPaymentId === testPaymentId && Boolean(auditVerified);
    results.push({ name: 'TEST 3: Valid payment.captured verification', pass: pass3, note: `Payment status: ${updatedPayment.status}, audit logged: ${Boolean(auditVerified)}` });
    console.log(`[TEST 3] Valid payment.captured: ${pass3 ? 'PASS (Status: verified)' : 'FAIL'}`);

    // TEST 4: Duplicate payment.captured event (Idempotency)
    const res4 = await axios.post(`${BASE_URL}/webhook`, capturedRawBody, {
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validCapturedSignature
      }
    });
    const updatedPaymentDupe = await Payment.findById(testPayment._id);
    const pass4 = res4.status === 200 && updatedPaymentDupe.status === 'verified';
    results.push({ name: 'TEST 4: Duplicate webhook idempotency', pass: pass4, note: `Status maintained: ${updatedPaymentDupe.status}` });
    console.log(`[TEST 4] Duplicate webhook idempotency: ${pass4 ? 'PASS' : 'FAIL'}`);

    // TEST 5: Valid payment.failed event verification
    const failedOrderId = `order_failed_test_${Date.now()}`;
    const failedPayment = await Payment.create({
      userId: dummyUserId,
      razorpayOrderId: failedOrderId,
      amount: 50000,
      status: 'pending',
      meta: { test: true },
    });

    const failedPayloadObj = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_failed_${Date.now()}`,
            order_id: failedOrderId,
            amount: 50000,
            status: 'failed'
          }
        }
      }
    };
    const failedRawBody = JSON.stringify(failedPayloadObj);
    const validFailedSignature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(failedRawBody).digest('hex');

    const res5 = await axios.post(`${BASE_URL}/webhook`, failedRawBody, {
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validFailedSignature
      }
    });

    const checkFailedPayment = await Payment.findById(failedPayment._id);
    const auditFailed = await PaymentAudit.findOne({ orderId: failedOrderId, event: 'payment_failed' });
    const pass5 = res5.status === 200 && checkFailedPayment.status === 'failed' && Boolean(auditFailed);
    results.push({ name: 'TEST 5: Payment failure handling', pass: pass5, note: `Status: ${checkFailedPayment.status}, audit: ${Boolean(auditFailed)}` });
    console.log(`[TEST 5] Payment failure handling: ${pass5 ? 'PASS (Status: failed)' : 'FAIL'}`);

    // Cleanup test records
    await Payment.deleteMany({ _id: { $in: [testPayment._id, failedPayment._id] } });
    await PaymentAudit.deleteMany({ orderId: { $in: [testOrderId, failedOrderId] } });
    console.log('Cleaned up test payment & audit records.');

  } finally {
    await mongoose.disconnect();
  }

  console.log('\n====================================================');
  console.log('WEBHOOK TEST SUMMARY');
  console.log('====================================================');
  let allPass = true;
  for (const r of results) {
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.name} — ${r.note}`);
    if (!r.pass) allPass = false;
  }
  console.log(`\nOverall Webhook Suite Result: ${allPass ? 'ALL TESTS PASSED ✓' : 'SOME TESTS FAILED ✗'}`);
}

runWebhookTests().catch(err => {
  console.error('Fatal Webhook Test Error:', err);
  process.exit(1);
});
