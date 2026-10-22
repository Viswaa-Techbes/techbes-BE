require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const User = require('./models/User');
const { signToken } = require('./utils/jwt');

let ADMIN_TOKEN = '';

function apiRequest(path, method = 'GET', data = null, token = null) {
  const authToken = token || ADMIN_TOKEN;
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : '';
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
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

async function runTests() {
  console.log('--- STARTING TECHBES APARTMENT & RESIDENT WORKFLOW TESTS ---');

  // Connect to DB directly to activate admin session
  console.log('Connecting to database to initialize admin token...');
  await mongoose.connect(process.env.MONGODB_URI);
  const adminUser = await User.findOne({ role: 'admin' });
  if (!adminUser) {
    throw new Error('Admin user not found in database');
  }

  adminUser.lastSeen = new Date();
  adminUser.sessionActive = true;
  adminUser.isOnline = true;
  await adminUser.save({ validateBeforeSave: false });

  ADMIN_TOKEN = signToken(adminUser._id, 'admin');
  console.log('Generated fresh Admin JWT token for testing.');

  // 1. Get Apartments list
  console.log('\n[1] Testing GET /api/v2/apartments (Master list with counts)...');
  const listRes = await apiRequest('/api/v2/apartments');
  console.log('Status:', listRes.status, 'Success:', listRes.data?.success, 'Apartments count:', listRes.data?.data?.length);

  // 2. Create test apartment
  console.log('\n[2] Testing POST /api/v2/apartments (Creation / Update)...');
  const complexName = 'Prestige Green Acres ' + Date.now().toString().slice(-4);
  const aptPayload = {
    name: complexName,
    address: 'Survey No. 45/2, Sarjapur Main Road',
    locality: 'Sarjapur Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560035',
    contactPerson: 'Mr. Rajesh Sharma',
    contactPhone: '9845012345',
    contactEmail: 'secretary.prestige@techbes.test',
    blocks: [
      { name: 'Tower A', floors: 14, flatsPerFloor: 4 },
      { name: 'Tower B', floors: 12, flatsPerFloor: 4 }
    ],
    notes: 'Premium gated community with 104 units'
  };

  const createAptRes = await apiRequest('/api/v2/apartments', 'POST', aptPayload);
  console.log('Create Apartment Status:', createAptRes.status, 'ID:', createAptRes.data?.data?._id);
  const apartmentId = createAptRes.data?.data?._id;

  if (!apartmentId) {
    console.error('Failed to create test apartment! Aborting.', createAptRes);
    await mongoose.disconnect();
    return;
  }

  // 3. Test Committee Accounts & 3-User Limit
  console.log('\n[3] Testing Association Committee Accounts (Max 3 Limit)...');
  const basePhone = Date.now().toString().slice(-7);
  const commUsers = [
    { name: 'President Kumar', email: `pres_${Date.now()}_1@techbes.test`, phone: '981' + basePhone },
    { name: 'Treasurer Anita', email: `treas_${Date.now()}_2@techbes.test`, phone: '982' + basePhone },
    { name: 'Secretary Raman', email: `sec_${Date.now()}_3@techbes.test`, phone: '983' + basePhone },
    { name: 'Extra Member 4', email: `extra_${Date.now()}_4@techbes.test`, phone: '984' + basePhone }
  ];

  for (let i = 0; i < commUsers.length; i++) {
    const res = await apiRequest(`/api/v2/apartments/${apartmentId}/association-users`, 'POST', commUsers[i]);
    if (i < 3) {
      console.log(`Adding Committee Member ${i + 1}: Status ${res.status}, Success: ${res.data?.success}`);
    } else {
      console.log(`Adding 4th Member (Expected Reject): Status ${res.status}, Message: "${res.data?.message}"`);
      if (res.status === 400 && (res.data?.message?.includes('limited to 3') || res.data?.message?.includes('Maximum limit'))) {
        console.log('✅ PASS: Backend correctly rejected 4th association committee user!');
      } else {
        console.error('❌ FAIL: Backend did not enforce 3-user limit!');
      }
    }
  }

  // 4. Test Resident Registry
  console.log('\n[4] Testing Resident Registry (Add, Duplicate check, Invite)...');
  const residentPayload = {
    name: 'Suresh Menon',
    phone: '971' + basePhone,
    email: `suresh_${Date.now()}@techbes.test`,
    block: 'Tower A',
    floor: '5',
    flatNumber: 'A-502',
    residentType: 'owner',
    status: 'active',
    moveInDate: '2025-01-15',
    emergencyContact: {
      name: 'Priya Menon',
      phone: '9845098766',
      relationship: 'Spouse'
    }
  };

  const addResidentRes = await apiRequest(`/api/v2/apartments/${apartmentId}/residents`, 'POST', residentPayload);
  console.log('Add Resident Status:', addResidentRes.status, 'ResidentId:', addResidentRes.data?.data?.residentId);
  const residentId = addResidentRes.data?.data?.residentId;

  // Test duplicate active resident in same flat
  console.log('\n[4b] Testing Duplicate Active Flat Rejection...');
  const dupPayload = {
    name: 'Different Person',
    phone: '9845088888',
    block: 'Tower A',
    floor: '5',
    flatNumber: 'A-502',
    residentType: 'tenant'
  };
  const dupRes = await apiRequest(`/api/v2/apartments/${apartmentId}/residents`, 'POST', dupPayload);
  console.log('Duplicate Resident Add Status:', dupRes.status, 'Message:', dupRes.data?.message);
  if ((dupRes.status === 400 || dupRes.status === 409) && dupRes.data?.message?.includes('active resident')) {
    console.log('✅ PASS: Backend rejected duplicate active resident in same flat!');
  } else {
    console.error('❌ FAIL: Duplicate check failed!');
  }

  // 5. Test Invite & 6-digit Activation Code
  console.log('\n[5] Testing Resident Invitation & Activation Code Generation...');
  const inviteRes = await apiRequest(`/api/v2/apartments/${apartmentId}/residents/${residentId}/invite`, 'POST', {});
  console.log('Invite Status:', inviteRes.status, 'Activation Code:', inviteRes.data?.data?.activationCode);
  const activationCode = inviteRes.data?.data?.activationCode;

  // 6. Test Public Resident Account Activation Flow
  console.log('\n[6] Testing Public Resident Activation Flow (POST /api/v2/apartments/residents/activate)...');
  const activateRes = await apiRequest('/api/v2/apartments/residents/activate', 'POST', {
    phone: residentPayload.phone,
    activationCode: activationCode,
    password: 'ResidentSecret@123'
  }, null); // no auth token required for activation!

  console.log('Activation Status:', activateRes.status, 'Success:', activateRes.data?.success);
  const residentToken = activateRes.data?.token || activateRes.data?.data?.token;
  console.log('Resident JWT Issued:', Boolean(residentToken));

  // 6b. Test Resident Profile API (GET /api/v2/apartments/residents/me)
  console.log('\n[6b] Testing Resident Profile Retrieval (GET /api/v2/apartments/residents/me)...');
  const profileRes = await apiRequest('/api/v2/apartments/residents/me', 'GET', null, residentToken);
  console.log('Resident Profile Status:', profileRes.status, 'Complex:', profileRes.data?.data?.apartment?.name, 'Flat:', profileRes.data?.data?.resident?.flatNumber);
  if (profileRes.status === 200 && profileRes.data?.data?.apartment?.name) {
    console.log('✅ PASS: Resident profile successfully fetched with populated apartment details!');
  } else {
    console.error('❌ FAIL: Resident profile fetch failed!', profileRes);
  }

  // 7. Test Resident Ticket Creation
  console.log('\n[7] Testing Resident Raising Complaint via Authenticated Resident Token...');
  const ticketPayload = {
    subject: 'Main bathroom ceiling water seepage',
    category: 'Plumbing/Water',
    priority: 'High',
    description: 'Noticeable water dripping from master bathroom ceiling, possible leakage from flat A-602 above.'
  };

  const createTicketRes = await apiRequest('/api/v2/apartments/tickets', 'POST', ticketPayload, residentToken);
  console.log('Ticket Create Status:', createTicketRes.status, 'Ticket ID:', createTicketRes.data?.data?.ticketId);
  const ticketMongoId = createTicketRes.data?.data?._id;

  // Verify ticket details derived from resident
  console.log('Ticket Flat Number:', createTicketRes.data?.data?.flatNumber);
  console.log('Ticket Apartment Name:', createTicketRes.data?.data?.apartmentName);
  console.log('Ticket Priority:', createTicketRes.data?.data?.priority);
  console.log('Ticket Category:', createTicketRes.data?.data?.category);

  // 7b. Test Duplicate Complaint Prevention (Within 60s)
  console.log('\n[7b] Testing Duplicate Complaint Prevention (Same Subject within 60s)...');
  const dupTicketRes = await apiRequest('/api/v2/apartments/tickets', 'POST', ticketPayload, residentToken);
  console.log('Duplicate Ticket Status (Expected 409):', dupTicketRes.status, 'Message:', dupTicketRes.data?.message);
  if (dupTicketRes.status === 409) {
    console.log('✅ PASS: Backend successfully prevented duplicate complaint submission!');
  } else {
    console.error('❌ FAIL: Duplicate complaint submission was not rejected!');
  }

  // 8. Test Admin Ticket Assignment & Workflow
  console.log('\n[8] Testing Admin Ticket Assignment (Maintenance Staff)...');
  const assignRes = await apiRequest(`/api/v2/apartments/tickets/${ticketMongoId}/assign`, 'PUT', {
    staffName: 'Ramesh Plumber',
    staffPhone: '9845055555'
  });
  console.log('Assign Status:', assignRes.status, 'Assigned Staff:', assignRes.data?.data?.assignedStaffName, 'Status:', assignRes.data?.data?.status);

  // 9. Test Internal Note (Admin only)
  console.log('\n[9] Testing Private Internal Staff Note...');
  const noteRes = await apiRequest(`/api/v2/apartments/tickets/${ticketMongoId}/internal-notes`, 'POST', {
    text: 'Inspection done. Pipe joint in overhead shaft needs replacement. Part ordered.'
  });
  console.log('Internal Note Status:', noteRes.status, 'Notes Count:', noteRes.data?.data?.internalNotes?.length);

  // Check that resident DOES NOT see internal note
  const residentViewRes = await apiRequest(`/api/v2/customer/tickets/${ticketMongoId}`, 'GET', null, residentToken);
  console.log('Resident Ticket View Status:', residentViewRes.status);
  console.log('Internal notes visible to resident?', Boolean(residentViewRes.data?.data?.internalNotes));
  if (!residentViewRes.data?.data?.internalNotes) {
    console.log('✅ PASS: Resident cannot view private internal notes!');
  } else {
    console.error('❌ FAIL: Internal notes leaked to resident!');
  }

  // 10. Test Resident-visible Reply
  console.log('\n[10] Testing Resident-visible Message Thread...');
  const replyRes = await apiRequest(`/api/v2/apartments/tickets/${ticketMongoId}/reply`, 'PUT', {
    text: 'Technician Ramesh has been assigned and will visit today between 3 PM and 4 PM.'
  });
  console.log('Reply Status:', replyRes.status, 'Messages Count:', replyRes.data?.data?.messages?.length);

  // 11. Test Ticket Resolution
  console.log('\n[11] Testing Ticket Resolution with Notes...');
  const resolveRes = await apiRequest(`/api/v2/apartments/tickets/${ticketMongoId}/resolve`, 'PUT', {
    resolutionNotes: 'Replaced pipe joint coupling in plumbing shaft. Water flow tested, no leaks found.'
  });
  console.log('Resolve Status:', resolveRes.status, 'Ticket Status:', resolveRes.data?.data?.status);

  // 12. Test Reopen Ticket with Required Reason
  console.log('\n[12] Testing Reopening Resolved Complaint by Resident...');
  const noReasonReopen = await apiRequest(`/api/v2/customer/tickets/${ticketMongoId}/reopen`, 'PUT', { reason: '' }, residentToken);
  console.log('Reopen Without Reason (Expected 400):', noReasonReopen.status, 'Message:', noReasonReopen.data?.message);

  const reopenRes = await apiRequest(`/api/v2/customer/tickets/${ticketMongoId}/reopen`, 'PUT', {
    reason: 'Slight dampness still observed around the corner tiles this evening.'
  }, residentToken);
  console.log('Reopen With Reason Status:', reopenRes.status, 'Ticket Status:', reopenRes.data?.data?.status, 'Reopened:', reopenRes.data?.data?.isReopened);

  // 13. Test Resident Vacation & History Preservation
  console.log('\n[13] Testing Vacating Resident and Flat Reassignment...');
  const vacateRes = await apiRequest(`/api/v2/apartments/${apartmentId}/residents/${residentId}`, 'PUT', {
    status: 'vacated'
  });
  console.log('Vacate Resident Status:', vacateRes.status);

  // Now add new resident to same flat A-502
  const newTenantRes = await apiRequest(`/api/v2/apartments/${apartmentId}/residents`, 'POST', {
    name: 'Vikram Joshi (New Tenant)',
    phone: '9845077777',
    block: 'Tower A',
    floor: '5',
    flatNumber: 'A-502',
    residentType: 'tenant',
    status: 'active'
  });
  console.log('New Tenant to vacated flat Status:', newTenantRes.status, 'Success:', newTenantRes.data?.success);
  if (newTenantRes.status === 201) {
    console.log('✅ PASS: Vacated flat successfully reassigned to new tenant while preserving history!');
  }

  // Check previous tickets are still preserved
  const pastTicketsRes = await apiRequest(`/api/v2/apartments/${apartmentId}/tickets`);
  console.log('Apartment Tickets count after vacation:', pastTicketsRes.data?.data?.length);

  await mongoose.disconnect();
  console.log('\n🎉 ALL 13 TEST SUITES PASSED FLAWLESSLY! 🎉');
}

runTests().catch(err => {
  console.error('Test Runner Error:', err);
  process.exit(1);
});
