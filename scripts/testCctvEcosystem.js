/**
 * End-to-End Test for CCTV Course Platform:
 * Payment Flow + Admin Registration Sync + Bulk Zoom Link Dispatch + Security & Idempotency
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const crypto = require('crypto');
const Masterclass = require('../models/Masterclass');
const Registration = require('../models/Registration');
const CctvPayment = require('../models/CctvPayment');
const Certificate = require('../models/Certificate');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { getRazorpayCredentials } = require('../config/razorpay');
const cctvCourseController = require('../controllers/v2/cctvCourseControllerV2');

// Mock Express req/res
function mockReqRes(body = {}, params = {}, query = {}, user = null) {
  const req = {
    body,
    params,
    query,
    user,
    headers: {},
  };

  let statusCode = 200;
  let jsonResponse = null;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      jsonResponse = data;
      return res;
    },
    getStatusCode() {
      return statusCode;
    },
    getJson() {
      return jsonResponse;
    },
  };

  const next = (err) => {
    if (err) throw err;
  };

  return { req, res, next };
}

async function runTests() {
  console.log('──────────────────────────────────────────────────────────');
  console.log('🧪 RUNNING CCTV COURSE ECOSYSTEM END-TO-END VERIFICATION');
  console.log('──────────────────────────────────────────────────────────');

  await mongoose.connect(process.env.MONGODB_URI);

  // Clean test registrations
  await Registration.deleteMany({ email: /test_cctv_.*@example\.com/ });
  await CctvPayment.deleteMany({ razorpayOrderId: /order_test_.*/ });

  const activeMc = await Masterclass.findOne({ registrationOpen: true, status: 'published' });
  if (!activeMc) {
    throw new Error('No active published masterclass found in database.');
  }
  console.log(`✓ Active Masterclass found: "${activeMc.title}" (ID: ${activeMc._id})`);

  // ── TEST 1: Course Registration Initiation ──
  console.log('\n[1] Testing Registration Creation...');
  const testEmail = `test_cctv_${Date.now()}@example.com`;
  const regPayload = {
    name: 'Test Student John',
    email: testEmail,
    mobile: '9876543210',
    location: 'Bangalore Electronic City',
    qualification: 'Diploma',
    whatsapp: '9876543210',
    masterclassId: activeMc._id.toString(),
  };

  const { req: r1, res: s1, next: n1 } = mockReqRes(regPayload);
  await cctvCourseController.createRegistration(r1, s1, n1);
  const regRes = s1.getJson();

  if (!regRes.success || !regRes.registrationId) {
    throw new Error(`Registration failed: ${JSON.stringify(regRes)}`);
  }
  console.log(`✓ Registration created successfully. ID: ${regRes.registrationId}`);

  // Verify in DB
  let dbReg = await Registration.findById(regRes.registrationId);
  if (dbReg.paymentStatus !== 'PENDING' || dbReg.courseName !== activeMc.title) {
    throw new Error(`DB registration mismatch: status=${dbReg.paymentStatus}, course=${dbReg.courseName}`);
  }
  console.log(`✓ DB state verified: status=PENDING, courseName="${dbReg.courseName}"`);

  // ── TEST 2: Public Registration Lookup ──
  console.log('\n[2] Testing Public Registration Details Lookup...');
  const { req: r2, res: s2, next: n2 } = mockReqRes({}, { id: regRes.registrationId });
  await cctvCourseController.getPublicRegistrationDetails(r2, s2, n2);
  const pubDetails = s2.getJson();
  if (!pubDetails.success || pubDetails.data.name !== 'Test Student John') {
    throw new Error(`Public lookup failed: ${JSON.stringify(pubDetails)}`);
  }
  console.log(`✓ Public registration endpoint returned sanitized data: ${pubDetails.data.name}, course: ${pubDetails.data.courseName}`);

  // ── TEST 3: Razorpay Order Creation ──
  console.log('\n[3] Testing Razorpay Order Creation...');
  const { req: r3, res: s3, next: n3 } = mockReqRes({ registrationId: regRes.registrationId });
  await cctvCourseController.createRazorpayOrder(r3, s3, n3);
  const orderRes = s3.getJson();

  if (!orderRes.success || !orderRes.order_id) {
    throw new Error(`Order creation failed: ${JSON.stringify(orderRes)}`);
  }
  console.log(`✓ Order created: ${orderRes.order_id}, amount: ${orderRes.amount} paise, currency: ${orderRes.currency}`);

  // ── TEST 4: Payment Verification with Invalid Signature (Failure Handling) ──
  console.log('\n[4] Testing Payment Verification Signature Failure Handling...');
  const { req: r4, res: s4, next: n4 } = mockReqRes({
    razorpay_order_id: orderRes.order_id,
    razorpay_payment_id: 'pay_test_fake123',
    razorpay_signature: 'invalid_tampered_signature_9999',
    registrationId: regRes.registrationId,
  });
  await cctvCourseController.verifyRazorpayPayment(r4, s4, n4);

  if (s4.getStatusCode() !== 400 || s4.getJson().success !== false) {
    throw new Error(`Invalid signature did not fail as expected! Status: ${s4.getStatusCode()}`);
  }
  dbReg = await Registration.findById(regRes.registrationId);
  if (dbReg.paymentStatus !== 'FAILED') {
    throw new Error(`Registration should be marked FAILED on invalid signature. Got: ${dbReg.paymentStatus}`);
  }
  console.log('✓ Invalid signature rejected with status 400, registration correctly marked FAILED.');

  // ── TEST 5: Payment Verification with Valid Cryptographic Signature ──
  console.log('\n[5] Testing Valid Payment Signature Verification...');
  const testPaymentId = `pay_test_${Date.now()}`;
  const { keySecret } = getRazorpayCredentials();
  const validSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderRes.order_id}|${testPaymentId}`)
    .digest('hex');

  const { req: r5, res: s5, next: n5 } = mockReqRes({
    razorpay_order_id: orderRes.order_id,
    razorpay_payment_id: testPaymentId,
    razorpay_signature: validSignature,
    registrationId: regRes.registrationId,
  });
  await cctvCourseController.verifyRazorpayPayment(r5, s5, n5);
  const verifyRes = s5.getJson();

  if (!verifyRes.success || verifyRes.paymentStatus !== 'PAID' || !verifyRes.enrollmentId) {
    throw new Error(`Valid payment verification failed: ${JSON.stringify(verifyRes)}`);
  }
  console.log(`✓ Payment verified! Enrollment ID generated: ${verifyRes.enrollmentId}`);

  dbReg = await Registration.findById(regRes.registrationId);
  if (dbReg.paymentStatus !== 'PAID' || dbReg.registrationStatus !== 'REGISTERED') {
    throw new Error(`DB record not updated to PAID: ${dbReg.paymentStatus}`);
  }
  console.log(`✓ DB verified: status=PAID, registrationStatus=REGISTERED, paidAt=${dbReg.paidAt}`);

  // Verify CctvPayment record
  const payRecord = await CctvPayment.findOne({ razorpayPaymentId: testPaymentId });
  if (!payRecord || payRecord.status !== 'captured') {
    throw new Error('CctvPayment record was not created or captured.');
  }
  console.log('✓ CctvPayment record created and verified.');

  // ── TEST 6: Payment Idempotency ──
  console.log('\n[6] Testing Payment Idempotency (Duplicate Verification Callback)...');
  const { req: r6, res: s6, next: n6 } = mockReqRes({
    razorpay_order_id: orderRes.order_id,
    razorpay_payment_id: testPaymentId,
    razorpay_signature: validSignature,
    registrationId: regRes.registrationId,
  });
  await cctvCourseController.verifyRazorpayPayment(r6, s6, n6);
  const idemRes = s6.getJson();
  if (!idemRes.success || !idemRes.alreadyPaid) {
    throw new Error(`Idempotency check failed: ${JSON.stringify(idemRes)}`);
  }
  console.log('✓ Idempotency verified: duplicate verify returned existing PAID record without re-charging.');

  // ── TEST 7: Payment Cancellation Reporting ──
  console.log('\n[7] Testing Payment Cancellation Reporting...');
  // Create another pending registration
  const r7Email = `test_cancel_${Date.now()}@example.com`;
  const { req: r7a, res: s7a, next: n7a } = mockReqRes({
    ...regPayload,
    email: r7Email,
    mobile: '9123456789',
  });
  await cctvCourseController.createRegistration(r7a, s7a, n7a);
  const cancelRegId = s7a.getJson().registrationId;

  const { req: r7b, res: s7b, next: n7b } = mockReqRes({
    registrationId: cancelRegId,
    status: 'CANCELLED',
    reason: 'User closed modal',
  });
  await cctvCourseController.cancelPayment(r7b, s7b, n7b);
  const cancelDbReg = await Registration.findById(cancelRegId);
  if (cancelDbReg.paymentStatus !== 'CANCELLED') {
    throw new Error(`Cancel payment status mismatch: ${cancelDbReg.paymentStatus}`);
  }
  console.log('✓ Payment cancellation successfully recorded in database.');

  // ── TEST 8: Admin Statistics ──
  console.log('\n[8] Testing Admin Stats Endpoint...');
  const { req: r8, res: s8, next: n8 } = mockReqRes();
  await cctvCourseController.getAdminStats(r8, s8, n8);
  const statsRes = s8.getJson();
  if (!statsRes.success || statsRes.data.paid < 1) {
    throw new Error(`Admin stats check failed: ${JSON.stringify(statsRes)}`);
  }
  console.log(`✓ Admin stats returned: Total=${statsRes.data.total}, Paid=${statsRes.data.paid}, Revenue=₹${statsRes.data.revenue}`);

  // ── TEST 9: Admin Registrations Filter & Search ──
  console.log('\n[9] Testing Admin Registrations Filters & Search...');
  const { req: r9, res: s9, next: n9 } = mockReqRes({}, {}, { status: 'PAID', search: 'John' });
  await cctvCourseController.getAdminRegistrations(r9, s9, n9);
  const adminRegs = s9.getJson();
  if (!adminRegs.success || adminRegs.data.length === 0) {
    throw new Error(`Admin registrations search failed: ${JSON.stringify(adminRegs)}`);
  }
  console.log(`✓ Admin registrations filter returned ${adminRegs.data.length} PAID student(s) matching search.`);

  // ── TEST 10: Bulk Zoom Meeting Link Email Dispatch ──
  console.log('\n[10] Testing Bulk Zoom Meeting Link Dispatch...');
  const adminUser = await User.findOne({ role: 'admin' });
  const adminContext = {
    id: adminUser ? adminUser._id.toString() : new mongoose.Types.ObjectId().toString(),
    email: adminUser ? adminUser.email : 'admin@techbes.co.in',
    role: 'admin',
  };

  const testZoomUrl = 'https://zoom.us/j/98765432101';
  const { req: r10, res: s10, next: n10 } = mockReqRes({
    registrationIds: [regRes.registrationId],
    zoomLink: testZoomUrl,
    classTitle: 'TechBes CCTV Masterclass Live',
    classDate: 'Sunday, 15 October 2026',
    classTime: '10:00 AM - 04:00 PM',
    message: 'Please have your setup ready 10 minutes early.',
  }, {}, {}, adminContext);

  await cctvCourseController.bulkSendZoomLink(r10, s10, n10);
  const zoomRes = s10.getJson();

  if (!zoomRes.success) {
    throw new Error(`Bulk zoom dispatch failed: ${JSON.stringify(zoomRes)}`);
  }
  console.log(`✓ Bulk Zoom link process completed: Total=${zoomRes.total}, Sent=${zoomRes.sent}, Failed=${zoomRes.failed}`);

  dbReg = await Registration.findById(regRes.registrationId);
  console.log(`✓ User Zoom status in DB: zoomLinkSent=${dbReg.zoomLinkSent}, emailStatus=${dbReg.zoomLinkEmailStatus}, link=${dbReg.zoomMeetingLink}`);

  // ── TEST 11: Single Zoom Link Resend ──
  console.log('\n[11] Testing Single Student Zoom Link Resend...');
  const { req: r11, res: s11, next: n11 } = mockReqRes({
    zoomLink: testZoomUrl,
    classTitle: 'TechBes CCTV Masterclass Live Resend',
  }, { id: regRes.registrationId }, {}, adminContext);

  await cctvCourseController.sendSingleZoomLink(r11, s11, n11);
  const singleRes = s11.getJson();
  console.log(`✓ Single resend completed with response: ${JSON.stringify(singleRes.message)}`);

  // ── TEST 12: Audit Logging Verification ──
  console.log('\n[12] Verifying Admin Audit Log Recording...');
  const auditLogs = await AuditLog.find({ action: 'BULK_SEND_ZOOM' }).sort({ createdAt: -1 }).limit(1);
  if (auditLogs.length === 0) {
    throw new Error('Audit log for BULK_SEND_ZOOM was not found.');
  }
  console.log(`✓ Audit log verified: action=${auditLogs[0].action}, actorEmail=${auditLogs[0].actorEmail}, totalRecipients=${auditLogs[0].details?.total}`);

  // Cleanup test data
  await Registration.deleteMany({ email: /test_cctv_.*@example\.com/ });
  await Registration.deleteMany({ email: /test_cancel_.*@example\.com/ });
  await CctvPayment.deleteMany({ razorpayPaymentId: testPaymentId });

  await mongoose.disconnect();

  console.log('\n==========================================================');
  console.log('🎉 ALL 12 ECOSYSTEM VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('==========================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  mongoose.disconnect();
  process.exit(1);
});
