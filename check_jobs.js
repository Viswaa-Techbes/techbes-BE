const mongoose = require('mongoose');
const Job = require('./models/Job');

async function checkJobs() {
  try {
    require('dotenv').config();
    const connectDB = require('./config/db');
    await connectDB();

    const jobId = '69f19202113d5f0e17bfc8b8';

    console.log('Finding job...');
    const job = await Job.findById(jobId);
    console.log('Job found:', !!job);
    if (job) {
      console.log('Title:', job.title);
      console.log('Status:', job.status);
    }

    console.log('Trying update with populate and runValidators...');
    const updated = await Job.findByIdAndUpdate(jobId, { status: 'assigned' }, {
      new: true,
      runValidators: true,
    }).populate('assignedTechnician', 'name email specialty');
    console.log('Updated job:', !!updated);
    if (updated) {
      console.log('Updated status:', updated.status);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkJobs();