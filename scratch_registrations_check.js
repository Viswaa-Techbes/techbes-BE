const mongoose = require('mongoose');
const Registration = require('./models/Registration');

async function check() {
  try {
    require('dotenv').config();
    const connectDB = require('./config/db');
    await connectDB();

    console.log('--- Registrations ---');
    const regs = await Registration.find().sort({ createdAt: -1 }).limit(5);
    regs.forEach(r => {
      console.log(`ID: ${r._id}, Name: ${r.name}, Email: ${r.email}, Status: ${r.paymentStatus}, OrderId: ${r.razorpayOrderId}, EnrollmentId: ${r.enrollmentId}, CourseType: ${r.courseType}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

check();
