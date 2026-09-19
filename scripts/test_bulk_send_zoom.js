require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { bulkSendZoomLink } = require('../controllers/v2/cctvCourseControllerV2');
const Registration = require('../models/Registration');

async function runE2ETest() {
  console.log('=== CCTV Masterclass Zoom Dispatch E2E Verification ===\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas.');

  // Find the target student: SparkNexz
  const student = await Registration.findOne({ email: /sparkne/i });
  if (!student) {
    console.error('Target student sparknexz/sparknezx not found in database!');
    process.exit(1);
  }

  console.log(`Found target student: ${student.name} (${student.email}), ID: ${student._id}`);
  console.log(`Initial Status: zoomLinkEmailStatus=${student.zoomLinkEmailStatus}, zoomLinkEmailError=${student.zoomLinkEmailError || 'none'}`);

  // Test 1: Invalid URL rejection
  console.log('\n--- Test 1: Malformed URL Validation ---');
  let invalidHandled = false;
  const mockReqInvalid = {
    body: {
      registrationIds: [student._id.toString()],
      zoomLink: 'not-a-valid-url',
    },
    user: { id: 'admin_test', email: 'admin@techbes.co.in', role: 'admin' },
  };
  const mockResInvalid = {
    status: (code) => ({
      json: (data) => {
        console.log(`HTTP ${code}: ${data.message}`);
        invalidHandled = code === 400;
      }
    }),
    json: (data) => console.log('Response:', data),
  };
  await bulkSendZoomLink(mockReqInvalid, mockResInvalid, (err) => console.error(err));
  console.log(invalidHandled ? '✓ Correctly rejected malformed URL' : '✗ Failed to reject malformed URL');

  // Test 2: Valid Live Dispatch to SparkNexz
  console.log('\n--- Test 2: Live Dispatch to SparkNexz (sparknezx@gmail.com) ---');
  const mockReqValid = {
    body: {
      registrationIds: [student._id.toString()],
      zoomLink: 'https://zoom.us/j/98765432101',
      classTitle: 'TechBes CCTV Masterclass Live',
      classDate: 'Sunday, 20 Sep 2026',
      classTime: '10:00 AM - 04:00 PM IST',
      message: 'Please join 5 minutes early to test audio & video.',
    },
    user: { id: 'admin_test', email: 'admin@techbes.co.in', role: 'admin' },
  };

  let dispatchResult = null;
  const mockResValid = {
    status: (code) => ({
      json: (data) => {
        console.log(`HTTP ${code}:`, data);
        dispatchResult = data;
      }
    }),
    json: (data) => {
      console.log('HTTP 200 Response:');
      console.log(JSON.stringify(data, null, 2));
      dispatchResult = data;
    },
  };

  await bulkSendZoomLink(mockReqValid, mockResValid, (err) => console.error('Next err:', err));

  // Test 3: Check updated MongoDB record
  console.log('\n--- Test 3: Verify Database Record Updated ---');
  const updatedStudent = await Registration.findById(student._id).lean();
  console.log(`zoomLinkSent: ${updatedStudent.zoomLinkSent}`);
  console.log(`zoomLinkEmailStatus: ${updatedStudent.zoomLinkEmailStatus}`);
  console.log(`zoomLinkEmailError: '${updatedStudent.zoomLinkEmailError}'`);
  console.log(`classLinkSendStatus: ${updatedStudent.classLinkSendStatus}`);
  console.log(`zoomMeetingLink: ${updatedStudent.zoomMeetingLink}`);
  console.log(`zoomLinkSentAt: ${updatedStudent.zoomLinkSentAt}`);

  const passed = dispatchResult &&
    dispatchResult.sent === 1 &&
    dispatchResult.failed === 0 &&
    updatedStudent.zoomLinkEmailStatus === 'SENT' &&
    updatedStudent.classLinkSendStatus === 'SENT';

  console.log('\n========================================');
  console.log(passed ? '🎉 ALL TESTS PASSED! EMAIL DELIVERED SUCCESSFULLY!' : '❌ SOME TESTS FAILED');
  console.log('========================================');

  await mongoose.disconnect();
  process.exit(passed ? 0 : 1);
}

runE2ETest().catch((err) => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
