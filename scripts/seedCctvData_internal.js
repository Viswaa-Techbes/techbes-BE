const mongoose = require('mongoose');
const CctvBrand = require('../models/CctvBrand');
const CctvModel = require('../models/CctvModel');
const CctvSdCard = require('../models/CctvSdCard');
const CctvInstallationCharge = require('../models/CctvInstallationCharge');
const CctvCablePricing = require('../models/CctvCablePricing');
const CctvAccessory = require('../models/CctvAccessory');
const CctvPricingConfig = require('../models/CctvPricingConfig');

const brandsData = ['CP Plus', 'Secureye', 'Mikam', 'Hikvision'];

const sdCardsData = [
  { capacity: '32GB', price: 750 },
  { capacity: '64GB', price: 950 },
  { capacity: '128GB', price: 1900 },
  { capacity: '256GB', price: 3600 },
];

const cablesData = [
  { name: 'CAT6 Cable', price: 50 },
  { name: '3+1 CCTV Cable', price: 18 },
];

const installationChargesData = [
  { name: 'Camera Fitting', price: 400 },
];

const accessoriesData = [
  { name: 'DVR Installation', price: 1000 },
  { name: 'NVR Installation', price: 1000 },
  { name: 'Network Rack Mount', price: 500 },
  { name: 'Monitor Mount', price: 350 },
];

async function seedCctvDataInternal() {
  try {
    console.log('Starting internal CCTV database seeding...');

    // 1. Seed Brands
    const seededBrands = {};
    for (const bName of brandsData) {
      let b = await CctvBrand.findOne({ name: bName });
      if (!b) {
        b = await CctvBrand.create({ name: bName, status: 'active' });
        console.log(`[Seed] Seeded Brand: ${bName}`);
      }
      seededBrands[bName] = b._id;
    }

    // 2. Seed Models & Camera Pricing
    const cpSecureyeModels = [
      // IP Camera
      { cameraType: 'IP Camera', name: 'Normal', resolution: '2MP', price: 2350 },
      { cameraType: 'IP Camera', name: 'Normal', resolution: '4MP', price: 3500 },
      { cameraType: 'IP Camera', name: 'Hybrid', resolution: '2MP', price: 3000 },
      { cameraType: 'IP Camera', name: 'Hybrid', resolution: '4MP', price: 4300 },
      // Wifi Indoor
      { cameraType: 'WiFi Indoor Camera', name: 'Normal', resolution: '2MP', price: 2800 },
      { cameraType: 'WiFi Indoor Camera', name: 'Normal', resolution: '4MP', price: 4800 },
      // Wifi Outdoor
      { cameraType: 'WiFi Outdoor Camera', name: 'Normal', resolution: '3MP', price: 3950 },
      { cameraType: 'WiFi Outdoor Camera', name: 'Normal', resolution: '5MP', price: 4900 },
      // 4G Camera
      { cameraType: '4G Camera', name: 'Fixed', resolution: '2MP', price: 2600 },
      { cameraType: '4G Camera', name: 'PT', resolution: '3MP', price: 3800 },
      // Solar Camera
      { cameraType: 'Solar Camera', name: 'Single Lens', resolution: '3MP', price: 8000 },
      { cameraType: 'Solar Camera', name: 'Dual Lens', resolution: '3MP', price: 10000 },
      { cameraType: 'Solar Camera', name: 'Quad Lens', resolution: '3MP', price: 14000 },
    ];

    const mikamModels = [
      { cameraType: 'IP Camera', name: 'Hybrid + Smart', resolution: '5MP', price: 3500 },
    ];

    const hikvisionModels = [
      { cameraType: 'Analog Camera', name: 'Analog Only', resolution: '2MP', price: 1200 },
      { cameraType: 'Analog Camera', name: 'Analog Only', resolution: '5MP', price: 2350 },
    ];

    async function insertModels(brandId, modelList) {
      for (const m of modelList) {
        const existing = await CctvModel.findOne({
          brandId,
          cameraType: m.cameraType,
          name: m.name,
          resolution: m.resolution,
        });
        if (!existing) {
          await CctvModel.create({
            brandId,
            ...m,
            status: 'active',
          });
          console.log(`[Seed] Seeded Model: ${m.cameraType} - ${m.name} (${m.resolution})`);
        }
      }
    }

    if (seededBrands['CP Plus']) await insertModels(seededBrands['CP Plus'], cpSecureyeModels);
    if (seededBrands['Secureye']) await insertModels(seededBrands['Secureye'], cpSecureyeModels);
    if (seededBrands['Mikam']) await insertModels(seededBrands['Mikam'], mikamModels);
    if (seededBrands['Hikvision']) await insertModels(seededBrands['Hikvision'], hikvisionModels);

    // 3. Seed SD Cards
    for (const sd of sdCardsData) {
      const existing = await CctvSdCard.findOne({ capacity: sd.capacity });
      if (!existing) {
        await CctvSdCard.create({ ...sd, status: 'active' });
        console.log(`[Seed] Seeded SD Card: ${sd.capacity} -> ₹${sd.price}`);
      }
    }

    // 4. Seed Cable Pricing
    for (const c of cablesData) {
      let existing = await CctvCablePricing.findOne({ name: c.name });
      if (!existing) {
        await CctvCablePricing.create({ ...c, status: 'active' });
        console.log(`[Seed] Seeded Cable: ${c.name} -> ₹${c.price}`);
      } else {
        existing.price = c.price;
        await existing.save();
        console.log(`[Seed] Updated Cable Price: ${c.name} -> ₹${c.price}`);
      }
    }

    // 5. Seed Installation Charges
    for (const ic of installationChargesData) {
      const existing = await CctvInstallationCharge.findOne({ name: ic.name });
      if (!existing) {
        await CctvInstallationCharge.create({ ...ic, status: 'active' });
        console.log(`[Seed] Seeded Installation Charge: ${ic.name} -> ₹${ic.price}`);
      }
    }

    // 6. Seed Accessories
    for (const acc of accessoriesData) {
      const existing = await CctvAccessory.findOne({ name: acc.name });
      if (!existing) {
        await CctvAccessory.create({ ...acc, status: 'active' });
        console.log(`[Seed] Seeded Accessory: ${acc.name} -> ₹${acc.price}`);
      }
    }

    // 7. Seed/Update Pricing Config
    let config = await CctvPricingConfig.findOne({ status: 'active' });
    if (!config) {
      await CctvPricingConfig.create({
        baseCharge: 499,
        indoorCharge: 0,
        outdoorCharge: 350,
        wirePricePerMeter: 60,
        tax: { label: 'GST', percentage: 18, status: 'active' },
        status: 'active',
      });
      console.log('[Seed] Seeded Default CctvPricingConfig');
    }

    console.log('Internal CCTV database seeding completed successfully!');
  } catch (err) {
    console.error('Internal CCTV database seeding failed:', err);
  }
}

module.exports = seedCctvDataInternal;
