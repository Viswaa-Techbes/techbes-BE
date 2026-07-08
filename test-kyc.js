const mongoose = require('mongoose');
const User = require('./models/User');
const kycController = require('./controllers/v2/kycControllerV2');
const authService = require('./services/authService');
const httpMocks = require('node-mocks-http');

async function runVerification() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/techbes', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected.');

    const uniqueId = Date.now().toString().slice(-6);
    const testPhone = `99999${uniqueId}`;
    
    console.log('\n--- 1. Technician Registration ---');
    const { user: newTech, token } = await authService.registerUser({
      name: 'KYC Test Tech',
      mobileNumber: testPhone,
      password: 'password123',
      role: 'technician',
      userType: 'member',
      skills: ['CCTV', 'Networking']
    });
    
    console.log('Registered Technician:', newTech.name, '| Phone:', newTech.mobileNumber);
    console.log('Initial KYC Status:', newTech.kycStatus);
    
    console.log('\n--- 2. KYC Upload (Submit) ---');
    let req = httpMocks.createRequest({
      method: 'PUT',
      url: '/api/v2/kyc/submit',
      user: { id: newTech._id || newTech.id, role: 'technician' },
      body: {
        aadhaarNumber: '123412341234',
        aadhaarImageFront: 'http://cloudinary.com/front.jpg',
        aadhaarImageBack: 'http://cloudinary.com/back.jpg',
        panNumber: 'ABCDE1234F',
        panImage: 'http://cloudinary.com/pan.jpg',
        bankDetails: {
          accountName: 'KYC Test',
          accountNumber: '000011112222',
          ifscCode: 'HDFC0001234',
          bankName: 'HDFC'
        },
        signatureImage: 'http://cloudinary.com/sig.jpg',
        bankProofUrl: 'http://cloudinary.com/bankproof.jpg',
        selfieUrl: 'http://cloudinary.com/selfie.jpg',
        skills: ['CCTV', 'Networking', 'Intercom']
      }
    });
    let res = httpMocks.createResponse();
    await kycController.submitKyc(req, res);
    let responseData = JSON.parse(res._getData());
    console.log('Submit KYC Response:', responseData.success ? 'Success' : 'Failed');
    if (responseData.success) {
      console.log('New KYC Status:', responseData.data.kycStatus);
      console.log('Bank Name Captured:', responseData.data.kycDetails.bankDetails.bankName);
    }
    
    console.log('\n--- 3. Admin Panel (Pending List) ---');
    req = httpMocks.createRequest({
      method: 'GET',
      url: '/api/v2/kyc/admin/pending',
      user: { id: 'admin123', role: 'admin' }
    });
    res = httpMocks.createResponse();
    await kycController.getPendingKyc(req, res);
    responseData = JSON.parse(res._getData());
    console.log('Pending List Count:', responseData.count);
    const found = responseData.data.find(t => t.mobileNumber === testPhone);
    console.log('Is our test tech in pending list?', !!found);

    console.log('\n--- 3b. Admin Panel (Reject) ---');
    req = httpMocks.createRequest({
      method: 'PUT',
      url: `/api/v2/kyc/admin/${newTech._id || newTech.id}/reject`,
      user: { id: 'admin123', role: 'admin' },
      body: { reason: 'Blurry PAN card' }
    });
    res = httpMocks.createResponse();
    await kycController.rejectKyc(req, res);
    responseData = JSON.parse(res._getData());
    console.log('Reject KYC Response:', responseData.success ? 'Success' : 'Failed');
    console.log('KYC Status after reject:', responseData.data.kycStatus);
    console.log('Rejection Reason:', responseData.data.kycRejectionReason);

    console.log('\n--- 3c. KYC Re-Upload (Submit) ---');
    req = httpMocks.createRequest({
      method: 'PUT',
      url: '/api/v2/kyc/submit',
      user: { id: newTech._id || newTech.id, role: 'technician' },
      body: {
        panImage: 'http://cloudinary.com/pan-clear.jpg',
      }
    });
    res = httpMocks.createResponse();
    await kycController.submitKyc(req, res);
    responseData = JSON.parse(res._getData());
    console.log('Re-Submit KYC Response:', responseData.success ? 'Success' : 'Failed');
    console.log('New KYC Status:', responseData.data.kycStatus);
    
    console.log('\n--- 3d. Admin Panel (Approve) ---');
    req = httpMocks.createRequest({
      method: 'PUT',
      url: `/api/v2/kyc/admin/${newTech._id || newTech.id}/approve`,
      user: { id: 'admin123', role: 'admin' }
    });
    res = httpMocks.createResponse();
    await kycController.approveKyc(req, res);
    responseData = JSON.parse(res._getData());
    console.log('Approve KYC Response:', responseData.success ? 'Success' : 'Failed');
    console.log('Final KYC Status:', responseData.data.kycStatus);
    console.log('Final Employee Status:', responseData.data.employeeStatus);

    console.log('\n--- 4. Login Flow ---');
    // For login block logic, if we need to block login, we would test it here.
    // Right now, let's just make sure they can login.
    const loginRes = await authService.loginUser(testPhone, 'password123');
    console.log('Login successful for approved tech:', !!loginRes.token);

    console.log('\nVerification Complete.');
    process.exit(0);
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
}

runVerification();
