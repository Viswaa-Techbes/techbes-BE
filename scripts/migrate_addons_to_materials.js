const mongoose = require('mongoose');
require('../config/db');
const CctvAddon = require('../models/CctvAddon');
const Material = require('../models/Material');

async function migrate() {
  try {
    const addons = await CctvAddon.find({});
    console.log('Found', addons.length, 'addons');
    let created = 0;
    for (const a of addons) {
      const exists = await Material.findOne({ sourceAddonId: a._id });
      if (exists) continue;
      const m = new Material({
        name: a.name,
        sku: (a.slug || '').toUpperCase(),
        category: 'CCTV',
        unit: a.unit || 'each',
        price: a.price || 0,
        image: a.image || '',
        description: a.description || '',
        status: a.status || 'active',
        sourceAddonId: a._id,
      });
      await m.save();
      created++;
    }
    console.log(`Migration complete. Created ${created} material(s).`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

migrate();
