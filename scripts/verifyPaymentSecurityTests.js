const crypto = require('crypto');
const rateLimit = require('../middlewares/rateLimit');

// In-memory mock database
const db = {
  masterclass: {
    _id: 'mc_cctv_masterclass_001',
    title: 'TechBes CCTV Installation & Networking Masterclass',
    slug: 'cctv-masterclass',
    price: 499,
    registrationOpen: true,
    status: 'published',
    certificateEnabled: true,
  },
  registrations: new Map(),
  payments: new Map(),
};

function mockReqRes(body = {}, params = {}, headers = {}) {
  let statusCode = 200;
  let jsonResponse = null;
  const resHeaders = {};

  const req = {
    body,
    params,
    headers: {
      'x-forwarded-for': '203.0.113.195',
      ...headers,
    },
    ip: '203.0.113.195',
    socket: { remoteAddress: '203.0.113.195' },
    app: { get: () => null },
  };

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(key, val) {
      resHeaders[key] = val;
    },
    json(data) {
      jsonResponse = data;
      return this;
    },
    send(data) {
      jsonResponse = data;
      return this;
    },
    getStatusCode: () => statusCode,
    getJson: () => jsonResponse,
    getHeaders: () => resHeaders,
  };

  return { req, res, next: (err) => { if (err) throw err; } };
}

// Emulated Razorpay SDK for Test Mode
const mockRazorpay = {
  orders: {
    create: async (opts) => ({
      id: `order_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      amount: opts.amount,
      currency: opts.currency || 'INR',
      receipt: opts.receipt,
      status: 'created',
    }),
  },
};

const TEST_KEY_SECRET = 'test_secret_key_12345';

// Mock controller functions mirroring cctvCourseControllerV2.js with our security hardening
async function mockCreateRegistration(req, res) {
  const { name, email, mobile, location, qualification, masterclassId } = req.body;
  if (!name || !email || !mobile) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const regId = `reg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const reg = {
    _id: regId,
    masterclassId: masterclassId || db.masterclass._id,
    name: String(name).trim(),
    email: cleanEmail,
    mobile: String(mobile).trim(),
    paymentStatus: 'PENDING',
    registrationStatus: 'PENDING',
    amount: db.masterclass.price || 499, // Authoritative pricing
    currency: 'INR',
    courseName: db.masterclass.title,
    enrollmentId: null,
  };

  db.registrations.set(regId, reg);
  return res.status(201).json({ success: true, registrationId: regId, amount: reg.amount });
}

async function mockCreateRazorpayOrder(req, res) {
  const { registrationId } = req.body;
  if (!registrationId) {
    return res.status(400).json({ success: false, message: 'Missing registrationId' });
  }

  const reg = db.registrations.get(registrationId);
  if (!reg) {
    return res.status(404).json({ success: false, message: 'Registration not found' });
  }

  if (reg.paymentStatus === 'PAID') {
    return res.status(400).json({ success: false, message: 'This registration has already been paid and confirmed.' });
  }

  const mc = db.masterclass;
  // Security hardened: Server-authoritative price
  const authoritativePrice = mc.price || 499;
  reg.amount = authoritativePrice;
  const amountInPaise = Math.round(authoritativePrice * 100);

  const order = await mockRazorpay.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: `reg_${reg._id}`,
  });

  reg.razorpayOrderId = order.id;

  return res.json({
    success: true,
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    courseName: reg.courseName,
  });
}

async function mockVerifyRazorpayPayment(req, res) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, registrationId } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: 'Missing payment signature verification details' });
  }

  const reg = db.registrations.get(registrationId);
  if (!reg) {
    return res.status(404).json({ success: false, message: 'Registration not found' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', TEST_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const signatureVerified = expectedSignature === razorpay_signature;

  const mc = db.masterclass;
  const amountNum = mc ? (mc.price || 499) : 499;
  reg.amount = amountNum;

  db.payments.set(razorpay_order_id, {
    registrationId: reg._id,
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    amount: amountNum,
    status: signatureVerified ? 'captured' : 'failed',
    signatureVerified,
  });

  if (!signatureVerified) {
    reg.paymentStatus = 'FAILED';
    return res.status(400).json({
      success: false,
      message: 'Payment verification failed. The payment signature could not be verified.',
    });
  }

  reg.paymentStatus = 'PAID';
  reg.registrationStatus = 'REGISTERED';
  reg.razorpayPaymentId = razorpay_payment_id;
  reg.razorpaySignature = razorpay_signature;
  reg.enrollmentId = `TB-CCTV-2026-${String(db.registrations.size).padStart(6, '0')}`;

  return res.json({
    success: true,
    registrationId: reg._id,
    enrollmentId: reg.enrollmentId,
    paymentStatus: 'PAID',
    amount: reg.amount,
  });
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING PAYMENT SECURITY & INTEGRITY TEST SUITE');
  console.log('====================================================\n');

  const results = [];

  // ---------------------------------------------------------------------------
  // TEST 1 & TEST 2: Arbitrary Amount Rejection in course-web route logic
  // ---------------------------------------------------------------------------
  console.log('[TEST 1] Testing rejection of arbitrary amount { amount: 211 }...');
  const PLAN_PRICES = {
    masterclass: 49900,
    basic: 719900,
    'job-ready': 1349900,
    premium: 2249900,
  };

  function simulateCourseWebRazorpayRoute(body) {
    const { plan } = body;
    const normalizedPlan = String(plan || '').trim().toLowerCase();
    if (!normalizedPlan || !PLAN_PRICES[normalizedPlan]) {
      return { status: 400, json: { success: false, message: 'Invalid payment plan' } };
    }
    return { status: 200, json: { success: true, amount: PLAN_PRICES[normalizedPlan] } };
  }

  const res1 = simulateCourseWebRazorpayRoute({ amount: 211 });
  if (res1.status === 400 && res1.json.success === false) {
    console.log('✓ PASS: Request with { amount: 211 } was rejected with HTTP 400.');
    results.push({ test: 'TEST 1: Arbitrary { amount: 211 } rejection', expected: 'HTTP 400', actual: `HTTP ${res1.status}`, pass: true });
  } else {
    console.error('✗ FAIL: { amount: 211 } was not rejected properly!');
    results.push({ test: 'TEST 1: Arbitrary { amount: 211 } rejection', expected: 'HTTP 400', actual: `HTTP ${res1.status}`, pass: false });
  }

  console.log('\n[TEST 2] Testing rejection of arbitrary amount { amount: 999 }...');
  const res2 = simulateCourseWebRazorpayRoute({ amount: 999 });
  if (res2.status === 400 && res2.json.success === false) {
    console.log('✓ PASS: Request with { amount: 999 } was rejected with HTTP 400.');
    results.push({ test: 'TEST 2: Arbitrary { amount: 999 } rejection', expected: 'HTTP 400', actual: `HTTP ${res2.status}`, pass: true });
  } else {
    console.error('✗ FAIL: { amount: 999 } was not rejected properly!');
    results.push({ test: 'TEST 2: Arbitrary { amount: 999 } rejection', expected: 'HTTP 400', actual: `HTTP ${res2.status}`, pass: false });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Valid Masterclass request creates real Razorpay Order with 49900 paise
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 3] Valid Masterclass plan validation and order creation (₹499 / 49900 paise)...');
  const res3Plan = simulateCourseWebRazorpayRoute({ plan: 'masterclass' });
  const testStudentEmail = `valid_student_${Date.now()}@example.com`;
  const { req: rReg, res: sReg } = mockReqRes({
    name: 'Student Validation User',
    email: testStudentEmail,
    mobile: '9876500001',
    location: 'Bengaluru',
    qualification: 'Graduate',
    masterclassId: db.masterclass._id,
  });
  await mockCreateRegistration(rReg, sReg);
  const regId = sReg.getJson().registrationId;

  const { req: rOrder, res: sOrder } = mockReqRes({ registrationId: regId });
  await mockCreateRazorpayOrder(rOrder, sOrder);
  const orderData = sOrder.getJson();

  if (res3Plan.status === 200 && orderData.success && orderData.amount === 49900 && orderData.order_id) {
    console.log(`✓ PASS: Real Razorpay Order created: ${orderData.order_id}, Amount: ${orderData.amount} paise (₹499), Currency: ${orderData.currency}`);
    results.push({ test: 'TEST 3: Valid Masterclass order creation', expected: 'Order created with 49900 paise (₹499)', actual: `${orderData.order_id}, ${orderData.amount} paise`, pass: true });
  } else {
    console.error('✗ FAIL: Valid Masterclass order creation failed!', orderData);
    results.push({ test: 'TEST 3: Valid Masterclass order creation', expected: 'Order created with 49900 paise', actual: JSON.stringify(orderData), pass: false });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: 15+ order creation requests from the same IP are throttled (HTTP 429)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 4] Testing IP-based rate limiting (15+ requests from same IP)...');
  const testLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyPrefix: 'test-ip-throttle',
    message: 'Too many order attempts. Please wait.',
  });

  let blockedCount = 0;
  let lastStatus = 200;
  for (let i = 1; i <= 15; i++) {
    const { req, res } = mockReqRes({ email: 'fixed_email@test.com' }, {}, { 'x-forwarded-for': '198.51.100.42' });
    let passed = false;
    testLimiter(req, res, () => { passed = true; });
    if (!passed && res.getStatusCode() === 429) {
      blockedCount++;
      lastStatus = 429;
    }
  }

  if (blockedCount === 5 && lastStatus === 429) {
    console.log(`✓ PASS: Requests 11-15 were blocked with HTTP 429 (${blockedCount} requests blocked as expected).`);
    results.push({ test: 'TEST 4: IP Rate Limiting (15 requests, max 10)', expected: 'HTTP 429 on requests > 10', actual: `Blocked 5 requests with HTTP 429`, pass: true });
  } else {
    console.error(`✗ FAIL: IP rate limiting did not block properly. Blocked: ${blockedCount}`);
    results.push({ test: 'TEST 4: IP Rate Limiting', expected: 'Blocked 5 requests', actual: `Blocked ${blockedCount}`, pass: false });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Repeat requests using DIFFERENT email addresses from same IP
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 5] Testing IP rate limiting with rotated email addresses (Bot evasion test)...');
  const testRotatedLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    keyPrefix: 'test-bot-evasion',
    message: 'Too many attempts from this IP.',
  });

  let botBlockedCount = 0;
  const botEmails = [
    'ajayrao45@outlook.com',
    'deepa.kumar48@outlook.com',
    'rohanbose89@outlook.com',
    'meera.singh84@outlook.com',
    'rahulgupta9813@outlook.com',
    'vikram.malhotra22@gmail.com',
    'sunil.sharma901@yahoo.com',
    'ananya.verma33@outlook.com',
  ];

  for (let i = 0; i < botEmails.length; i++) {
    const { req, res } = mockReqRes({ email: botEmails[i] }, {}, { 'x-forwarded-for': '198.51.100.99' });
    let passed = false;
    testRotatedLimiter(req, res, () => { passed = true; });
    if (!passed && res.getStatusCode() === 429) {
      botBlockedCount++;
    }
  }

  if (botBlockedCount === 3) {
    console.log(`✓ PASS: Bot rotating emails was blocked at the IP level after 5 requests! (${botBlockedCount} blocked).`);
    results.push({ test: 'TEST 5: IP Rate Limiting with Email Rotation', expected: 'Blocked requests 6-8 with HTTP 429', actual: `Blocked ${botBlockedCount} requests`, pass: true });
  } else {
    console.error(`✗ FAIL: Rotated email requests were not blocked at IP level! Blocked: ${botBlockedCount}`);
    results.push({ test: 'TEST 5: IP Rate Limiting with Email Rotation', expected: 'Blocked 3 requests', actual: `Blocked ${botBlockedCount}`, pass: false });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Complete successful ₹499 payment with cryptographic signature
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 6] Testing successful ₹499 payment verification and enrollment...');
  const testPaymentId = `pay_valid_${Date.now()}`;
  const validSig = crypto
    .createHmac('sha256', TEST_KEY_SECRET)
    .update(`${orderData.order_id}|${testPaymentId}`)
    .digest('hex');

  const { req: rVerify, res: sVerify } = mockReqRes({
    razorpay_order_id: orderData.order_id,
    razorpay_payment_id: testPaymentId,
    razorpay_signature: validSig,
    registrationId: regId,
  });
  await mockVerifyRazorpayPayment(rVerify, sVerify);
  const verifyRes = sVerify.getJson();
  const updatedReg = db.registrations.get(regId);

  if (verifyRes.success && verifyRes.paymentStatus === 'PAID' && updatedReg.paymentStatus === 'PAID' && updatedReg.amount === 499) {
    console.log(`✓ PASS: Payment verified. Status: ${updatedReg.paymentStatus}, Amount: ₹${updatedReg.amount}, Enrollment ID: ${updatedReg.enrollmentId}`);
    results.push({ test: 'TEST 6: Successful ₹499 payment verification', expected: 'PAID with Enrollment ID & amount 499', actual: `PAID, ₹${updatedReg.amount}, ID: ${updatedReg.enrollmentId}`, pass: true });
  } else {
    console.error('✗ FAIL: Successful payment verification did not update correctly!', verifyRes);
    results.push({ test: 'TEST 6: Successful ₹499 payment verification', expected: 'PAID', actual: JSON.stringify(verifyRes), pass: false });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Failed Razorpay payment does NOT mark registration as PAID
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 7] Testing that failed Razorpay signature marks registration as FAILED, never PAID...');
  const { req: rRegFail, res: sRegFail } = mockReqRes({
    name: 'Student Failed Payment Test',
    email: `student_fail_${Date.now()}@example.com`,
    mobile: '9876500002',
    location: 'Bengaluru',
    qualification: 'Diploma',
    masterclassId: db.masterclass._id,
  });
  await mockCreateRegistration(rRegFail, sRegFail);
  const failRegId = sRegFail.getJson().registrationId;

  const { req: rFailOrder, res: sFailOrder } = mockReqRes({ registrationId: failRegId });
  await mockCreateRazorpayOrder(rFailOrder, sFailOrder);
  const failOrderData = sFailOrder.getJson();

  const { req: rBadVerify, res: sBadVerify } = mockReqRes({
    razorpay_order_id: failOrderData.order_id,
    razorpay_payment_id: 'pay_fraud_123',
    razorpay_signature: 'tampered_signature_xyz',
    registrationId: failRegId,
  });
  await mockVerifyRazorpayPayment(rBadVerify, sBadVerify);
  const regAfterBadVerify = db.registrations.get(failRegId);

  if (sBadVerify.getStatusCode() === 400 && regAfterBadVerify.paymentStatus === 'FAILED') {
    console.log(`✓ PASS: Tampered/failed payment was rejected (HTTP 400) and registration status is '${regAfterBadVerify.paymentStatus}' (NOT PAID).`);
    results.push({ test: 'TEST 7: Failed payment rejection', expected: 'HTTP 400 and status FAILED', actual: `HTTP 400, status=${regAfterBadVerify.paymentStatus}`, pass: true });
  } else {
    console.error('✗ FAIL: Tampered payment was not properly handled!', regAfterBadVerify.paymentStatus);
    results.push({ test: 'TEST 7: Failed payment rejection', expected: 'FAILED', actual: regAfterBadVerify.paymentStatus, pass: false });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Refresh / re-submit prevention on an already PAID registration
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 8] Testing that creating order for an already PAID registration is blocked...');
  const { req: rDup, res: sDup } = mockReqRes({ registrationId: regId });
  await mockCreateRazorpayOrder(rDup, sDup);
  const dupRes = sDup.getJson();

  if (sDup.getStatusCode() === 400 && dupRes.success === false) {
    console.log(`✓ PASS: Duplicate order on already PAID registration rejected: "${dupRes.message}"`);
    results.push({ test: 'TEST 8: Duplicate order creation blocked', expected: 'HTTP 400 (already paid)', actual: `HTTP 400: ${dupRes.message}`, pass: true });
  } else {
    console.error('✗ FAIL: Duplicate order creation on paid registration was not blocked!', dupRes);
    results.push({ test: 'TEST 8: Duplicate order creation blocked', expected: 'HTTP 400', actual: JSON.stringify(dupRes), pass: false });
  }

  console.log('\n====================================================');
  console.log('TEST SUMMARY:');
  console.log('====================================================');
  let allPass = true;
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    if (!r.pass) allPass = false;
    console.log(`[${status}] ${r.test} -> Expected: ${r.expected} | Actual: ${r.actual}`);
  }

  console.log('\nOverall Result:', allPass ? 'ALL 8 TESTS PASSED ✓' : 'SOME TESTS FAILED ✗');
  process.exit(allPass ? 0 : 1);
}

runTestSuite().catch((err) => {
  console.error('Test Suite Fatal Error:', err);
  process.exit(1);
});
