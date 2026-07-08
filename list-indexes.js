const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const mongoose = require('mongoose');

async function listAllIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    for (const colInfo of collections) {
      const colName = colInfo.name;
      const collection = db.collection(colName);
      const indexes = await collection.indexes();
      console.log(`\nCollection: ${colName}`);
      for (const idx of indexes) {
        if (idx.unique) {
          console.log(`  - Unique Index: ${idx.name} on keys: ${JSON.stringify(idx.key)}`);
        } else {
          console.log(`  - Index: ${idx.name} on keys: ${JSON.stringify(idx.key)}`);
        }
      }
    }
  } catch (err) {
    console.error('Failed to list indexes:', err.message || err);
  } finally {
    await mongoose.connection.close();
  }
}

listAllIndexes();
