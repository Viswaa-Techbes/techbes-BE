require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getTransporter, sendZoomClassEmail } = require('../services/emailService');

async function test() {
  console.log('--- Testing SMTP Configuration ---');
  console.log('SMTP_HOST:', process.env.SMTP_HOST);
  console.log('SMTP_PORT:', process.env.SMTP_PORT);
  console.log('SMTP_USER:', process.env.SMTP_USER);
  console.log('SMTP_PASS length:', process.env.SMTP_PASS ? process.env.SMTP_PASS.length : 0);
  console.log('SMTP_SECURE:', process.env.SMTP_SECURE);

  try {
    const transporter = getTransporter();
    console.log('Verifying transporter connection...');
    await transporter.verify();
    console.log('✓ Transporter verified successfully!');
  } catch (err) {
    console.error('✗ Transporter verification failed:', err);
    process.exit(1);
  }

  try {
    console.log('Testing sendZoomClassEmail to sparknezx@gmail.com...');
    const result = await sendZoomClassEmail({
      to: 'sparknezx@gmail.com',
      name: 'SparkNezx',
      courseName: 'TechBes CCTV Masterclass',
      classDate: 'Sunday, 20 Sep 2026',
      classTime: '10:00 AM IST',
      zoomLink: 'https://zoom.us/j/1234567890',
      message: 'Looking forward to seeing you in class!',
    });
    console.log('✓ sendZoomClassEmail result:', result);
    process.exit(0);
  } catch (err) {
    console.error('✗ sendZoomClassEmail failed:', err);
    process.exit(1);
  }
}

test();
