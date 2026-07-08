require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  try {
    console.log("Connecting to:", process.env.MONGODB_URI);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected.");

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));

    for (const colInfo of collections) {
      const colName = colInfo.name;
      const col = db.collection(colName);

      // Search for "shifting" or "data center" in any field
      const query = {
        $or: [
          { name: /shifting/i },
          { title: /shifting/i },
          { description: /shifting/i },
          { overview: /shifting/i },
          { name: /data center/i },
          { title: /data center/i },
          { description: /data center/i },
          { overview: /data center/i },
          { name: /datacenter/i },
          { title: /datacenter/i },
          { description: /datacenter/i },
          { overview: /datacenter/i }
        ]
      };

      const docs = await col.find(query).toArray();
      if (docs.length > 0) {
        console.log(`\nFound matches in collection "${colName}":`);
        docs.forEach(doc => {
          console.log(`- ID: ${doc._id}, Name/Title: ${doc.name || doc.title}`);
        });
      }
    }

    await mongoose.connection.close();
  } catch (err) {
    console.error(err);
  }
}

run();
