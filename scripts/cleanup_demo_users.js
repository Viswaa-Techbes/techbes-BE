const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function cleanup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const testUserNames = ['Technician', 'Test User', 'TestTech', 'test', 'testaccount', 'viswaa-Test'];
    
    // Also delete any user with "test" in their name (case insensitive)
    const result = await User.deleteMany({
      $or: [
        { name: { $in: testUserNames } },
        { name: { $regex: /test/i } },
        { mobileNumber: { $regex: /123456/ } }
      ]
    });

    console.log(`Deleted ${result.deletedCount} demo/test users.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

cleanup();
