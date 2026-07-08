require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Service = require('../models/Service');
const ServiceSubcategory = require('../models/ServiceSubcategory');
const ServiceMaterial = require('../models/ServiceMaterial');

// Fallback to old models just to sync collections in case of aliases
const CctvCategory = require('../models/CctvCategory');
const CctvSubcategory = require('../models/CctvSubcategory');

function slugify(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function upsertService(payload) {
  return Service.findOneAndUpdate(
    { slug: payload.slug },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertSubcategory(payload) {
  return ServiceSubcategory.findOneAndUpdate(
    { slug: payload.slug },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function run() {
  await connectDB();
  console.log('Connected to MongoDB. Starting database seed of Service-Subcategory-Material collections...');

  // 1. Create main services (categories)
  const services = {
    cctv: await upsertService({ name: 'CCTV Installation', slug: 'cctv', description: 'Surveillance, camera setups, and remote monitoring.', status: 'active', sortOrder: 1 }),
    network: await upsertService({ name: 'Network Setup', slug: 'network', description: 'Enterprise cabling, routers, switches, and WiFi rollout.', status: 'active', sortOrder: 2 }),
    security: await upsertService({ name: 'Cyber Security', slug: 'security', description: 'Firewalls, access control, biometrics, and threat hardening.', status: 'active', sortOrder: 3 }),
    hardware: await upsertService({ name: 'Hardware Repair', slug: 'hardware', description: 'Laptops, desktops, printers, and workstation repairs.', status: 'active', sortOrder: 4 }),
    amc: await upsertService({ name: 'AMC Plans', slug: 'amc', description: 'Annual IT maintenance contracts for growing offices.', status: 'active', sortOrder: 5 }),
    fire: await upsertService({ name: 'Fire Safety', slug: 'fire', description: 'Alarms, extinguishers, and compliance reports.', status: 'active', sortOrder: 6 })
  };

  console.log('Services (Categories) seeded.');

  // Clear existing materials so we reload them cleanly
  await ServiceMaterial.deleteMany({});
  console.log('Cleared existing materials.');

  // Helper to seed materials
  async function seedMaterials(subId, mats) {
    const list = [];
    for (const m of mats) {
      const item = await ServiceMaterial.create({
        subcategoryId: subId,
        name: m.name,
        slug: slugify(m.name),
        price: m.price,
        unit: m.unit || 'each',
        isLabour: m.isLabour || false,
        description: m.description || '',
        status: 'active'
      });
      list.push(item);
    }
    return list;
  }

  // =========================================================================
  // 2. CCTV Installation
  // =========================================================================
  const cctvSub = await upsertSubcategory({
    serviceId: services.cctv._id,
    categoryId: services.cctv._id, // Legacy compatibility
    name: 'CCTV Installation',
    slug: 'cctv-installation',
    shortDescription: 'Configurable CCTV service with step-by-step booking and material selection.',
    overview: 'CCTV Installation includes site review, camera placement, installation, cabling, recorder setup, and handover testing. Configure camera type, materials, and schedule in the booking flow.',
    suitableFor: ['Homes', 'Offices', 'Retail shops', 'Apartments', 'Warehouses'],
    includedServices: ['Site inspection and placement guidance', 'Camera mounting and alignment', 'Basic DVR/NVR or mobile viewing setup', 'Workmanship warranty'],
    installationTime: '2-6 hours',
    warranty: '30-day workmanship warranty.',
    pricingStartsFrom: 499,
    image: 'https://images.unsplash.com/photo-1505691723518-36a9a0b5f6b5?w=1200&h=900&fit=crop',
    status: 'active',
    sortOrder: 1,
    serviceTypes: [
      { name: 'Wired Camera Installation', price: 499, description: 'Installation of dome or bullet camera with coaxial or CAT6 cabling.' },
      { name: 'Wireless Camera Installation', price: 599, description: 'Wi-Fi based smart camera setup with SD card configuration.' },
      { name: 'IP Camera Installation', price: 699, description: 'High-definition digital IP camera setup connected to NVR.' },
      { name: 'DVR Setup', price: 799, description: 'Digital Video Recorder installation, HDD mapping, and remote viewing config.' },
      { name: 'NVR Setup', price: 899, description: 'Network Video Recorder configuration with IP assignment and PoE switch setup.' },
      { name: 'CCTV Maintenance', price: 399, description: 'General inspection, camera lens cleaning, connector replacement, and angle alignment.' },
      { name: 'CCTV Relocation', price: 999, description: 'Unmounting existing cameras/DVR, packing, and re-installing at new premises.' }
    ],
    pricingRules: {
      baseCharge: 499,
      taxPercentage: 18,
      wirePricePerMeter: 35,
      indoorCharge: 0,
      outdoorCharge: 350
    }
  });

  const cctvMats = await seedMaterials(cctvSub._id, [
    { name: '3+1 Cable', price: 18, unit: 'meter' },
    { name: 'CAT6 Cable', price: 40, unit: 'meter' },
    { name: 'Camera Box', price: 60, unit: 'each' },
    { name: 'DVR', price: 8500, unit: 'each' },
    { name: 'NVR', price: 12000, unit: 'each' },
    { name: 'HDD', price: 3800, unit: 'each' },
    { name: 'Connector Set', price: 150, unit: 'each' },
    { name: 'SMPS', price: 650, unit: 'each' },
    { name: 'Labour', price: 15, unit: 'meter', isLabour: true }
  ]);

  // Update CCTV formSchema
  cctvSub.formSchema = {
    step1: {
      title: 'Step 1: Select CCTV Service Type',
      options: cctvSub.serviceTypes.map(t => ({ label: t.name, value: slugify(t.name), price: t.price, description: t.description }))
    },
    step2: {
      title: 'Step 2: Select Materials Required',
      options: cctvMats.map(m => ({ label: m.name, value: m.slug, price: m.price, unit: m.unit, isLabour: m.isLabour }))
    }
  };
  await cctvSub.save();


  // =========================================================================
  // 3. Network Setup / Office Network Deployment
  // =========================================================================
  const netSub = await upsertSubcategory({
    serviceId: services.network._id,
    categoryId: services.network._id, // Legacy compatibility
    name: 'Office Network Deployment',
    slug: 'office-network-deployment',
    shortDescription: 'Secure LAN, Wi-Fi planning, switching, and structured cabling.',
    overview: 'Full office networking rollout including LAN cabling, VLAN segmentation, switch setups, router configuration, and access point mapping.',
    suitableFor: ['Offices', 'Coworking Spaces', 'Retail Stores', 'Warehouses'],
    includedServices: ['Structured cabling audit', 'Device rack mounting', 'Firewall/Router baseline policies', 'Speed & coverage validation'],
    installationTime: '4-6 hours',
    warranty: '14-day workmanship warranty.',
    pricingStartsFrom: 1499,
    image: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1200&h=900&fit=crop',
    status: 'active',
    sortOrder: 2,
    serviceTypes: [
      { name: 'New Network Setup', price: 1499, description: 'Fresh deployment of office rack, switch, router, and endpoints.' },
      { name: 'Network Expansion', price: 999, description: 'Adding nodes, additional switches, or expanding AP coverage.' },
      { name: 'Office Relocation', price: 1999, description: 'Unmounting existing hardware, packing, and re-setting up in a new venue.' },
      { name: 'Structured Cabling', price: 1299, description: 'Patch panel punching, cable laying, and endpoint testing.' },
      { name: 'WiFi Deployment', price: 1099, description: 'Installing access points, controller setup, and guest network configuration.' },
      { name: 'Router Configuration', price: 899, description: 'VLAN, WAN interfaces, firewall rules, and DHCP configuration.' },
      { name: 'Switch Configuration', price: 799, description: 'Port allocation, link aggregation, and network segmentation.' },
      { name: 'Server Rack Setup', price: 1599, description: 'Mounting servers, patch panels, switches, and managing cabling bundles.' }
    ],
    pricingRules: {
      baseCharge: 1499,
      taxPercentage: 18
    }
  });

  const netMats = await seedMaterials(netSub._id, [
    { name: 'CAT6 Cable', price: 40, unit: 'meter' },
    { name: 'CAT6A Cable', price: 50, unit: 'meter' },
    { name: 'Patch Panel', price: 2400, unit: 'each' },
    { name: 'Patch Cord', price: 250, unit: 'each' },
    { name: 'Face Plate', price: 180, unit: 'each' },
    { name: 'Network Rack', price: 3800, unit: 'each' },
    { name: 'Router', price: 2900, unit: 'each' },
    { name: 'Managed Switch', price: 4500, unit: 'each' },
    { name: 'Access Point', price: 4200, unit: 'each' },
    { name: 'Labour', price: 25, unit: 'meter', isLabour: true }
  ]);

  netSub.formSchema = {
    step1: {
      title: 'Step 1: Select Network Service Type',
      options: netSub.serviceTypes.map(t => ({ label: t.name, value: slugify(t.name), price: t.price, description: t.description }))
    },
    step2: {
      title: 'Step 2: Select Materials Required',
      options: netMats.map(m => ({ label: m.name, value: m.slug, price: m.price, unit: m.unit, isLabour: m.isLabour }))
    }
  };
  await netSub.save();


  // =========================================================================
  // 4. Cyber Security / Managed Firewall Setup
  // =========================================================================
  const secSub = await upsertSubcategory({
    serviceId: services.security._id,
    categoryId: services.security._id, // Legacy compatibility
    name: 'Managed Firewall Setup',
    slug: 'managed-firewall-setup',
    shortDescription: 'Threat prevention, access rules, VPN, and policy hardening.',
    overview: 'Protect your business network with a professionally configured firewall, segmented access policies, VPN setup, and baseline security hardening.',
    suitableFor: ['SMB offices', 'E-commerce operations', 'Logistics warehouses'],
    includedServices: ['Firmware upgrades & backup', 'Threat protection configuration', 'Remote user VPN configuration', 'Admin handbook handover'],
    installationTime: '3-5 hours',
    warranty: '30-day workmanship support.',
    pricingStartsFrom: 2999,
    image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1200&h=900&fit=crop',
    status: 'active',
    sortOrder: 3,
    serviceTypes: [
      { name: 'Firewall Setup', price: 2999, description: 'Standard initialization, port mapping, and NAT configuration.' },
      { name: 'Firewall Migration', price: 3999, description: 'Porting security policies and VPN configurations to new hardware.' },
      { name: 'Endpoint Security', price: 1499, description: 'Centralized anti-ransomware deployment for office computers.' },
      { name: 'Antivirus Deployment', price: 999, description: 'Installing security software packages across work machines.' },
      { name: 'Security Audit', price: 5999, description: 'Policy review, firmware analysis, and password audit.' },
      { name: 'Vulnerability Assessment', price: 4999, description: 'Scanning local network for open ports and system vulnerabilities.' },
      { name: 'SOC Monitoring', price: 7999, description: 'Setup of network security log forwarding and real-time alert triage.' }
    ],
    pricingRules: {
      baseCharge: 2999,
      taxPercentage: 18
    }
  });

  const secMats = await seedMaterials(secSub._id, [
    { name: 'Firewall Appliance', price: 18500, unit: 'each' },
    { name: 'Security License', price: 4500, unit: 'each' },
    { name: 'Endpoint License', price: 1200, unit: 'each' },
    { name: 'Labour', price: 1500, unit: 'each', isLabour: true }
  ]);

  secSub.formSchema = {
    step1: {
      title: 'Step 1: Select Cyber Security Service Type',
      options: secSub.serviceTypes.map(t => ({ label: t.name, value: slugify(t.name), price: t.price, description: t.description }))
    },
    step2: {
      title: 'Step 2: Security Equipment & Licenses',
      options: secMats.map(m => ({ label: m.name, value: m.slug, price: m.price, unit: m.unit, isLabour: m.isLabour }))
    }
  };
  await secSub.save();


  // =========================================================================
  // 5. Hardware Repair / Laptop & Desktop Repair
  // =========================================================================
  const repairSub = await upsertSubcategory({
    serviceId: services.hardware._id,
    categoryId: services.hardware._id, // Legacy compatibility
    name: 'Laptop & Desktop Repair',
    slug: 'laptop-desktop-repair',
    shortDescription: 'Diagnosis, part replacement, OS fixes, and tune-ups.',
    overview: 'On-site repair and maintenance for workstations, laptops, printers, and office devices with clear diagnosis, service estimates, and performance optimization.',
    suitableFor: ['Remote teams', 'Students', 'Small offices'],
    includedServices: ['Basic troubleshooting', 'Transparent estimates', 'Device optimization', 'Service summary note'],
    installationTime: '1-3 hours',
    warranty: '90-day warranty on replaced spares.',
    pricingStartsFrom: 399,
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&h=900&fit=crop',
    status: 'active',
    sortOrder: 4,
    serviceTypes: [
      { name: 'Laptop Repair', price: 399, description: 'Keyboard, screen, port fixes, and general repairs.' },
      { name: 'Desktop Repair', price: 399, description: 'Power supply (SMPS), motherboard, or graphic card repairs.' },
      { name: 'Motherboard Repair', price: 850, description: 'IC replacements and power line soldering on laptop board.' },
      { name: 'SSD Upgrade', price: 150, description: 'Installation of high-speed NVMe or SATA SSD.' },
      { name: 'RAM Upgrade', price: 150, description: 'Increasing storage memory for faster multitasking.' },
      { name: 'OS Installation', price: 350, description: 'Clean OS install (Windows/Linux/Mac) with driver setup.' },
      { name: 'Data Recovery', price: 999, description: 'Extracting documents from corrupted hard drives.' }
    ],
    pricingRules: {
      baseCharge: 399,
      taxPercentage: 18
    }
  });

  const repairMats = await seedMaterials(repairSub._id, [
    { name: 'SSD', price: 2500, unit: 'each' },
    { name: 'RAM', price: 1600, unit: 'each' },
    { name: 'Battery', price: 2200, unit: 'each' },
    { name: 'Keyboard', price: 1200, unit: 'each' },
    { name: 'Adapter', price: 950, unit: 'each' },
    { name: 'Screen', price: 4500, unit: 'each' },
    { name: 'Labour', price: 300, unit: 'each', isLabour: true }
  ]);

  repairSub.formSchema = {
    step1: {
      title: 'Step 1: Select Hardware Repair Type',
      options: repairSub.serviceTypes.map(t => ({ label: t.name, value: slugify(t.name), price: t.price, description: t.description }))
    },
    step2: {
      title: 'Step 2: Select Replacement Spare Parts',
      options: repairMats.map(m => ({ label: m.name, value: m.slug, price: m.price, unit: m.unit, isLabour: m.isLabour }))
    }
  };
  await repairSub.save();


  // =========================================================================
  // 6. AMC Plans / Business AMC Plan
  // =========================================================================
  const amcSub = await upsertSubcategory({
    serviceId: services.amc._id,
    categoryId: services.amc._id, // Legacy compatibility
    name: 'Business AMC Plan',
    slug: 'business-amc-plan',
    shortDescription: 'Annual preventive maintenance with priority IT support.',
    overview: 'Keep your business IT healthy year-round with preventive visits, device audits, remote support, and incident response coverage designed for small and mid-sized teams.',
    suitableFor: ['SMBs', 'Schools', 'Clinics'],
    includedServices: ['Monthly health report', 'Preventive maintenance checklist', 'Asset tagging guidance', 'SLA-oriented support workflow'],
    installationTime: 'Yearly plan',
    warranty: 'Active for the contract year.',
    pricingStartsFrom: 14999,
    image: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200&h=900&fit=crop',
    status: 'active',
    sortOrder: 5,
    serviceTypes: [
      { name: 'Laptop AMC', price: 1499, description: 'Annual support contract per laptop machine.' },
      { name: 'Desktop AMC', price: 1499, description: 'Annual support contract per desktop workstation.' },
      { name: 'Network AMC', price: 2999, description: 'Annual maintenance of office router, switches, and access points.' },
      { name: 'CCTV AMC', price: 2499, description: 'Annual camera alignment, wiring checks, and DVR servicing.' },
      { name: 'Server AMC', price: 5999, description: 'Active Directory, NAS backup, and server health maintenance.' },
      { name: 'Enterprise AMC', price: 9999, description: 'Full coverage for endpoints, networks, and remote support SLAs.' }
    ],
    pricingRules: {
      baseCharge: 14999,
      taxPercentage: 18
    }
  });

  const amcMats = await seedMaterials(amcSub._id, [
    { name: 'AMC Coverage Items', price: 2500, unit: 'each' },
    { name: 'Spare Parts', price: 3500, unit: 'each' },
    { name: 'Labour', price: 1500, unit: 'each', isLabour: true }
  ]);

  amcSub.formSchema = {
    step1: {
      title: 'Step 1: Select AMC Service Type',
      options: amcSub.serviceTypes.map(t => ({ label: t.name, value: slugify(t.name), price: t.price, description: t.description }))
    },
    step2: {
      title: 'Step 2: Select Additional Coverage',
      options: amcMats.map(m => ({ label: m.name, value: m.slug, price: m.price, unit: m.unit, isLabour: m.isLabour }))
    }
  };
  await amcSub.save();


  // =========================================================================
  // 7. Fire Safety
  // =========================================================================
  const fireSub = await upsertSubcategory({
    serviceId: services.fire._id,
    categoryId: services.fire._id, // Legacy compatibility
    name: 'Fire Safety Services',
    slug: 'fire-safety-services',
    shortDescription: 'Alarm systems, extinguishers, and compliance visits.',
    overview: 'Ensure fire safety with professional smoke detectors, panel configurations, fire extinguisher mounting, testing, and compliance documentation.',
    suitableFor: ['Offices', 'Schools', 'Hospitals', 'Retail chains'],
    includedServices: ['Compliance checks', 'Extinguisher pressure validation', 'Alarm siren testing', 'Workmanship warranty'],
    installationTime: '2-4 hours',
    warranty: '1-year warranty on smoke detectors.',
    pricingStartsFrom: 1999,
    image: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200&h=900&fit=crop',
    status: 'active',
    sortOrder: 6,
    serviceTypes: [
      { name: 'Fire Alarm Installation', price: 2499, description: 'Wiring and mounting of central fire control panel.' },
      { name: 'Fire Alarm Maintenance', price: 1499, description: 'Sensors recalibration, backup battery check, and test drills.' },
      { name: 'Smoke Detector Installation', price: 499, description: 'Ceiling installation and connectivity setup for smoke sensors.' },
      { name: 'Fire Extinguisher Setup', price: 399, description: 'Mounting bracket fitment, pressure checks, and safety tagging.' },
      { name: 'Fire Safety Audit', price: 3499, description: 'Comprehensive site hazard checklist audit and signoff.' }
    ],
    pricingRules: {
      baseCharge: 1999,
      taxPercentage: 18
    }
  });

  const fireMats = await seedMaterials(fireSub._id, [
    { name: 'Smoke Detector', price: 850, unit: 'each' },
    { name: 'Fire Alarm Panel', price: 8500, unit: 'each' },
    { name: 'Fire Extinguisher', price: 1800, unit: 'each' },
    { name: 'Cabling', price: 35, unit: 'meter' },
    { name: 'Labour', price: 20, unit: 'meter', isLabour: true }
  ]);

  fireSub.formSchema = {
    step1: {
      title: 'Step 1: Select Fire Safety Service Type',
      options: fireSub.serviceTypes.map(t => ({ label: t.name, value: slugify(t.name), price: t.price, description: t.description }))
    },
    step2: {
      title: 'Step 2: Safety Equipments & Material Required',
      options: fireMats.map(m => ({ label: m.name, value: m.slug, price: m.price, unit: m.unit, isLabour: m.isLabour }))
    }
  };
  await fireSub.save();


  // =========================================================================
  // 8. ₹1 Payment Test Service
  // =========================================================================
  const testSub = await upsertSubcategory({
    serviceId: services.hardware._id,
    categoryId: services.hardware._id, // Legacy compatibility
    name: '₹1 Payment Test Service',
    slug: 'rupee-one-test-service',
    shortDescription: 'Test Razorpay integration with exactly ₹1 advance payment.',
    overview: 'This is a dummy service designed to test the end-to-end booking and Razorpay payment flow. The total price is ₹2, which results in a 50% advance payment of exactly ₹1.',
    suitableFor: ['Developers', 'Admins', 'QA Team'],
    includedServices: ['Full test flow verification', 'Zero impact on real operations'],
    installationTime: '10 mins',
    warranty: 'None',
    pricingStartsFrom: 2,
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&h=900&fit=crop',
    status: 'active',
    sortOrder: 7,
    serviceTypes: [
      { name: 'QA Test Run A', price: 2, description: 'Test booking with Rs. 2 grand total.' },
      { name: 'QA Test Run B', price: 4, description: 'Test booking with Rs. 4 grand total.' }
    ],
    pricingRules: {
      baseCharge: 2,
      taxPercentage: 0
    }
  });

  const testMats = await seedMaterials(testSub._id, [
    { name: 'Simulation Addon 1', price: 0, unit: 'checkbox' },
    { name: 'Simulation Addon 2', price: 0, unit: 'checkbox' }
  ]);

  testSub.formSchema = {
    step1: {
      title: 'Step 1: Select Test Option',
      options: testSub.serviceTypes.map(t => ({ label: t.name, value: slugify(t.name), price: t.price, description: t.description }))
    },
    step2: {
      title: 'Step 2: Select Test Addon (Free)',
      options: testMats.map(m => ({ label: m.name, value: m.slug, price: m.price, unit: m.unit, isLabour: m.isLabour }))
    }
  };
  await testSub.save();


  // =========================================================================
  // Extra Subcategories to avoid any 404 for admin / client flows
  // =========================================================================
  // Let's copy some from database to subcategories collection so old pages load
  const allSubmats = await ServiceSubcategory.find({}).lean();
  for (const item of allSubmats) {
    await CctvSubcategory.findOneAndUpdate(
      { slug: item.slug },
      { $set: item },
      { upsert: true }
    );
  }

  console.log('Seeded all dynamic service subcategories and materials successfully!');
  await mongoose.connection.close();
  console.log('Database connection closed safely.');
}

run().catch(async (err) => {
  console.error('[Seeding Error] Failed to seed services database:', err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
