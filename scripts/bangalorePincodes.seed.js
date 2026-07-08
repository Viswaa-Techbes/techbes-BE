/**
 * Bangalore Pincode Seed Script
 * Run: node BE/scripts/bangalorePincodes.seed.js
 *
 * Seeds all major Bangalore pincodes with area name and coordinates.
 * Covers all zones: North, South, East, West, Central.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BangalorePincode = require('../models/BangalorePincode');

const BANGALORE_PINCODES = [
  // ─── Central Bangalore ────────────────────────────────────────────────────
  { pincode: '560001', areaName: 'Bangalore GPO / MG Road', latitude: 12.9716, longitude: 77.5946, zone: 'Central' },
  { pincode: '560002', areaName: 'Shivajinagar', latitude: 12.9791, longitude: 77.5975, zone: 'Central' },
  { pincode: '560003', areaName: 'Seshadripuram', latitude: 12.9897, longitude: 77.5731, zone: 'Central' },
  { pincode: '560004', areaName: 'Rajajinagar', latitude: 12.9933, longitude: 77.5536, zone: 'West' },
  { pincode: '560005', areaName: 'Chamarajpet', latitude: 12.9626, longitude: 77.5651, zone: 'South' },
  { pincode: '560009', areaName: 'Malleswaram', latitude: 13.0003, longitude: 77.5726, zone: 'North' },
  { pincode: '560010', areaName: 'Gandhinagar', latitude: 12.9802, longitude: 77.5727, zone: 'Central' },
  { pincode: '560011', areaName: 'Jayanagar', latitude: 12.9299, longitude: 77.5833, zone: 'South' },
  { pincode: '560012', areaName: 'Basavanagudi', latitude: 12.9416, longitude: 77.5736, zone: 'South' },
  { pincode: '560013', areaName: 'Lalbagh Road', latitude: 12.9507, longitude: 77.5848, zone: 'South' },

  // ─── North Bangalore ─────────────────────────────────────────────────────
  { pincode: '560024', areaName: 'Dollars Colony / HMT Layout', latitude: 13.0215, longitude: 77.5434, zone: 'North' },
  { pincode: '560032', areaName: 'Nagasandra / Peenya', latitude: 13.0365, longitude: 77.5156, zone: 'North' },
  { pincode: '560054', areaName: 'Yeshwanthpur', latitude: 13.0207, longitude: 77.5437, zone: 'North' },
  { pincode: '560057', areaName: 'Gokula / Hebbal', latitude: 13.0344, longitude: 77.5962, zone: 'North' },
  { pincode: '560064', areaName: 'Mathikere', latitude: 13.0102, longitude: 77.5596, zone: 'North' },
  { pincode: '560065', areaName: 'T Dasarahalli', latitude: 13.0569, longitude: 77.5030, zone: 'North' },
  { pincode: '560073', areaName: 'Sadashivanagar / Bangalore North', latitude: 13.0069, longitude: 77.5691, zone: 'North' },
  { pincode: '560092', areaName: 'Nagavara / Thanisandra', latitude: 13.0520, longitude: 77.6189, zone: 'North' },
  { pincode: '560024', areaName: 'MS Ramaiah / Mathikere', latitude: 13.0195, longitude: 77.5554, zone: 'North' },
  { pincode: '560080', areaName: 'Kalyan Nagar', latitude: 13.0356, longitude: 77.6476, zone: 'North' },
  { pincode: '560043', areaName: 'Jakkur / Yelahanka New Town', latitude: 13.0998, longitude: 77.5934, zone: 'North' },
  { pincode: '560064', areaName: 'Malleshwaram West', latitude: 13.0105, longitude: 77.5542, zone: 'North' },

  // ─── South Bangalore ─────────────────────────────────────────────────────
  { pincode: '560041', areaName: 'JP Nagar', latitude: 12.9063, longitude: 77.5857, zone: 'South' },
  { pincode: '560061', areaName: 'Kanakapura Road', latitude: 12.8814, longitude: 77.5730, zone: 'South' },
  { pincode: '560076', areaName: 'Bannerghatta Road', latitude: 12.8941, longitude: 77.5975, zone: 'South' },
  { pincode: '560078', areaName: 'Arekere / Hulimavu', latitude: 12.8864, longitude: 77.6082, zone: 'South' },
  { pincode: '560082', areaName: 'Gottigere', latitude: 12.8522, longitude: 77.6025, zone: 'South' },
  { pincode: '560083', areaName: 'Begur', latitude: 12.8737, longitude: 77.6252, zone: 'South' },
  { pincode: '560085', areaName: 'Electronic City', latitude: 12.8413, longitude: 77.6769, zone: 'South' },
  { pincode: '560100', areaName: 'Bommanahalli', latitude: 12.8998, longitude: 77.6270, zone: 'South' },
  { pincode: '560068', areaName: 'Rajajinagar Extension / Vijayanagar', latitude: 12.9706, longitude: 77.5282, zone: 'South' },
  { pincode: '560069', areaName: 'BTM Layout', latitude: 12.9165, longitude: 77.6101, zone: 'South' },
  { pincode: '560070', areaName: 'Garvebhavi Palya', latitude: 12.9175, longitude: 77.6376, zone: 'South' },
  { pincode: '560076', areaName: 'Puttenahalli', latitude: 12.8895, longitude: 77.5870, zone: 'South' },

  // ─── East Bangalore ──────────────────────────────────────────────────────
  { pincode: '560008', areaName: 'Frazer Town / Pulikeshi Nagar', latitude: 12.9816, longitude: 77.6203, zone: 'East' },
  { pincode: '560033', areaName: 'Banaswadi', latitude: 13.0167, longitude: 77.6574, zone: 'East' },
  { pincode: '560036', areaName: 'Old Airport Road / Indiranagar', latitude: 12.9784, longitude: 77.6408, zone: 'East' },
  { pincode: '560038', areaName: 'HAL / Domlur', latitude: 12.9625, longitude: 77.6385, zone: 'East' },
  { pincode: '560045', areaName: 'Marathahalli', latitude: 12.9562, longitude: 77.6966, zone: 'East' },
  { pincode: '560048', areaName: 'HSR Layout', latitude: 12.9121, longitude: 77.6446, zone: 'East' },
  { pincode: '560066', areaName: 'Bommasandra / Hosur Road', latitude: 12.8281, longitude: 77.6852, zone: 'East' },
  { pincode: '560037', areaName: 'Cooke Town / Ulsoor', latitude: 12.9804, longitude: 77.6250, zone: 'East' },
  { pincode: '560093', areaName: 'Hoodi / Whitefield', latitude: 12.9921, longitude: 77.7501, zone: 'East' },
  { pincode: '560066', areaName: 'Hebbagodi', latitude: 12.8287, longitude: 77.6862, zone: 'East' },
  { pincode: '560016', areaName: 'Koramangala', latitude: 12.9279, longitude: 77.6271, zone: 'East' },
  { pincode: '560034', areaName: 'CV Raman Nagar', latitude: 12.9946, longitude: 77.6550, zone: 'East' },
  { pincode: '560037', areaName: 'Cooke Town', latitude: 12.9826, longitude: 77.6280, zone: 'East' },
  { pincode: '560017', areaName: 'Ejipura', latitude: 12.9397, longitude: 77.6268, zone: 'East' },
  { pincode: '560095', areaName: 'Varthur / Whitefield', latitude: 12.9423, longitude: 77.7376, zone: 'East' },
  { pincode: '560066', areaName: 'Electronic City Phase II', latitude: 12.8391, longitude: 77.6746, zone: 'East' },

  // ─── West Bangalore ──────────────────────────────────────────────────────
  { pincode: '560018', areaName: 'Rajajinagar', latitude: 12.9972, longitude: 77.5455, zone: 'West' },
  { pincode: '560021', areaName: 'Nandini Layout', latitude: 12.9748, longitude: 77.5205, zone: 'West' },
  { pincode: '560022', areaName: 'Nagarbhavi / Chord Road', latitude: 12.9625, longitude: 77.5155, zone: 'West' },
  { pincode: '560026', areaName: 'Jalahalli East', latitude: 13.0547, longitude: 77.5393, zone: 'West' },
  { pincode: '560027', areaName: 'Jalahalli West', latitude: 13.0604, longitude: 77.5225, zone: 'West' },
  { pincode: '560028', areaName: 'Kengeri', latitude: 12.9028, longitude: 77.4826, zone: 'West' },
  { pincode: '560040', areaName: 'Subramanyanagar / Magadi Road', latitude: 12.9756, longitude: 77.5060, zone: 'West' },
  { pincode: '560056', areaName: 'Vijayanagar', latitude: 12.9717, longitude: 77.5341, zone: 'West' },
  { pincode: '560074', areaName: 'Pantarapalya / Mysore Road', latitude: 12.9285, longitude: 77.5161, zone: 'West' },
  { pincode: '560023', areaName: 'Hesaraghatta Main Road', latitude: 13.0786, longitude: 77.5024, zone: 'West' },
  { pincode: '560059', areaName: 'Kengeri Satellite Town', latitude: 12.9078, longitude: 77.4769, zone: 'West' },
  { pincode: '560060', areaName: 'Rajarajeshwari Nagar', latitude: 12.9172, longitude: 77.5037, zone: 'West' },

  // ─── IT Corridor / Outer Ring Road ───────────────────────────────────────
  { pincode: '560103', areaName: 'Bellandur / Sarjapur Road', latitude: 12.9253, longitude: 77.6772, zone: 'East' },
  { pincode: '560102', areaName: 'Parappana Agrahara / ITPL', latitude: 12.9850, longitude: 77.7275, zone: 'East' },
  { pincode: '560066', areaName: 'Electronic City Phase I', latitude: 12.8456, longitude: 77.6652, zone: 'South' },
  { pincode: '560087', areaName: 'Sarjapur', latitude: 12.8564, longitude: 77.7847, zone: 'East' },
  { pincode: '560098', areaName: 'Mahadevapura', latitude: 12.9911, longitude: 77.7018, zone: 'East' },
  { pincode: '560049', areaName: 'Krishnarajapura / KR Puram', latitude: 13.0017, longitude: 77.6958, zone: 'East' },
  { pincode: '560035', areaName: 'Dooravaninagar', latitude: 13.0036, longitude: 77.6753, zone: 'East' },
  { pincode: '560047', areaName: 'Lingarajapuram / Kammanahalli', latitude: 13.0028, longitude: 77.6416, zone: 'East' },

  // ─── Yelahanka / Devanahalli (Airport Corridor) ───────────────────────────
  { pincode: '560064', areaName: 'Yelahanka', latitude: 13.1007, longitude: 77.5963, zone: 'North' },
  { pincode: '560006', areaName: 'HBR Layout / Kalyan Nagar', latitude: 13.0342, longitude: 77.6368, zone: 'North' },
  { pincode: '560096', areaName: 'Judicial Layout / Jakkur', latitude: 13.0842, longitude: 77.5901, zone: 'North' },
  { pincode: '560097', areaName: 'Attur Layout', latitude: 13.0758, longitude: 77.5858, zone: 'North' },
  { pincode: '562110', areaName: 'Devanahalli', latitude: 13.2453, longitude: 77.7141, zone: 'North' },
  { pincode: '562157', areaName: 'Doddaballapura Road', latitude: 13.1987, longitude: 77.5427, zone: 'North' },
];

async function seed() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI not set in .env');

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Upsert each pincode (idempotent)
    let upserted = 0;
    let skipped = 0;

    for (const entry of BANGALORE_PINCODES) {
      try {
        await BangalorePincode.findOneAndUpdate(
          { pincode: entry.pincode },
          entry,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        upserted++;
      } catch (err) {
        console.warn(`⚠ Skipped ${entry.pincode} (${entry.areaName}): ${err.message}`);
        skipped++;
      }
    }

    const total = await BangalorePincode.countDocuments();
    console.log(`\n✅ Seed complete!`);
    console.log(`   Upserted: ${upserted}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total in DB: ${total}`);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

seed();
