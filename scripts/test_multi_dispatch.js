require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { bulkSendZoomLink } = require('../controllers/v2/cctvCourseControllerV2');
const Registration = require('../models/Registration');

async function testMultiStudentDispatch() {
  console.log('=== Multi-Student Dispatch & Error Handling Test ===\n');
  await mongoose.connect(process.env.MONGODB_URI);

  // Fetch up to 2 real registrations
  const realStudents = await Registration.find({}).limit(2);
  console.log(`Found ${realStudents.length} real students:`, realStudents.map(s => `${s.name} (${s.email})`));

  // Temporarily create a mock registration without an email to test failure isolation
  const mockFailedStudent = new Registration({
    masterclassId: realStudents[0].masterclassId,
    name: 'Invalid Email Student',
    mobile: '9999999999',
    email: '',
    location: 'Test Location',
    qualification: 'None',
  });
  // Save with validation bypassed or handle
  mockFailedStudent.email = 'notanemail';
  await mockFailedStudent.save();

  const allIds = [...realStudents.map(s => s._id.toString()), mockFailedStudent._id.toString()];
  console.log(`Dispatching to ${allIds.length} students (2 real + 1 invalid)...`);

  const mockReq = {
    body: {
      registrationIds: allIds,
      zoomLink: 'https://zoom.us/j/1122334455',
      classTitle: 'TechBes CCTV Masterclass Multi-Batch',
      classDate: 'Sunday, 20 Sep 2026',
      classTime: '10:00 AM IST',
      message: 'Batch verification test',
    },
    user: { id: null, email: 'admin@techbes.co.in', role: 'admin' },
  };

  let resData = null;
  const mockRes = {
    status: (code) => ({ json: (d) => { resData = d; } }),
    json: (d) => { resData = d; },
  };

  await bulkSendZoomLink(mockReq, mockRes, (err) => console.error(err));

  console.log('\nResponse Summary:');
  console.log(`Total: ${resData.total}`);
  console.log(`Sent: ${resData.sent}`);
  console.log(`Failed: ${resData.failed}`);
  console.log('Results breakdown:');
  resData.results.forEach(r => console.log(`  - ${r.name} (${r.email}): ${r.status}${r.error ? ` [Reason: ${r.error}]` : ''}`));

  // Clean up mock student
  await Registration.deleteOne({ _id: mockFailedStudent._id });

  const passed = resData.sent === realStudents.length && resData.failed === 1;
  console.log('\n========================================');
  console.log(passed ? '🎉 MULTI-STUDENT DISPATCH VERIFIED!' : '❌ MULTI-STUDENT TEST FAILED');
  console.log('========================================');

  await mongoose.disconnect();
  process.exit(passed ? 0 : 1);
}

testMultiStudentDispatch().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
