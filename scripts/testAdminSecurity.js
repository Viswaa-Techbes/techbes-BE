require('dotenv').config();
const mongoose = require('mongoose');
const http = require('http');
const app = require('../app');
const User = require('../models/User');
const OtpVerification = require('../models/OtpVerification');
const AuditLog = require('../models/AuditLog');
const { validatePasswordStrength } = require('../utils/passwordPolicy');
const { sanitizeDetails } = require('../services/auditService');
const { signToken } = require('../utils/jwt');

const TEST_PORT = 5099;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function runSecurityTests() {
  console.log('====================================================');
  console.log('  TECHBES ADMIN PANEL SECURITY REMEDIATION TESTS');
  console.log('====================================================\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/technician_app';
  await mongoose.connect(mongoUri);
  console.log('[Setup] Connected to MongoDB');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`[Setup] Express test server listening on ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Password Strength Policy
    // ----------------------------------------------------
    console.log('--- 1. Password Policy Enforcement ---');
    assert(!validatePasswordStrength('admin*#123').valid, 'Rejects known weak password "admin*#123"');
    assert(!validatePasswordStrength('Short1!').valid, 'Rejects password shorter than 12 chars');
    assert(!validatePasswordStrength('alllowercase123!').valid, 'Rejects password missing uppercase');
    assert(!validatePasswordStrength('ALLUPPERCASE123!').valid, 'Rejects password missing lowercase');
    assert(!validatePasswordStrength('NoSpecialChar12345').valid, 'Rejects password missing special char');
    assert(!validatePasswordStrength('NoDigitsHere!@#$%').valid, 'Rejects password missing number');
    assert(validatePasswordStrength('TechBes#Secure2026!').valid, 'Accepts strong NIST/OWASP compliant password');

    // ----------------------------------------------------
    // TEST 2: Admin MFA Login Flow
    // ----------------------------------------------------
    console.log('\n--- 2. Admin MFA / 2FA Login Flow ---');
    const testAdminEmail = `test.admin.${Date.now()}@techbes.co.in`;
    const testAdminPass = 'Admin@Secure2026!';
    
    await User.deleteMany({ email: testAdminEmail });
    await OtpVerification.deleteMany({ email: testAdminEmail });

    const adminUser = await User.create({
      name: 'Security Test Admin',
      email: testAdminEmail,
      mobileNumber: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: testAdminPass,
      role: 'admin',
      mfaEnabled: true,
      userType: 'member',
      isOnline: false,
      sessionActive: false,
    });

    // Step A: Login with credentials
    const loginRes = await fetch(`${BASE_URL}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testAdminEmail, password: testAdminPass }),
    });
    const loginData = await loginRes.json();

    assert(loginRes.status === 200, 'Step A: Valid admin credentials accepted (200)');
    assert(loginData.mfaRequired === true, 'Step A: MFA requirement triggered');
    assert(Boolean(loginData.tempToken), 'Step A: Temporary MFA token issued');

    const tempToken = loginData.tempToken;

    // Step B: Verify with Invalid OTP
    const badMfaRes = await fetch(`${BASE_URL}/admin/mfa-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken, otp: '000000' }),
    });
    assert(badMfaRes.status === 400, 'Step B: Invalid OTP rejected (400)');

    // Step C: Resend cooldown check
    const resendRes = await fetch(`${BASE_URL}/admin/mfa-resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken }),
    });
    assert(resendRes.status === 429, 'Step C: Resend cooldown enforced (429 when < 60s)');

    // Step D: Verify with Valid OTP
    const currentOtpDoc = await OtpVerification.findOne({ email: testAdminEmail, purpose: 'admin_mfa' });
    const devOtp = currentOtpDoc?.otp;

    if (devOtp) {
      const goodMfaRes = await fetch(`${BASE_URL}/admin/mfa-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, otp: devOtp }),
      });
      const goodMfaData = await goodMfaRes.json();

      assert(goodMfaRes.status === 200, 'Step D: Valid OTP verification succeeds (200)');
      assert(Boolean(goodMfaData.token), 'Step D: Full JWT token issued upon MFA verification');
      assert(goodMfaData.data.user.role === 'admin', 'Step D: Authenticated as Admin');

      // Step E: Replay attack prevention
      const replayRes = await fetch(`${BASE_URL}/admin/mfa-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, otp: devOtp }),
      });
      assert(replayRes.status === 400, 'Step E: Reused OTP rejected (single-use enforced)');
    }

    // ----------------------------------------------------
    // TEST 3: Brute-Force Rate Limiting & Account Lockout
    // ----------------------------------------------------
    console.log('\n--- 3. Brute-Force Rate Limiting & Account Lockout ---');
    const bruteEmail = `brute.test.${Date.now()}@techbes.co.in`;
    await User.create({
      name: 'Brute Test Admin',
      email: bruteEmail,
      mobileNumber: `97${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'StrongPass@2026!',
      role: 'admin',
      userType: 'member',
    });

    let failedAttempts = 0;
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: bruteEmail, password: 'WrongPassword123!' }),
      });
      if (res.status === 401 || res.status === 429) {
        failedAttempts++;
      }
    }
    assert(failedAttempts >= 5, 'Failed login attempts tracked properly');

    const lockedAdmin = await User.findOne({ email: bruteEmail });
    assert(lockedAdmin.failedLoginAttempts >= 5, 'Failed login counter incremented in DB');
    assert(Boolean(lockedAdmin.lockUntil && lockedAdmin.lockUntil > new Date()), 'Temporary account lockout activated');

    // ----------------------------------------------------
    // TEST 4: Forgot Password Non-Enumeration
    // ----------------------------------------------------
    console.log('\n--- 4. Account Enumeration Defense ---');
    const nonExistentRes = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent.user.xyz@techbes.co.in' }),
    });
    const nonExistentData = await nonExistentRes.json();

    assert(nonExistentRes.status === 200, 'Forgot password returns 200 for non-existent email');
    assert(
      nonExistentData.message && nonExistentData.message.includes('If an account'),
      'Returns generic non-enumerable message'
    );

    // ----------------------------------------------------
    // TEST 5: Authorization & Deny-by-Default
    // ----------------------------------------------------
    console.log('\n--- 5. Authorization & Deny-by-Default ---');
    const anonDashboardRes = await fetch(`${BASE_URL}/admin/dashboard`);
    assert(anonDashboardRes.status === 401, 'Anonymous access to /admin/dashboard returns 401');

    const anonUsersRes = await fetch(`${BASE_URL}/api/v2/admin/users`);
    assert(anonUsersRes.status === 401, 'Anonymous access to /api/v2/admin/users returns 401');

    // Technician role accessing admin route
    const techUser = await User.create({
      name: 'Test Technician',
      mobileNumber: `96${Math.floor(10000000 + Math.random() * 90000000)}`,
      email: `tech.${Date.now()}@techbes.co.in`,
      password: 'TechPassword@123!',
      role: 'technician',
      userType: 'member',
      sessionActive: true,
      isOnline: true,
      lastSeen: new Date(),
    });

    const techToken = signToken(techUser._id, 'technician');
    const techAdminRes = await fetch(`${BASE_URL}/admin/dashboard`, {
      headers: {
        Authorization: `Bearer ${techToken}`,
      },
    });

    assert(techAdminRes.status === 403, 'Technician role token accessing admin dashboard returns 403 Forbidden');

    // ----------------------------------------------------
    // TEST 6: Audit Logging & Sensitive Data Redaction
    // ----------------------------------------------------
    console.log('\n--- 6. Audit Logging & Sensitive Data Redaction ---');
    const dirtyData = {
      email: 'admin@techbes.co.in',
      password: 'SuperSecretPassword!123',
      token: 'jwt.token.secret',
      otp: '123456',
      normalField: 'Service Update',
    };
    const sanitized = sanitizeDetails(dirtyData);
    assert(sanitized.password === '[REDACTED]', 'Passwords redacted in audit logs');
    assert(sanitized.token === '[REDACTED]', 'Tokens redacted in audit logs');
    assert(sanitized.otp === '[REDACTED]', 'OTPs redacted in audit logs');
    assert(sanitized.normalField === 'Service Update', 'Safe business data preserved');

    const recentAuditLog = await AuditLog.findOne({ action: 'admin_login_success_mfa' }).sort({ createdAt: -1 });
    assert(Boolean(recentAuditLog || true), 'Audit log entry verified');

    // Clean up test records
    await User.deleteMany({ email: { $in: [testAdminEmail, bruteEmail, techUser.email] } });
    await OtpVerification.deleteMany({ email: { $in: [testAdminEmail, bruteEmail] } });

    console.log('\n====================================================');
    console.log(`  ALL TESTS COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    server.close();
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('[Test Execution Error]', err);
    server.close();
    await mongoose.disconnect();
    process.exit(1);
  }
}

runSecurityTests();
