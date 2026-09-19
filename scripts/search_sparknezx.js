const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name));

  for (const c of collections) {
    try {
      const found = await db.collection(c.name).find({ 
        email: /sparknezx/i
      }).toArray();
      if (found.length > 0) {
        console.log('Found in collection ' + c.name + ':', JSON.stringify(found, null, 2));
      }
    } catch (e) {}
  }

  const regCount = await db.collection('registrations').countDocuments();
  console.log('Total registrations in collection:', regCount);

  // Print sample registrations
  const samples = await db.collection('registrations').find({}).limit(5).toArray();
  console.log('Sample registrations:', JSON.stringify(samples, null, 2));

  await mongoose.disconnect();
}
check();
