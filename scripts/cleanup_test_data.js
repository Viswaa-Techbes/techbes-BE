/**
 * cleanup_test_data.js
 * Removes old E2E dummy bookings, worksheets, status history, expenses, and dummy test staff
 * while preserving all real customer records, inventory, and active admin/QA accounts.
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: '/var/www/techbes-BE/.env' });

const Job = require('../models/Job');
const User = require('../models/User');
const Expense = require('../models/Expense');
const ServiceWorksheet = require('../models/ServiceWorksheet');
const JobStatusHistory = require('../models/JobStatusHistory');

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI not found in .env');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB:', mongoose.connection.name);

  // 1. Find dummy bookings
  const dummyJobs = await Job.find({
    $or: [
      { bookingNumber: { $in: ['ORD-2026-00001', 'ORD-2026-00003'] } },
      { customerName: { $regex: /E2E Test Customer|E2E Test Resident|QA Automated Verification Client|Arun Kumar/i } },
    ],
  }).lean();

  console.log(`Found ${dummyJobs.length} dummy job(s):`);
  for (const j of dummyJobs) {
    console.log(` - ${j._id} | ${j.bookingNumber || 'no-num'} | ${j.customerName} | ${j.title}`);
  }

  if (dummyJobs.length > 0) {
    const jobIds = dummyJobs.map((j) => j._id);
    const jobIdStrings = dummyJobs.map((j) => j._id.toString());

    const wsDel = await ServiceWorksheet.deleteMany({ jobId: { $in: jobIds } });
    const histDel = await JobStatusHistory.deleteMany({ jobId: { $in: jobIdStrings } });
    const expDel = await Expense.deleteMany({ jobId: { $in: jobIds } });
    const jobDel = await Job.deleteMany({ _id: { $in: jobIds } });

    console.log(`Deleted: ${jobDel.deletedCount} Jobs, ${wsDel.deletedCount} Worksheets, ${histDel.deletedCount} History, ${expDel.deletedCount} Expenses.`);
  }

  // Also remove any orphaned QA E2E / demo expenses whose job was already deleted via API
  const qaExpDel = await Expense.deleteMany({
    description: { $regex: /QA E2E|Cat6 Patch Cords/i },
  });
  if (qaExpDel.deletedCount > 0) {
    console.log(`Deleted ${qaExpDel.deletedCount} orphaned QA E2E expense(s).`);
  }

  // 2. Find dummy staff accounts (dhanshekar rasagulla paka, viswaa E) - exclude protected accounts
  const dummyUsers = await User.find({
    name: { $regex: /dhanshekar rasagulla paka|viswaa E/i },
    email: { $ne: 'lohith@techbes.co.in' },
    mobileNumber: { $ne: '9000099999' },
  }).lean();

  console.log(`\nFound ${dummyUsers.length} dummy staff user(s):`);
  for (const u of dummyUsers) {
    console.log(` - ${u._id} | ${u.name} | ${u.role} | ${u.mobileNumber || u.email}`);
  }

  if (dummyUsers.length > 0) {
    const userIds = dummyUsers.map((u) => u._id);
    const userDel = await User.deleteMany({ _id: { $in: userIds } });
    console.log(`Deleted ${userDel.deletedCount} dummy staff user(s).`);
  }

  console.log('\nCleanup complete.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
