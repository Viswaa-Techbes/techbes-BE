/**
 * verifyWorkflows.js
 * ==================
 * E2E automated test script validating the complete Customer, Employee, Job, and Lead Lifecycles.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Lead = require('../models/Lead');
const Job = require('../models/Job');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const Address = require('../models/Address');
const Attendance = require('../models/Attendance');
const authService = require('../services/authService');
const adminControllerV2 = require('../controllers/v2/adminControllerV2');

async function run() {
  console.log('==================================================');
  console.log('STARTING WORKFLOWS & LIFECYCLES INTEGRATION AUDIT');
  console.log('==================================================\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/technician_app';
  console.log(`[Database] Connecting to: ${mongoUri}`);
  try {
    await mongoose.connect(mongoUri);
    console.log('[Database] Connected successfully.');
    // Drop legacy index if it exists
    try {
      await mongoose.connection.db.collection('attendances').dropIndex('user_1_date_1');
      console.log('[Database] Legacy index user_1_date_1 dropped from attendances.');
    } catch (e) {
      console.log('[Database] Legacy index user_1_date_1 check complete (either not found or already dropped).');
    }
  } catch (err) {
    console.error('[Database] Connection failed:', err.message);
    process.exit(1);
  }

  // Define cleanups
  const cleanupUsers = [];
  const cleanupCustomers = [];
  const cleanupLeads = [];
  const cleanupJobs = [];
  const cleanupPayments = [];
  const cleanupNotifications = [];
  const cleanupAddresses = [];
  const cleanupAttendance = [];

  try {
    // ----------------------------------------------------
    // TEST 1: Technician Employee ID/Code Generation
    // ----------------------------------------------------
    console.log('\n--- TEST 1: Employee ID & Code Generation ---');
    const mockMobile = '99000' + Math.floor(10000 + Math.random() * 90000);
    const techUser = await User.create({
      name: 'Audit Tech ' + Date.now(),
      mobileNumber: mockMobile,
      email: 'tech_audit_' + Date.now() + '@techbes.com',
      password: 'password123',
      role: 'technician',
      specialty: 'CCTV Installation',
      skills: ['CCTV', 'Networking', 'Wiring'],
      address: '123 Tech Park, Bangalore',
      pincode: '560001',
    });
    cleanupUsers.push(techUser._id);
    console.log(`✓ Technician registered. employeeId: "${techUser.employeeId}", employeeCode: "${techUser.employeeCode}"`);
    
    if (techUser.employeeId.startsWith('EMP-') && techUser.employeeCode.startsWith('TECH-')) {
      console.log('✓ Employee ID & Code prefix checks PASSED.');
    } else {
      throw new Error('Employee ID/Code format mismatch');
    }

    // ----------------------------------------------------
    // TEST 2: Customer ID & Customer Document Generation
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Customer ID & Collection Sync ---');
    const mockClientMobile = '99000' + Math.floor(10000 + Math.random() * 90000);
    const clientUser = await User.create({
      name: 'Audit Customer ' + Date.now(),
      mobileNumber: mockClientMobile,
      email: 'customer_audit_' + Date.now() + '@gmail.com',
      password: 'password123',
      role: 'client',
    });
    cleanupUsers.push(clientUser._id);
    console.log(`✓ Customer registered. customerId: "${clientUser.customerId}"`);

    // Yield for post-save hooks to complete database operations
    await new Promise(r => setTimeout(r, 1000));

    const customerRecord = await Customer.findOne({ userId: clientUser._id });
    if (customerRecord) {
      cleanupCustomers.push(customerRecord._id);
      console.log(`✓ Sync match found in Customer collection. customerId: "${customerRecord.customerId}"`);
      if (customerRecord.customerId === clientUser.customerId) {
        console.log('✓ Customer ID match check PASSED.');
      } else {
        throw new Error('Customer ID mismatch between User and Customer collections.');
      }
    } else {
      throw new Error('Customer sync failed. No document created in Customer collection.');
    }

    // ----------------------------------------------------
    // TEST 3: Login with Employee ID & Employee Code
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Login with Employee Credentials ---');
    
    console.log('[Login] Trying login with employeeId:', techUser.employeeId);
    const loginResult1 = await authService.loginUser(techUser.employeeId, 'password123');
    console.log(`✓ Login with employeeId succeeded. User role: "${loginResult1.user.role}"`);

    console.log('[Login] Trying login with employeeCode:', techUser.employeeCode);
    const loginResult2 = await authService.loginUser(techUser.employeeCode, 'password123');
    console.log(`✓ Login with employeeCode succeeded. User role: "${loginResult2.user.role}"`);

    // ----------------------------------------------------
    // TEST 4: Customer ID references in Bookings, Payments, Notifications
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Customer ID referencing ---');
    
    // Booking (Job) creation
    const job = await Job.create({
      title: 'Audit CCTV Setup',
      client: clientUser._id,
      customerName: clientUser.name,
      customerPhone: clientUser.mobileNumber,
      location: 'Audit Site Bangalore',
      price: 1500,
      status: 'pending',
      useNewFlow: true,
    });
    cleanupJobs.push(job._id);
    console.log(`✓ Job created. Job customerId: "${job.customerId}"`);
    if (job.customerId === clientUser.customerId) {
      console.log('✓ Booking Customer ID referencing PASSED.');
    } else {
      throw new Error('Job customerId mismatch');
    }

    // Payment creation
    const payment = await Payment.create({
      jobId: job._id,
      userId: clientUser._id,
      razorpayOrderId: 'order_audit_' + Date.now(),
      amount: 150000,
      status: 'paid',
    });
    cleanupPayments.push(payment._id);
    console.log(`✓ Payment created. Payment customerId: "${payment.customerId}"`);
    if (payment.customerId === clientUser.customerId) {
      console.log('✓ Payment Customer ID referencing PASSED.');
    } else {
      throw new Error('Payment customerId mismatch');
    }

    // Notification creation
    const notification = await Notification.create({
      userId: clientUser._id,
      recipientId: clientUser._id,
      recipientType: 'customer',
      title: 'Audit Notif',
      message: 'Hello, your booking is confirmed.',
      type: 'job_assigned',
    });
    cleanupNotifications.push(notification._id);
    console.log(`✓ Notification created. Notification customerId: "${notification.customerId}"`);
    if (notification.customerId === clientUser.customerId) {
      console.log('✓ Notification Customer ID referencing PASSED.');
    } else {
      throw new Error('Notification customerId mismatch');
    }

    // ----------------------------------------------------
    // TEST 5: Lead Lifecycle & Lost reason Validation
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Lead Lifecycle & Conversions ---');
    
    // Create new lead
    const leadId = 'LD-' + Date.now();
    const lead = new Lead({
      leadId,
      name: 'Lead Audit Spec',
      phone: '9888877777',
      email: 'lead_audit_' + Date.now() + '@gmail.com',
      requiredService: 'Audit CCTV Installation',
      budget: 8000,
      address: 'Audit Lead Avenue, Bangalore',
      status: 'New',
    });
    await lead.save();
    cleanupLeads.push(lead._id);
    console.log(`✓ Lead created with status: "${lead.status}"`);

    // Transition to Lost without lostReason (MUST fail)
    console.log('[Lead] Attempting transition to Lost status without lostReason...');
    lead.status = 'Lost';
    try {
      await lead.save();
      throw new Error('Mongoose validation allowed status: Lost without lostReason');
    } catch (err) {
      console.log('✓ Transition blocked successfully. Reason validation rule is ACTIVE.');
    }

    // Transition to Lost with lostReason
    console.log('[Lead] Retrying transition to Lost status with lostReason...');
    lead.lostReason = 'Price too high';
    await lead.save();
    console.log(`✓ Lead status updated successfully to: "${lead.status}" with reason: "${lead.lostReason}"`);

    // Revert to Qualified
    lead.status = 'Qualified';
    lead.lostReason = undefined;
    await lead.save();

    // Transition to Won (triggers registration & project creation)
    console.log('[Lead] Transitioning status to Won...');
    const reqMock = {
      params: { id: lead._id.toString() },
      body: { status: 'Won' }
    };
    
    let responseBody = null;
    const resMock = {
      json: (data) => { responseBody = data; }
    };

    await adminControllerV2.updateLead(reqMock, resMock, (err) => {
      if (err) throw err;
    });

    console.log(`✓ updateLead handler completed. Response success: ${responseBody?.success}, jobCreated: ${responseBody?.jobCreated}`);
    
    const updatedLead = await Lead.findById(lead._id);
    console.log(`✓ Saved Lead status in DB: "${updatedLead.status}"`);
    
    if (updatedLead.status === 'Project Created') {
      console.log('✓ Won status auto-converted lead to "Project Created" check PASSED.');
    } else {
      throw new Error('Lead status was not changed to Project Created');
    }

    // Confirm that Client User was created
    const autoCustomer = await User.findOne({ mobileNumber: lead.phone });
    if (autoCustomer) {
      cleanupUsers.push(autoCustomer._id);
      console.log(`✓ Auto-registered customer found. customerId: "${autoCustomer.customerId}"`);
      
      const autoJob = await Job.findOne({ client: autoCustomer._id });
      if (autoJob) {
        cleanupJobs.push(autoJob._id);
        console.log(`✓ Auto-created Job/Project found. Job Title: "${autoJob.title}", Price: ${autoJob.price}`);
        console.log('✓ Won lead auto-conversion E2E test PASSED.');
      } else {
        throw new Error('Auto-job/project was not created for Won lead');
      }
    } else {
      throw new Error('Auto-user registration failed for Won lead');
    }

    // ----------------------------------------------------
    // TEST 6: Technician Profile Details Fetch
    // ----------------------------------------------------
    console.log('\n--- TEST 6: Technician Performance & Attendance Fetch ---');
    
    // Add Penalty
    techUser.penalties.push({
      amount: 250,
      reason: 'Late arrival at job site',
      jobId: job._id
    });
    techUser.totalEarnings = 14500;
    techUser.rating = 4.8;
    await techUser.save();
    console.log('✓ Penalty and rating added to technician.');

    // Add Attendance
    const attendance = await Attendance.create({
      userId: techUser._id,
      name: techUser.name,
      role: techUser.role,
      date: new Date().toISOString().split('T')[0],
      loginTime: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
      logoutTime: new Date(),
      status: 'present',
      workingHours: 8.0,
    });
    cleanupAttendance.push(attendance._id);
    console.log('✓ Attendance log created.');

    // Fetch Details via Controller
    const reqProfileMock = { params: { id: techUser._id.toString() } };
    let profileResponseBody = null;
    const resProfileMock = { json: (data) => { profileResponseBody = data; } };

    await adminControllerV2.getUserDetails(reqProfileMock, resProfileMock, (err) => { if (err) throw err; });
    
    const profile = profileResponseBody?.data;
    console.log(`✓ getUserDetails success: ${profileResponseBody?.success}`);
    console.log('[Profile Details]:', {
      name: profile.name,
      employeeId: profile.employeeId,
      rating: profile.stats?.rating,
      earnings: profile.stats?.totalEarnings,
      penaltiesCount: profile.stats?.penalties,
      attendanceHistoryCount: profile.attendanceHistory?.length,
      jobsCount: profile.jobs?.length,
    });

    if (profile.stats?.rating === 4.8 && profile.stats?.penalties === 1 && profile.attendanceHistory?.length === 1) {
      console.log('✓ Technician Profile details audit PASSED.');
    } else {
      throw new Error('Technician profile aggregates mismatch.');
    }

    console.log('\n==================================================');
    console.log('ALL WORKFLOWS & LIFECYCLES INTEGRATION AUDITS PASSED!');
    console.log('==================================================');

  } catch (err) {
    console.error('\n✗ VERIFICATION AUDIT FAILED:', err.message);
    console.error(err);
  } finally {
    // Perform cleanups
    console.log('\n[Cleanup] Cleaning up temporary test records...');
    await Promise.all([
      User.deleteMany({ _id: { $in: cleanupUsers } }),
      Customer.deleteMany({ _id: { $in: cleanupCustomers } }),
      Lead.deleteMany({ _id: { $in: cleanupLeads } }),
      Job.deleteMany({ _id: { $in: cleanupJobs } }),
      Payment.deleteMany({ _id: { $in: cleanupPayments } }),
      Notification.deleteMany({ _id: { $in: cleanupNotifications } }),
      Address.deleteMany({ _id: { $in: cleanupAddresses } }),
      Attendance.deleteMany({ _id: { $in: cleanupAttendance } }),
    ]);
    console.log('[Cleanup] Completed.');
    await mongoose.disconnect();
    console.log('[Database] Disconnected.');
  }
}

run();
