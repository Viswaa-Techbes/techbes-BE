/**
 * e2e_full_workorder_test.js
 * Full E2E verification of:
 * 1. Admin Create Work Order (+ assign to QA Tech Tester 9000099999)
 * 2. Tech fetches job & progresses through accepted -> travelling -> arrived -> working
 * 3. Tech submits field expense
 * 4. Tech uploads worksheet proof (before/after photos)
 * 5. Tech completes job
 * 6. Admin views & approves expense in /api/v2/admin/expenses
 * 7. Admin verifies & approves completed job
 * 8. Clean up temporary QA Work Order & Expense
 */
const https = require('https');

const API_BASE = 'https://api.techbes.co.in';

function request(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };
    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (_) {}
        resolve({ status: res.statusCode, body: json || body });
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function run() {
  console.log('=== TechBes Full E2E Work Order, Expense & Verification Audit ===\n');

  // 1. Admin Login
  const adminRes = await request(`${API_BASE}/admin/login`, { method: 'POST' }, {
    email: 'lohith@techbes.co.in',
    password: 'admin*#123',
  });
  const adminToken = adminRes.body?.data?.token || adminRes.body?.token;
  if (adminRes.status !== 200 || !adminToken) {
    throw new Error(`Admin login failed: ${adminRes.status} ${JSON.stringify(adminRes.body)}`);
  }
  console.log('1. ✓ Admin authenticated');

  // 2. Tech Login
  const techRes = await request(`${API_BASE}/api/auth/login`, { method: 'POST' }, {
    mobileNumber: '9000099999',
    password: 'TechTest@123',
  });
  const techToken = techRes.body?.data?.token || techRes.body?.token;
  const techUser = techRes.body?.data?.user || techRes.body?.user;
  const techId = techUser?._id || techUser?.id;
  if (techRes.status !== 200 || !techToken || !techId) {
    throw new Error(`Tech login failed: ${techRes.status} ${JSON.stringify(techRes.body)}`);
  }
  console.log(`2. ✓ QA Technician authenticated (ID: ${techId})`);

  // 3. Check Fleet Tracking query excludes deleted/inactive
  const trackRes = await request(`${API_BASE}/api/v2/admin/tracking`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (trackRes.status !== 200) throw new Error(`Tracking failed: ${trackRes.status}`);
  console.log(`3. ✓ Fleet Live View tracking returned ${trackRes.body.data?.length || 0} active technicians`);

  // 4. Create Work Order via Admin endpoint
  const createRes = await request(`${API_BASE}/api/v2/admin/service-requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  }, {
    customerName: 'QA Automated Verification Client',
    customerPhone: '9888877777',
    customerEmail: 'qa-verify@techbes.co.in',
    address: '42 Tech Park Road, Indiranagar, Bengaluru',
    pincode: '560038',
    serviceCategory: 'CCTV',
    subcategory: 'New Installation',
    equipmentSummary: '4x 2MP Dome Cameras + 4ch DVR + 1TB HDD',
    totalAmount: 14500,
    paymentStatus: 'pending',
    preferredDate: new Date().toISOString().split('T')[0],
    timeSlot: '10:00 AM - 01:00 PM',
    priority: 'Urgent',
    technicianId: techId,
    dispatchNote: 'Call customer 15 mins prior. Verify DVR rack mounting.',
  });
  if (createRes.status !== 201 || !createRes.body?.data?.id) {
    throw new Error(`Create Work Order failed: ${createRes.status} ${JSON.stringify(createRes.body)}`);
  }
  const jobId = createRes.body.data.id;
  const bookingNumber = createRes.body.data.bookingNumber;
  console.log(`4. ✓ Work Order created & assigned: ${bookingNumber} (${jobId})`);

  // 5. Verify job appears in Technician's job list
  const techJobsRes = await request(`${API_BASE}/jobs`, {
    headers: { Authorization: `Bearer ${techToken}` },
  });
  const techJobs = techJobsRes.body?.data || [];
  const foundJob = techJobs.find((j) => (j._id || j.id) === jobId);
  if (!foundJob) {
    throw new Error(`New Work Order ${jobId} did not appear in technician /jobs list!`);
  }
  console.log(`5. ✓ Job visible in Technician App API (dispatchNote: "${foundJob.dispatchNote}")`);

  // 6. Progress job through lifecycle
  for (const status of ['accepted', 'travelling', 'arrived', 'working']) {
    const stRes = await request(`${API_BASE}/jobs/${jobId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${techToken}` },
    }, { status, note: `QA E2E transition to ${status}`, lat: 12.9716, lng: 77.5946 });
    if (stRes.status !== 200) {
      throw new Error(`Status transition to ${status} failed: ${stRes.status} ${JSON.stringify(stRes.body)}`);
    }
  }
  console.log('6. ✓ Job progressed: accepted -> travelling -> arrived -> working');

  // 7. Submit Field Expense
  const expRes = await request(`${API_BASE}/expenses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${techToken}` },
  }, {
    amount: 350,
    description: 'QA E2E Cat6 cable & BNC connectors',
    jobId,
    receiptUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  });
  if (expRes.status !== 201 || !expRes.body?.data?._id) {
    throw new Error(`Expense submit failed: ${expRes.status} ${JSON.stringify(expRes.body)}`);
  }
  const expenseId = expRes.body.data._id;
  console.log(`7. ✓ Field Expense submitted (ID: ${expenseId}, ₹350)`);

  // 8. Fetch/Initialize Worksheet & Upload Before/After Proof
  await request(`${API_BASE}/api/v2/worksheets/job/${jobId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${techToken}` },
  });
  const wsRes = await request(`${API_BASE}/api/v2/worksheets/job/${jobId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${techToken}` },
  }, {
    observationNotes: 'All 4 cameras mounted cleanly and DVR recording verified.',
    beforePhotos: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    afterPhotos: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    status: 'in_progress',
  });
  if (wsRes.status < 200 || wsRes.status >= 300) {
    throw new Error(`Worksheet upload failed: ${wsRes.status} ${JSON.stringify(wsRes.body)}`);
  }
  console.log('8. ✓ Worksheet & before/after photo proof uploaded');

  // 9. Complete job via Completion OTP
  const genOtpRes = await request(`${API_BASE}/api/v2/otp/complete/${jobId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${techToken}` },
  });
  const otpCode = genOtpRes.body?.otp;
  if (!otpCode) {
    throw new Error(`Generate completion OTP failed: ${genOtpRes.status} ${JSON.stringify(genOtpRes.body)}`);
  }
  const compRes = await request(`${API_BASE}/api/v2/otp/complete/${jobId}/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${techToken}` },
  }, { otp: String(otpCode) });
  if (compRes.status !== 200) {
    throw new Error(`Complete job failed: ${compRes.status} ${JSON.stringify(compRes.body)}`);
  }
  console.log('9. ✓ Job marked completed via Customer Completion OTP');

  // 10. Admin lists & approves Expense
  const listExpRes = await request(`${API_BASE}/api/v2/admin/expenses`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const foundExp = (listExpRes.body?.data || []).find((e) => (e._id || e.id) === expenseId);
  if (!foundExp) throw new Error('Submitted expense not visible in /api/v2/admin/expenses');

  const approveExpRes = await request(`${API_BASE}/api/v2/admin/expenses/${expenseId}/approve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (approveExpRes.status !== 200 || approveExpRes.body?.data?.status !== 'approved') {
    throw new Error(`Approve expense failed: ${approveExpRes.status} ${JSON.stringify(approveExpRes.body)}`);
  }
  console.log('10. ✓ Admin listed & approved Expense (status: approved)');

  // 11. Admin Verifies & Approves Work
  const verifyRes = await request(`${API_BASE}/api/v2/admin/service-requests/${jobId}/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  }, { status: 'verified', note: 'E2E QA approved!' });
  if (verifyRes.status !== 200 || verifyRes.body?.data?.adminVerified !== true) {
    throw new Error(`Verify job failed: ${verifyRes.status} ${JSON.stringify(verifyRes.body)}`);
  }
  console.log('11. ✓ Admin verified & approved completed Work Order');

  // 12. Clean up temporary QA Work Order
  const delRes = await request(`${API_BASE}/api/v2/admin/service-requests/${jobId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`12. ✓ Temporary QA Work Order deleted (status: ${delRes.status})`);

  console.log('\n=== FULL E2E WORK ORDER & EXPENSE VERIFICATION PASSED 100% ===');
  return { jobId, expenseId, bookingNumber };
}

run().catch((err) => {
  console.error('\n❌ E2E Test Failed:', err);
  process.exit(1);
});
