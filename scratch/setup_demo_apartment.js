const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Apartment = require('../models/Apartment');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');
const bcrypt = require('bcryptjs');
const { signToken } = require('../utils/jwt');

async function setup() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const DEMO_APT_NAME = 'TechBes Demo Residency';
  const ISOLATION_APT_NAME = 'TechBes Isolation Residency';

  // 1. Setup Demo Apartment
  let apt = await Apartment.findOne({ name: DEMO_APT_NAME });
  if (!apt) {
    apt = await Apartment.create({
      name: DEMO_APT_NAME,
      address: 'Plot 101, Electronic City Phase 1, Near Tech Hub',
      locality: 'Electronic City Phase 1',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560100',
      contactPerson: 'Mr. Arvind Swamy (Society President)',
      contactPhone: '9845011223',
      contactEmail: 'association.demo@techbes.test',
      totalFlats: 32,
      blocks: [
        { name: 'Block A', floors: 4, flatsCount: 16 },
        { name: 'Block B', floors: 4, flatsCount: 16 }
      ],
      notes: 'Dedicated isolated demo gated community for Customer Mobile App & In-Charge verification.',
      associationUsers: [],
      residents: []
    });
    console.log('Created Demo Apartment:', apt._id.toString());
  } else {
    console.log('Found existing Demo Apartment:', apt._id.toString());
  }

  // 2. Setup Isolation Apartment (for cross-apartment access testing)
  let isoApt = await Apartment.findOne({ name: ISOLATION_APT_NAME });
  if (!isoApt) {
    isoApt = await Apartment.create({
      name: ISOLATION_APT_NAME,
      address: 'Plot 55, Whitefield Main Road',
      locality: 'Whitefield',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560066',
      contactPerson: 'Mr. Rohan Sharma',
      contactPhone: '9845099887',
      contactEmail: 'association.iso@techbes.test',
      totalFlats: 16,
      blocks: [
        { name: 'Tower 1', floors: 4, flatsCount: 16 }
      ],
      notes: 'Isolated community for cross-tenant IDOR validation.',
      associationUsers: [],
      residents: []
    });
    console.log('Created Isolation Apartment:', isoApt._id.toString());
  } else {
    console.log('Found existing Isolation Apartment:', isoApt._id.toString());
  }

  // 3. Setup Demo Resident in Demo Apartment
  const RESIDENT_MOBILE = '9800000001';
  const RESIDENT_PASS = 'Resident@Demo123';
  let residentUser = await User.findOne({ mobileNumber: RESIDENT_MOBILE }).select('+password');

  // Ensure resident in apartment registry
  let residentRecord = apt.residents.find(r => r.phone === RESIDENT_MOBILE);
  if (!residentRecord) {
    const resId = `RES-DEM-A101-${Math.floor(100 + Math.random() * 900)}`;
    apt.residents.push({
      residentId: resId,
      name: 'Demo Resident',
      phone: RESIDENT_MOBILE,
      email: 'resident.demo@techbes.test',
      block: 'Block A',
      floor: '1',
      flatNumber: 'A-101',
      residentType: 'owner',
      status: 'active',
      accountStatus: 'active',
      moveInDate: new Date('2025-01-01'),
      emergencyContact: {
        name: 'Pooja Resident',
        phone: '9800000099',
        relation: 'Spouse'
      }
    });
    await apt.save();
    residentRecord = apt.residents.find(r => r.phone === RESIDENT_MOBILE);
    console.log('Added Resident Record in Apartment Registry');
  }

  if (!residentUser) {
    residentUser = await User.create({
      name: 'Demo Resident',
      mobileNumber: RESIDENT_MOBILE,
      email: 'resident.demo@techbes.test',
      password: RESIDENT_PASS,
      role: 'resident',
      apartmentId: apt._id,
      flatNumber: 'A-101',
      block: 'Block A',
      userType: 'web_user',
      isOnline: true,
      sessionActive: true
    });
    console.log('Created Demo Resident User account');
  } else {
    residentUser.password = RESIDENT_PASS;
    residentUser.role = 'resident';
    residentUser.apartmentId = apt._id;
    residentUser.flatNumber = 'A-101';
    residentUser.block = 'Block A';
    await residentUser.save();
    console.log('Updated Demo Resident User account');
  }

  // Link userId back to resident record
  residentRecord.userId = residentUser._id;
  residentRecord.accountStatus = 'active';
  await apt.save();

  // 4. Setup Demo In-Charge in Demo Apartment (role: association)
  const INCHARGE_MOBILE = '9800000002';
  const INCHARGE_PASS = 'Incharge@Demo123';
  let inchargeUser = await User.findOne({ mobileNumber: INCHARGE_MOBILE }).select('+password');

  if (!inchargeUser) {
    inchargeUser = await User.create({
      name: 'Demo InCharge',
      mobileNumber: INCHARGE_MOBILE,
      email: 'demo.incharge@techbes.test',
      password: INCHARGE_PASS,
      role: 'association',
      apartmentId: apt._id,
      userType: 'web_user',
      isOnline: true,
      sessionActive: true
    });
    console.log('Created Demo InCharge User account');
  } else {
    inchargeUser.password = INCHARGE_PASS;
    inchargeUser.role = 'association';
    inchargeUser.apartmentId = apt._id;
    await inchargeUser.save();
    console.log('Updated Demo InCharge User account');
  }

  // Link incharge into apartment.associationUsers if not already present
  if (!apt.associationUsers.some(uid => uid.toString() === inchargeUser._id.toString())) {
    apt.associationUsers.push(inchargeUser._id);
    await apt.save();
    console.log('Linked InCharge to Demo Apartment associationUsers');
  }

  // 5. Setup Other Resident in Isolation Apartment
  const OTHER_RESIDENT_MOBILE = '9800000003';
  const OTHER_RESIDENT_PASS = 'Other@Demo123';
  let otherUser = await User.findOne({ mobileNumber: OTHER_RESIDENT_MOBILE }).select('+password');

  let otherRecord = isoApt.residents.find(r => r.phone === OTHER_RESIDENT_MOBILE);
  if (!otherRecord) {
    isoApt.residents.push({
      residentId: `RES-ISO-B202-${Math.floor(100 + Math.random() * 900)}`,
      name: 'Other Apartment Resident',
      phone: OTHER_RESIDENT_MOBILE,
      email: 'other.resident@techbes.test',
      block: 'Tower 1',
      floor: '2',
      flatNumber: 'B-202',
      residentType: 'tenant',
      status: 'active',
      accountStatus: 'active'
    });
    await isoApt.save();
    otherRecord = isoApt.residents.find(r => r.phone === OTHER_RESIDENT_MOBILE);
  }

  if (!otherUser) {
    otherUser = await User.create({
      name: 'Other Apartment Resident',
      mobileNumber: OTHER_RESIDENT_MOBILE,
      email: 'other.resident@techbes.test',
      password: OTHER_RESIDENT_PASS,
      role: 'resident',
      apartmentId: isoApt._id,
      flatNumber: 'B-202',
      block: 'Tower 1',
      userType: 'web_user',
      isOnline: true,
      sessionActive: true
    });
    console.log('Created Other Apartment Resident User account');
  } else {
    otherUser.password = OTHER_RESIDENT_PASS;
    otherUser.role = 'resident';
    otherUser.apartmentId = isoApt._id;
    otherUser.flatNumber = 'B-202';
    otherUser.block = 'Tower 1';
    await otherUser.save();
  }
  otherRecord.userId = otherUser._id;
  await isoApt.save();

  console.log('\n--- DEMO SETUP SUMMARY ---');
  console.log(`Demo Apartment: ${apt.name} (ID: ${apt._id})`);
  console.log(`Demo Resident: ${residentUser.name} | Mobile: ${residentUser.mobileNumber} | Flat: ${residentUser.flatNumber}, ${residentUser.block}`);
  console.log(`Demo InCharge: ${inchargeUser.name} | Mobile: ${inchargeUser.mobileNumber} | Role: ${inchargeUser.role} | Apartment: ${inchargeUser.apartmentId}`);
  console.log(`Isolation Apartment: ${isoApt.name} (ID: ${isoApt._id})`);
  console.log(`Isolation Resident: ${otherUser.name} | Mobile: ${otherUser.mobileNumber} | Flat: ${otherUser.flatNumber}`);
  console.log('Setup successfully completed.');

  await mongoose.disconnect();
}

setup().catch(err => {
  console.error('Setup error:', err);
  process.exit(1);
});
