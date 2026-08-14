const Masterclass = require('../models/Masterclass');

async function seedMasterclass() {
  try {
    const count = await Masterclass.countDocuments();
    if (count === 0) {
      console.log('[Seed] No Masterclass found. Seeding default...');
      await Masterclass.create({
        title: 'TechBes CCTV Installation & Networking Masterclass',
        slug: 'cctv-masterclass',
        description: 'Comprehensive live training program covering analog and IP CCTV system installation, NVR/DVR setup, PoE network configuration, mobile viewing setups and troubleshooting techniques.',
        price: 499,
        date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        startTime: '10:00 AM',
        endTime: '04:00 PM',
        duration: '1 Day (Practical)',
        maxSeats: 50,
        registrationOpen: true,
        certificateEnabled: true,
        status: 'published'
      });
      console.log('[Seed] Default Masterclass seeded successfully.');
    } else {
      console.log(`[Seed] Masterclass database already has ${count} records. Skipping seed.`);
    }
  } catch (err) {
    console.error('[Seed] Masterclass seeding failed:', err.message);
  }
}

module.exports = seedMasterclass;
