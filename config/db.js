const mongoose = require('mongoose');
const User = require('../models/User');

/**
 * Connects to MongoDB (Atlas or local) using MONGODB_URI from environment.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error('MONGODB_URI is not set in environment variables');
  }

  if (process.env.NODE_ENV !== 'production') {
    const hint = uri.startsWith('mongodb+srv://')
      ? 'Atlas (mongodb+srv)'
      : uri.includes('127.0.0.1') || uri.includes('localhost')
        ? 'local MongoDB'
        : 'MongoDB';
    console.log(`[db] Connecting to ${hint}`);
  }

  mongoose.set('strictQuery', true);
  mongoose.set('strictPopulate', false);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 20_000,
      // Prefer IPv4 when resolving Atlas hostnames (helps on some networks).
      family: 4,
    });
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (msg.includes('querySrv') || msg.includes('_mongodb._tcp')) {
      console.error(
        '\n[db] Atlas SRV DNS lookup failed. This is a network/DNS issue, not your password.\n' +
          '  • In Atlas: Database → Connect → Drivers → use the Standard connection string (mongodb://… with host list), not mongodb+srv://\n' +
          '  • Or fix DNS: set Windows DNS to 8.8.8.8 / 1.1.1.1, disable VPN/proxy blocking DNS, allow outbound DNS (port 53)\n' +
          '  • Corporate firewalls sometimes block SRV lookups — try phone hotspot to confirm.\n'
      );
    }
    throw err;
  }

  console.log('MongoDB connected');

  try {
    await User.syncIndexes();
    console.log('[db] User indexes synchronized');
  } catch (err) {
    console.warn('[db] Failed to synchronize User indexes:', err?.message ?? err);
  }

  try {
    const { runSeed } = require('../utils/catalogSeeder');
    await runSeed();
  } catch (seedErr) {
    console.warn('[db] Auto-seeding catalog failed:', seedErr.message);
  }


  try {
    const db = mongoose.connection.db;
    const paymentCollection = db.collection('payments');
    const indexes = await paymentCollection.indexes();
    const hasPaymentIdIndex = indexes.some(idx => idx.name === 'paymentId_1');
    if (hasPaymentIdIndex) {
      console.log('[db] Found stale unique index paymentId_1. Dropping it...');
      await paymentCollection.dropIndex('paymentId_1');
      console.log('[db] paymentId_1 index dropped successfully.');
    }
  } catch (err) {
    console.warn('[db] Failed to check/drop payments index:', err?.message ?? err);
  }
}

module.exports = connectDB;
