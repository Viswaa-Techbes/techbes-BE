const http = require('http');

function api(path, method = 'GET', data = null, token = null) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : '';
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('=== TECHBES APARTMENT RESIDENT & IN-CHARGE E2E VERIFICATION ===\n');

  // Step 1: Resident Login
  console.log('Step 1: Resident Login with Mobile Number 9800000001...');
  const resLogin = await api('/api/auth/login', 'POST', {
    email: '9800000001',
    password: 'Resident@Demo123'
  });
  if (resLogin.status !== 200 || !resLogin.data?.token) {
    throw new Error('Resident Login failed: ' + JSON.stringify(resLogin));
  }
  const residentToken = resLogin.data.token;
  console.log('✅ Resident Login Successful! Token acquired.');
  console.log('Resident Role:', resLogin.data.user.role, '| ApartmentId:', resLogin.data.user.apartmentId);

  // Step 2: Verify apartment, block, and flat details
  console.log('\nStep 2: Verify Resident Profile & Flat details (GET /api/v2/apartments/residents/me)...');
  const resProfile = await api('/api/v2/apartments/residents/me', 'GET', null, residentToken);
  console.log('Profile Status:', resProfile.status);
  console.log('Apartment Name:', resProfile.data?.data?.apartment?.name);
  console.log('Block:', resProfile.data?.data?.resident?.block);
  console.log('Flat Number:', resProfile.data?.data?.resident?.flatNumber);
  console.log('Resident Type:', resProfile.data?.data?.resident?.residentType);
  if (
    resProfile.data?.data?.apartment?.name === 'TechBes Demo Residency' &&
    resProfile.data?.data?.resident?.flatNumber === 'A-101' &&
    resProfile.data?.data?.resident?.block === 'Block A'
  ) {
    console.log('✅ Step 2 Verified: Resident apartment, block, and flat match expected demo data.');
  } else {
    throw new Error('Resident profile details do not match!');
  }

  // Step 3: Register Complaint & Photo
  console.log('\nStep 3: Registering Complaint with category, title, description, and photo...');
  const testSubject = `Water leakage in bathroom pipe ${Date.now().toString().slice(-4)}`;
  const complaintPayload = {
    subject: testSubject,
    category: 'Plumbing/Water',
    priority: 'High',
    description: 'Continuous dripping observed near the flush valve joint. Water pooling on tile floor.',
    attachments: [
      'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80'
    ]
  };

  const createTicketRes = await api('/api/v2/apartments/tickets', 'POST', complaintPayload, residentToken);
  console.log('Ticket Creation Status:', createTicketRes.status);
  const ticket = createTicketRes.data?.data;
  console.log('Created Ticket ID:', ticket?.ticketId);
  console.log('Ticket MongoDB ID:', ticket?._id);
  console.log('Ticket Status:', ticket?.status);
  console.log('Flat Number:', ticket?.flatNumber);
  console.log('Apartment Name:', ticket?.apartmentName);
  console.log('Attachments Count:', ticket?.attachments?.length);
  if (createTicketRes.status === 201 && ticket?.ticketId) {
    console.log('✅ Step 3 & 4 Verified: Ticket created and stored in backend with ticket ID.');
  } else {
    throw new Error('Ticket creation failed: ' + JSON.stringify(createTicketRes));
  }

  const ticketMongoId = ticket._id;

  // Step 5: Log in as Apartment In-Charge
  console.log('\nStep 5: Logging in as Apartment In-Charge (Mobile: 9800000002)...');
  const inchargeLogin = await api('/api/auth/login', 'POST', {
    email: '9800000002',
    password: 'Incharge@Demo123'
  });
  if (inchargeLogin.status !== 200 || !inchargeLogin.data?.token) {
    throw new Error('In-Charge Login failed: ' + JSON.stringify(inchargeLogin));
  }
  const inchargeToken = inchargeLogin.data.token;
  console.log('✅ In-Charge Login Successful! Role:', inchargeLogin.data.user.role);

  // Step 6: Verify complaint appears in correct apartment queue
  console.log('\nStep 6: Fetching complaints in In-Charge queue (GET /api/v2/apartments/tickets)...');
  const inchargeTicketsRes = await api('/api/v2/apartments/tickets', 'GET', null, inchargeToken);
  console.log('Queue Status:', inchargeTicketsRes.status, 'Total Tickets in Demo Apartment:', inchargeTicketsRes.data?.data?.length);
  const foundInQueue = (inchargeTicketsRes.data?.data || []).find(t => t._id === ticketMongoId);
  if (foundInQueue) {
    console.log('✅ Step 6 Verified: Complaint found in Demo Apartment in-charge queue!');
    console.log(`Found Ticket #${foundInQueue.ticketId}: "${foundInQueue.subject}" from Flat ${foundInQueue.flatNumber}, ${foundInQueue.block}`);
  } else {
    throw new Error('Complaint NOT found in in-charge queue!');
  }

  // Step 7: In-Charge updates status and sends reply & internal note
  console.log('\nStep 7: In-Charge updating status to "In Progress"...');
  const statusUpdateRes = await api(`/api/v2/apartments/tickets/${ticketMongoId}/status`, 'PUT', {
    status: 'In Progress',
    reason: 'Technician dispatched to inspect pipe joint.'
  }, inchargeToken);
  console.log('Status Update Result:', statusUpdateRes.status, 'New Status:', statusUpdateRes.data?.data?.status);

  console.log('\nStep 7b: In-Charge posting visible reply to resident...');
  const replyRes = await api(`/api/v2/apartments/tickets/${ticketMongoId}/reply`, 'PUT', {
    text: 'Hello, our maintenance plumber has been notified and will inspect Flat A-101 at 10:30 AM today.'
  }, inchargeToken);
  console.log('Reply Result:', replyRes.status, 'Messages count:', replyRes.data?.data?.messages?.length);

  console.log('\nStep 7c: In-Charge adding private internal staff note...');
  const internalNoteRes = await api(`/api/v2/apartments/tickets/${ticketMongoId}/internal-notes`, 'POST', {
    text: 'CONFIDENTIAL STAFF NOTE: Spare coupling parts available in Basement Store Room 3.'
  }, inchargeToken);
  console.log('Internal Note Result:', internalNoteRes.status, 'Notes count:', internalNoteRes.data?.data?.length);

  // Step 8: Log back in as Resident and verify updated status & reply
  console.log('\nStep 8: Resident viewing complaint (GET /api/v2/apartments/tickets/' + ticketMongoId + ')...');
  const residentTicketView = await api(`/api/v2/apartments/tickets/${ticketMongoId}`, 'GET', null, residentToken);
  console.log('Ticket Status as seen by Resident:', residentTicketView.data?.data?.status);
  console.log('Messages count as seen by Resident:', residentTicketView.data?.data?.messages?.length);
  const latestMessage = residentTicketView.data?.data?.messages?.slice(-1)[0];
  console.log('Latest Message text:', latestMessage?.text);
  if (residentTicketView.data?.data?.status === 'In Progress' && latestMessage?.text?.includes('10:30 AM')) {
    console.log('✅ Step 8 Verified: Resident sees updated "In Progress" status and In-Charge message reply.');
  } else {
    throw new Error('Resident did not see updated status or reply!');
  }

  // Step 9: Verify residents CANNOT read private internal notes
  console.log('\nStep 9: Verifying private internal notes are hidden from Resident...');
  const leakedNotes = residentTicketView.data?.data?.internalNotes;
  console.log('Internal notes present in Resident payload:', Boolean(leakedNotes));
  if (!leakedNotes) {
    console.log('✅ Step 9 Verified: Private internal notes are strictly stripped from resident responses!');
  } else {
    throw new Error('SECURITY VIOLATION: Private internal notes leaked to resident!');
  }

  // Step 10: Verify users from another apartment CANNOT access this complaint (Cross-apartment IDOR test)
  console.log('\nStep 10: Cross-Apartment Isolation Test (User from Isolation Apartment 9800000003)...');
  const otherLogin = await api('/api/auth/login', 'POST', {
    email: '9800000003',
    password: 'Other@Demo123'
  });
  const otherToken = otherLogin.data.token;

  const crossAptRes = await api(`/api/v2/apartments/tickets/${ticketMongoId}`, 'GET', null, otherToken);
  console.log('Cross-Apartment Access Status (Expected 403):', crossAptRes.status);
  console.log('Error Message:', crossAptRes.data?.message);
  if (crossAptRes.status === 403) {
    console.log('✅ Step 10 Verified: Residents from other apartments are strictly blocked from accessing this complaint.');
  } else {
    throw new Error('SECURITY VIOLATION: Cross-apartment access control failed!');
  }

  // Step 11: Normal customer service browsing and CCTV booking still works
  console.log('\nStep 11: Verifying standard customer service browsing and CCTV catalog...');
  const catRes = await api('/api/v2/catalog/categories');
  const cctvRes = await api('/api/v2/cctv/categories');
  console.log('Catalog Categories Status:', catRes.status, 'Count:', catRes.data?.data?.length);
  console.log('CCTV Categories Status:', cctvRes.status, 'Count:', cctvRes.data?.data?.length);
  if (catRes.status === 200 && cctvRes.status === 200 && catRes.data?.data?.length > 0) {
    console.log('✅ Step 11 Verified: Service browsing and CCTV catalog remain fully functional and undisrupted.');
  } else {
    throw new Error('Standard service browsing is disrupted!');
  }

  console.log('\n🎉 ALL 11 E2E WORKFLOW VERIFICATIONS PASSED PERFECTLY! 🎉\n');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
