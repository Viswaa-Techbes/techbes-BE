/**
 * verifyMapsAndRouting.js
 * =======================
 * Validates coordinate storage, geocoding fallback, auto-dispatch sorting, and Routing service.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Job = require('./models/Job');
const Address = require('./models/Address');
const routingService = require('./services/routingService');
const dispatchService = require('./services/dispatchService');

async function runVerification() {
  console.log('==================================================');
  console.log('STARTING MAPS & ROUTING FLOW UPGRADE VERIFICATION');
  console.log('==================================================\n');

  // 1. Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/technician_app';
  console.log(`[Database] Connecting to MongoDB: ${mongoUri}`);
  try {
    await mongoose.connect(mongoUri);
    console.log('[Database] Connected successfully.');
  } catch (err) {
    console.error('[Database] Connection failed:', err.message);
    process.exit(1);
  }

  try {
    // 2. Validate Routing Service and Fallback
    console.log('\n--- VERIFYING ROUTING & Fallback ---');
    const startCoords = { lat: 12.971598, lng: 77.594562 }; // Bangalore MG Road
    const endCoords = { lat: 12.935158, lng: 77.624480 };   // Bangalore Koramangala
    
    console.log(`[Routing] Querying directions: MG Road (${startCoords.lat}, ${startCoords.lng}) -> Koramangala (${endCoords.lat}, ${endCoords.lng})`);
    
    const directions = await routingService.getDirections(startCoords, endCoords);
    console.log('[Routing] Response:', {
      distanceKm: directions.distanceKm,
      durationMinutes: directions.durationMinutes,
      polylineCount: directions.polyline.length,
      source: directions.source
    });

    if (directions.distanceKm > 0 && directions.durationMinutes > 0 && directions.polyline.length > 0) {
      console.log('✓ Routing API test PASSED.');
    } else {
      console.error('✗ Routing API test FAILED: Empty response values.');
    }

    // 3. Validate Auto-assignment & Coordinate sorting
    console.log('\n--- VERIFYING AUTO-ASSIGNMENT SORTING ---');
    
    // Find or create test customer address
    console.log('[Auto-Assign] Creating mock customer address...');
    const testCustomerAddress = await Address.create({
      userId: new mongoose.Types.ObjectId(),
      name: 'Test Customer',
      address: 'Vibrant Tech Park, Koramangala',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560034',
      latitude: 12.935158,
      longitude: 77.624480
    });
    
    // Cleanup any lingering duplicate records from previous runs
    await User.deleteMany({ mobileNumber: { $in: ['9999900001', '9999900002', '9999900003'] } });

    // Create Mock Technicians at different distances
    console.log('[Auto-Assign] Seeding 3 mock online technicians at different distances...');
    
    // Tech A: Close (1.5 km)
    const techClose = await User.create({
      name: 'Tech Close (1.5km)',
      email: `tech_close_${Date.now()}@example.com`,
      mobileNumber: '9999900001',
      phone: '9999900001',
      password: 'password123',
      role: 'technician',
      availabilityStatus: 'ONLINE',
      lat: 12.9450, // Close latitude
      lng: 77.6280, // Close longitude
      rating: 4.8,
      completedJobs: 15,
      serviceCategories: ['cctv_installation']
    });

    // Tech B: Very Close (0.8 km) but lower rating
    const techVeryClose = await User.create({
      name: 'Tech Very Close (0.8km)',
      email: `tech_vclose_${Date.now()}@example.com`,
      mobileNumber: '9999900002',
      phone: '9999900002',
      password: 'password123',
      role: 'technician',
      availabilityStatus: 'ONLINE',
      lat: 12.9380, // Closer
      lng: 77.6200, 
      rating: 4.2,
      completedJobs: 8,
      serviceCategories: ['cctv_installation']
    });

    // Tech C: Far (12 km)
    const techFar = await User.create({
      name: 'Tech Far (12km)',
      email: `tech_far_${Date.now()}@example.com`,
      mobileNumber: '9999900003',
      phone: '9999900003',
      password: 'password123',
      role: 'technician',
      availabilityStatus: 'ONLINE',
      lat: 12.9000, 
      lng: 77.5000, 
      rating: 4.9,
      completedJobs: 30,
      serviceCategories: ['cctv_installation']
    });

    // Create a mock CCTV Job
    const mockJob = await Job.create({
      title: 'Mock CCTV Service Request',
      description: 'Needs CCTV cameras fixed',
      location: testCustomerAddress.address,
      addressId: testCustomerAddress._id,
      serviceId: 'cctv_installation',
      serviceName: 'CCTV Installation',
      v2Metadata: {
        lat: String(testCustomerAddress.latitude),
        lng: String(testCustomerAddress.longitude),
        pincode: '560034'
      }
    });

    console.log('[Auto-Assign] Raw technician array before sort (unsorted database list with computed distances):');
    const rawTechs = [
      { name: techClose.name, distanceKm: routingService.haversineKm(testCustomerAddress.latitude, testCustomerAddress.longitude, techClose.lat, techClose.lng), rating: techClose.rating, completedJobs: techClose.completedJobs },
      { name: techVeryClose.name, distanceKm: routingService.haversineKm(testCustomerAddress.latitude, testCustomerAddress.longitude, techVeryClose.lat, techVeryClose.lng), rating: techVeryClose.rating, completedJobs: techVeryClose.completedJobs },
      { name: techFar.name, distanceKm: routingService.haversineKm(testCustomerAddress.latitude, testCustomerAddress.longitude, techFar.lat, techFar.lng), rating: techFar.rating, completedJobs: techFar.completedJobs }
    ];
    rawTechs.forEach((t, i) => {
      console.log(`  Tech ${i + 1}: ${t.name} - Distance: ${t.distanceKm.toFixed(2)} km, Rating: ${t.rating}, Jobs: ${t.completedJobs}`);
    });

    console.log('\n[Auto-Assign] Running match dispatch query...');
    const eligibleTechs = await dispatchService.findEligibleTechnicians(mockJob, {
      lat: testCustomerAddress.latitude,
      lng: testCustomerAddress.longitude
    });

    console.log('\n[Auto-Assign] Sorted array after sort (eligible and ranked):');
    eligibleTechs.forEach((t, i) => {
      console.log(`  Rank ${i + 1}: ${t.name} - Distance: ${t.distanceKm.toFixed(2)} km, Rating: ${t.rating}, Pincode Match: ${t.coversPincode}`);
    });

    // Validations: Rank 1 should be Tech Very Close
    if (eligibleTechs.length >= 2) {
      const firstTech = eligibleTechs[0];
      const secondTech = eligibleTechs[1];
      
      console.log(`\n[Auto-Assign] Final selected technician: ${firstTech.name}`);
      if (firstTech.distanceKm < secondTech.distanceKm) {
        console.log('✓ Auto-assignment sorting verification PASSED.');
      } else {
        console.warn('⚡ Warning: Nearest technician was not ranked first.');
      }
    } else {
      console.error('✗ Auto-assignment sorting verification FAILED: Insufficient technicians found.');
    }

    // Clean up mock entities
    console.log('\n[Cleanup] Cleaning up mock verification databases records...');
    await Address.deleteOne({ _id: testCustomerAddress._id });
    await Job.deleteOne({ _id: mockJob._id });
    await User.deleteMany({ _id: { $in: [techClose._id, techVeryClose._id, techFar._id] } });
    console.log('[Cleanup] Done.');

  } catch (err) {
    console.error('Verification encountered an error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\n[Database] Disconnected. Verification run finished.');
    console.log('==================================================');
  }
}

runVerification();
