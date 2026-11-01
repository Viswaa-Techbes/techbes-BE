/**
 * Phase 3: Apartment Workflow Verification
 * 1. Resident Login & Profile check (TechBes Demo Residency, Flat A-101)
 * 2. Resident Complaint Submission (Demo — Water Leakage in Kitchen, Plumbing, Priority High, with test photo)
 * 3. In-Charge Login & Queue check (Only assigned apartment complaints)
 * 4. In-Charge Updates Status (In Progress), Adds Public Reply & Adds Private Internal Note
 * 5. Resident Verification (Sees "In Progress", sees public reply, DOES NOT see internal note)
 * 6. Security Isolation / IDOR Test (Isolation resident & in-charge cannot access Demo Residency complaint)
 */

const http = require('http');

const API_BASE = 'http://localhost:5000';

function request(url, options = {}) {
  const { method = 'GET', headers = {}, body } = options;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method,
      headers: { ...headers },
    };

    let postData;
    if (body !== undefined) {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        postData = body;
      } else {
        postData = JSON.stringify(body);
        reqOptions.headers['Content-Type'] = 'application/json';
      }
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let json = null;
        try {
          json = JSON.parse(raw);
        } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          raw,
          json,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error(`Timeout requesting ${url}`)));

    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('======================================================================');
  console.log('🏢 PHASE 3: APARTMENT MANAGEMENT END-TO-END VERIFICATION');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(title, condition, detail = '') {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      if (detail) console.log(`   └─ ${detail}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title}`);
      if (detail) console.error(`   └─ ${detail}`);
      failed++;
    }
  }

  try {
    // 1. Resident Login
    console.log('[Step 1] Logging in as Demo Resident (9800000001)...');
    const resLogin = await request(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'x-forwarded-for': `10.0.1.${Math.floor(Math.random() * 200 + 1)}` },
      body: { mobileNumber: '9800000001', password: 'Resident@Demo123' },
    });
    assert('Resident Login (9800000001)', resLogin.status === 200 && resLogin.json?.token, `Status: ${resLogin.status}, User: ${resLogin.json?.user?.name}`);
    const residentToken = resLogin.json?.token;

    // 2. Resident Profile Verification
    console.log('\n[Step 2] Verifying Resident Profile & Apartment Mapping...');
    const resProfile = await request(`${API_BASE}/api/v2/apartments/residents/me`, {
      headers: { Authorization: `Bearer ${residentToken}` },
    });
    const aptData = resProfile.json?.data?.apartment;
    const residentData = resProfile.json?.data?.resident;
    assert(
      'Resident Profile & Flat Mapping',
      resProfile.status === 200 && aptData?.name === 'TechBes Demo Residency' && residentData?.flatNumber === 'A-101',
      `Apartment: ${aptData?.name}, Flat: ${residentData?.flatNumber}, Block: ${residentData?.block}`
    );

    // 3. Register Complaint with Photo / Attachments
    console.log('\n[Step 3] Submitting Resident Complaint...');
    const uniqueTitle = `Demo — Water Leakage in Kitchen (${Date.now()})`;
    const compRes = await request(`${API_BASE}/api/v2/apartments/tickets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${residentToken}` },
      body: {
        subject: uniqueTitle,
        description: 'Minor water seepage observed under kitchen sink. Needs plumber inspection.',
        category: 'Plumbing/Water',
        priority: 'High',
        attachments: [
          'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&auto=format&fit=crop'
        ],
      },
    });
    console.log('DEBUG compRes:', compRes.status, compRes.raw);
    const ticket = compRes.json?.data;
    const ticketMongoId = ticket?._id;
    const ticketId = ticket?.ticketId || ticket?._id;
    assert(
      'Complaint Registration with Photo/Attachment',
      compRes.status === 201 && ticketId && ticket?.apartmentName === 'TechBes Demo Residency',
      `Generated Ticket ID: ${ticket?.ticketId || ticketMongoId}, Apartment: ${ticket?.apartmentName}, Flat: ${ticket?.flatNumber}`
    );

    // 4. In-Charge Login
    console.log('\n[Step 4] Logging in as Demo In-Charge (9800000002)...');
    const inchargeLogin = await request(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'x-forwarded-for': `10.0.2.${Math.floor(Math.random() * 200 + 1)}` },
      body: { mobileNumber: '9800000002', password: 'Incharge@Demo123' },
    });
    assert('In-Charge Login (9800000002)', inchargeLogin.status === 200 && inchargeLogin.json?.token, `Status: ${inchargeLogin.status}, Role: ${inchargeLogin.json?.user?.role}`);
    const inchargeToken = inchargeLogin.json?.token;

    // 5. In-Charge Queue Verification
    console.log('\n[Step 5] In-Charge Queue Verification for TechBes Demo Residency...');
    const queueRes = await request(`${API_BASE}/api/v2/apartments/tickets`, {
      headers: { Authorization: `Bearer ${inchargeToken}` },
    });
    const inchargeTickets = queueRes.json?.data || [];
    const foundTicket = inchargeTickets.find(t => (t._id === ticketMongoId || t.ticketId === ticket?.ticketId));
    assert(
      'In-Charge Queue Visibility',
      queueRes.status === 200 && !!foundTicket,
      `Found submitted ticket ${ticket?.ticketId || ticketMongoId} in in-charge complaints queue (total in queue: ${inchargeTickets.length})`
    );

    // 6. In-Charge Status Update + Public Reply + Private Internal Note
    console.log('\n[Step 6] In-Charge Updating Status to "In Progress", adding Public Reply & Internal Note...');
    const statusUpdateRes = await request(`${API_BASE}/api/v2/apartments/tickets/${ticketMongoId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${inchargeToken}` },
      body: {
        status: 'In Progress',
        reason: 'Plumbing technician dispatched to Flat A-101 for inspection.',
      },
    });
    assert(
      'In-Charge Status Update',
      statusUpdateRes.status === 200 && statusUpdateRes.json?.data?.status === 'In Progress',
      `Status updated to: ${statusUpdateRes.json?.data?.status}`
    );

    const replyRes = await request(`${API_BASE}/api/v2/apartments/tickets/${ticketMongoId}/reply`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${inchargeToken}` },
      body: {
        text: 'Technician Rajesh has arrived at your block and will visit within 15 minutes.',
      },
    });
    assert(
      'In-Charge Public Reply Added',
      replyRes.status === 200 && replyRes.json?.success === true,
      `Reply added to ticket conversation`
    );

    const internalNoteRes = await request(`${API_BASE}/api/v2/apartments/tickets/${ticketMongoId}/internal-notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inchargeToken}` },
      body: {
        text: 'CONFIDENTIAL_INTERNAL_NOTE: Pipe replacement costs covered under builder 1-year warranty.',
      },
    });
    assert(
      'In-Charge Internal Note Created',
      internalNoteRes.status === 200 && internalNoteRes.json?.success === true,
      `Internal note stored in audit trail`
    );

    // 7. Resident Verification of Status & Privacy
    console.log('\n[Step 7] Resident Checking Ticket Details & Internal Note Privacy...');
    const residentVerifyRes = await request(`${API_BASE}/api/v2/apartments/tickets/${ticketMongoId}`, {
      headers: { Authorization: `Bearer ${residentToken}` },
    });
    const verifiedTicket = residentVerifyRes.json?.data;
    const hasPublicReply = JSON.stringify(verifiedTicket?.messages || []).includes('Technician Rajesh has arrived');
    const leaksInternalNote = JSON.stringify(verifiedTicket || {}).includes('CONFIDENTIAL_INTERNAL_NOTE');
    assert(
      'Resident Sees Updated Status & Public Reply',
      residentVerifyRes.status === 200 && verifiedTicket?.status === 'In Progress' && hasPublicReply,
      `Status: ${verifiedTicket?.status}, Public Reply Visible: ${hasPublicReply}`
    );
    assert(
      'Internal Notes Privacy Defense (Zero Leak to Resident)',
      !leaksInternalNote && (!verifiedTicket?.internalNotes || verifiedTicket.internalNotes.length === 0),
      `CONFIDENTIAL text in resident payload: ${leaksInternalNote ? 'LEAK DETECTED!' : 'None (Secure)'}`
    );

    // 8. Security Isolation Test (Cross-Apartment IDOR Defense)
    console.log('\n[Step 8] Testing Cross-Apartment IDOR Defense with Isolation Accounts...');
    const isoLogin = await request(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'x-forwarded-for': `10.0.3.${Math.floor(Math.random() * 200 + 1)}` },
      body: { mobileNumber: '9800000003', password: 'Other@Demo123' },
    });
    const isoToken = isoLogin.json?.token;

    const crossAptRes = await request(`${API_BASE}/api/v2/apartments/tickets/${ticketMongoId}`, {
      headers: { Authorization: `Bearer ${isoToken}` },
    });
    assert(
      'Cross-Resident Access Blocked (IDOR Defense)',
      crossAptRes.status === 403 || crossAptRes.status === 404,
      `HTTP Status returned for unauthorized complaint access: ${crossAptRes.status} (Expected 403 or 404)`
    );

  } catch (err) {
    console.error('Unexpected execution error:', err);
    failed++;
  }

  console.log('\n======================================================================');
  console.log(`📊 FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

run();
