const mongoose = require('mongoose');
const User = require('./models/User');
const dotenv = require('dotenv');

dotenv.config();

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Create a Manager if not exists
    let manager = await User.findOne({ email: 'manager@example.com' });
    if (!manager) {
      manager = await User.create({
        name: 'Main Manager',
        email: 'manager@example.com',
        password: 'password123',
        role: 'manager',
      });
      console.log('Manager created');
    }

    // Create some Technicians
    const techs = [
      { name: 'John Doe', email: 'john@tech.com', specialty: 'Electrical' },
      { name: 'Jane Smith', email: 'jane@tech.com', specialty: 'HVAC' },
      { name: 'Bob Wilson', email: 'bob@tech.com', specialty: 'Plumbing' },
    ];

    for (const t of techs) {
      const existing = await User.findOne({ email: t.email });
      if (!existing) {
        await User.create({
          ...t,
          password: 'password123',
          role: 'technician',
          isOnline: true,
          status: 'available',
          lat: 13.0827 + (Math.random() - 0.5) * 0.1,
          lng: 80.2707 + (Math.random() - 0.5) * 0.1,
          assignedManager: manager._id,
        });
        console.log(`Technician ${t.name} created`);
      }
    }

    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
}

seed();
