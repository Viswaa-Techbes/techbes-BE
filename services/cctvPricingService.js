const CctvCategory = require('../models/CctvCategory');
const CctvSubcategory = require('../models/CctvSubcategory');
const CctvCameraType = require('../models/CctvCameraType');
const CctvAddon = require('../models/CctvAddon');
const CctvPricingConfig = require('../models/CctvPricingConfig');

const CctvBrand = require('../models/CctvBrand');
const CctvModel = require('../models/CctvModel');
const CctvSdCard = require('../models/CctvSdCard');
const CctvInstallationCharge = require('../models/CctvInstallationCharge');
const CctvCablePricing = require('../models/CctvCablePricing');
const CctvAccessory = require('../models/CctvAccessory');

function roundAmount(value) {
  return Math.max(Math.round((Number(value) || 0) * 100) / 100, 0);
}

function adjustmentAmount(adjustment, subtotal) {
  if (!adjustment || adjustment.status !== 'active') return 0;
  if (adjustment.type === 'percentage') return roundAmount((subtotal * (Number(adjustment.value) || 0)) / 100);
  if (adjustment.type === 'flat') return roundAmount(adjustment.value);
  return 0;
}

async function getActivePricingConfig() {
  let config = await CctvPricingConfig.findOne({ status: 'active' }).sort({ updatedAt: -1 }).lean();
  if (!config) {
    config = await CctvPricingConfig.create({
      baseCharge: 499,
      indoorCharge: 0,
      outdoorCharge: 350,
      wirePricePerMeter: 35,
      tax: { label: 'GST', percentage: 18, status: 'active' },
    });
    config = config.toObject();
  }
  return config;
}

async function calculateLegacyCctvPrice(input = {}, config) {
  const Material = require('../models/Material');
  const slugify = (val = '') => String(val).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const [category, subcategory] = await Promise.all([
    input.categoryId ? CctvCategory.findById(input.categoryId).lean() : null,
    input.subcategoryId ? CctvSubcategory.findById(input.subcategoryId).lean() : null,
  ]);

  let cameraType = null;
  let selectedServiceType = null;

  if (subcategory && subcategory.serviceTypes && subcategory.serviceTypes.length > 0) {
    selectedServiceType = subcategory.serviceTypes.find(
      (t) => String(t._id) === String(input.cameraTypeId) || t.name === input.cameraTypeId || slugify(t.name) === input.cameraTypeId
    );
  }

  if (!selectedServiceType && input.cameraTypeId) {
    cameraType = await CctvCameraType.findById(input.cameraTypeId).lean();
    if (!cameraType) {
      cameraType = await CctvCameraType.findOne({ slug: input.cameraTypeId }).lean();
    }
  }

  if (!cameraType && !selectedServiceType) {
    const defaultCameraType = await CctvCameraType.findOne({ status: 'active' }).sort({ sortOrder: 1 }).lean();
    if (defaultCameraType) {
      cameraType = defaultCameraType;
    }
  }

  let cameraUnitPrice = 0;
  let serviceTypeName = '';
  let serviceTypeSlug = '';
  let serviceTypeId = '';

  if (selectedServiceType) {
    cameraUnitPrice = roundAmount(selectedServiceType.price);
    serviceTypeName = selectedServiceType.name;
    serviceTypeSlug = slugify(selectedServiceType.name);
    serviceTypeId = String(selectedServiceType._id);
  } else if (cameraType) {
    cameraUnitPrice = roundAmount(cameraType.installationPrice);
    serviceTypeName = cameraType.name;
    serviceTypeSlug = cameraType.slug;
    serviceTypeId = String(cameraType._id);
  } else {
    const error = new Error('Active service type is required');
    error.statusCode = 400;
    throw error;
  }

  const cameraCount = Math.max(Number(input.cameraCount) || 0, 0);
  const wireLength = Math.max(Number(input.wireLength) || 0, 0);
  const installationArea = input.installationArea === 'outdoor' ? 'outdoor' : 'indoor';
  const addonIds = Array.isArray(input.addonIds) ? input.addonIds : [];

  const ServiceMaterial = require('../models/ServiceMaterial');
  const addons = [];
  if (addonIds.length) {
    const [cctvAddons, dbMaterials, serviceMaterials] = await Promise.all([
      CctvAddon.find({ _id: { $in: addonIds }, status: 'active' }).lean(),
      Material.find({ _id: { $in: addonIds }, status: 'active' }).lean(),
      ServiceMaterial.find({ _id: { $in: addonIds }, status: 'active' }).lean(),
    ]);
    const combined = [...cctvAddons, ...dbMaterials, ...serviceMaterials];
    const seen = new Set();
    for (const item of combined) {
      const idStr = String(item._id);
      if (!seen.has(idStr)) {
        seen.add(idStr);
        addons.push(item);
      }
    }
  }

  const addonQtyMap = {};
  const inputMaterials = input.materials || input.selectedMaterials || [];
  if (Array.isArray(inputMaterials)) {
    for (const m of inputMaterials) {
      const idVal = m.addonId || m.id;
      if (idVal) {
        addonQtyMap[String(idVal)] = Number(m.qty) || 1;
      }
    }
  }

  let baseCharge = roundAmount(config.baseCharge);
  let taxPercentage = config.tax?.status === 'active' ? Number(config.tax.percentage) || 0 : 0;
  let wirePricePerMeter = roundAmount(config.wirePricePerMeter);
  let indoorCharge = roundAmount(config.indoorCharge);
  let outdoorCharge = roundAmount(config.outdoorCharge);

  if (subcategory && subcategory.pricingRules) {
    const r = subcategory.pricingRules;
    if (typeof r.baseCharge === 'number') baseCharge = roundAmount(r.baseCharge);
    if (typeof r.taxPercentage === 'number') taxPercentage = Number(r.taxPercentage);
    if (typeof r.wirePricePerMeter === 'number') wirePricePerMeter = roundAmount(r.wirePricePerMeter);
    if (typeof r.indoorCharge === 'number') indoorCharge = roundAmount(r.indoorCharge);
    if (typeof r.outdoorCharge === 'number') outdoorCharge = roundAmount(r.outdoorCharge);
  }

  const cameraTotal = roundAmount(cameraCount * cameraUnitPrice);
  const areaCharge = installationArea === 'outdoor' ? outdoorCharge : indoorCharge;
  const wireTotal = roundAmount(wireLength * wirePricePerMeter);

  const selectedAddons = addons.map((addon) => {
    const qty = addonQtyMap[String(addon._id)] || 1;
    const price = roundAmount(addon.price);
    return {
      id: addon._id,
      name: addon.name,
      slug: addon.slug,
      price: price,
      quantity: qty,
      total: roundAmount(price * qty),
    };
  });

  const addonsTotal = roundAmount(selectedAddons.reduce((sum, addon) => sum + addon.total, 0));
  const subtotal = roundAmount(baseCharge + cameraTotal + areaCharge + wireTotal + addonsTotal);
  const discountTotal = Math.min(adjustmentAmount(config.discount, subtotal), subtotal);
  const afterDiscount = roundAmount(subtotal - discountTotal);
  const couponTotal = input.couponCode && config.coupon?.code === String(input.couponCode).toUpperCase()
    ? Math.min(adjustmentAmount(config.coupon, afterDiscount), afterDiscount)
    : 0;
  const afterCoupon = roundAmount(afterDiscount - couponTotal);
  const offerAdjustment = config.offer?.status === 'active' && Number(config.offer.offerPrice) > 0 && Number(config.offer.offerPrice) < afterCoupon
    ? roundAmount(afterCoupon - Number(config.offer.offerPrice))
    : 0;
  const taxableAmount = roundAmount(afterCoupon - offerAdjustment);
  const taxTotal = taxPercentage > 0
    ? roundAmount((taxableAmount * taxPercentage) / 100)
    : 0;
  const grandTotal = roundAmount(taxableAmount + taxTotal);

  return {
    category: category ? { id: category._id, name: category.name, slug: category.slug } : undefined,
    subcategory: subcategory ? { id: subcategory._id, name: subcategory.name, slug: subcategory.slug } : undefined,
    cameraType: {
      id: serviceTypeId,
      name: serviceTypeName,
      slug: serviceTypeSlug,
      unitPrice: cameraUnitPrice,
    },
    cameraCount,
    installationArea,
    wireLength,
    addons: selectedAddons,
    priceBreakdown: {
      baseCharge,
      cameraUnitPrice,
      cameraCount,
      cameraTotal,
      indoorCharge,
      outdoorCharge,
      areaCharge,
      wireLength,
      wirePricePerMeter,
      wireTotal,
      addonsTotal,
      discountTotal,
      couponTotal,
      offerAdjustment,
      taxableAmount,
      taxTotal,
      grandTotal,
    },
  };
}

async function calculateCctvPrice(input = {}) {
  const config = await getActivePricingConfig();

  // Fallback to legacy structure if cameraTypes is not passed or looks like legacy input
  if (!Array.isArray(input.cameraTypes) && (input.cameraTypeId || input.cameraCount || input.wireLength || input.addonIds)) {
    return calculateLegacyCctvPrice(input, config);
  }

  // New database-driven pricing structure
  const propertyType = input.propertyType || 'Home';
  const inputCameras = input.cameraTypes || []; // Array of { type, brandId, modelId, quantity }
  const installationRequired = !!input.installationRequired;
  const cableType = input.cableType;
  const cableLength = Math.max(Number(input.cableLength) || 0, 0);
  const dvrRequired = !!input.dvrRequired;
  const nvrRequired = !!input.nvrRequired;
  const networkRack = !!input.networkRack;
  const monitorMounting = !!input.monitorMounting;
  const sdCardRequired = !!input.sdCardRequired;
  const sdCardCapacity = input.sdCardCapacity;
  const sdCardQuantity = Math.max(Number(input.sdCardQuantity) || 0, 0);

  let cameraTotal = 0;
  let totalCameraCount = 0;
  const cameraDetails = [];

  for (const cam of inputCameras) {
    const qty = Math.max(Number(cam.quantity) || 0, 0);
    if (qty <= 0) continue;

    let unitPrice = 0;
    let brandName = 'Unknown';
    let modelName = 'Unknown';
    let resolution = 'Unknown';

    if (cam.modelId) {
      const dbModel = await CctvModel.findById(cam.modelId).populate('brandId').lean();
      if (dbModel) {
        unitPrice = dbModel.price;
        modelName = dbModel.name;
        resolution = dbModel.resolution;
        if (dbModel.brandId) {
          brandName = dbModel.brandId.name;
        }
      }
    }

    const itemTotal = unitPrice * qty;
    cameraTotal += itemTotal;
    totalCameraCount += qty;

    cameraDetails.push({
      type: cam.type,
      brand: brandName,
      model: `${resolution} ${modelName}`,
      quantity: qty,
      unitPrice,
      totalPrice: itemTotal
    });
  }

  // Installation charges (Camera Fitting)
  let installationTotal = 0;
  let fittingUnitPrice = 0;
  if (totalCameraCount > 0) {
    const fittingCharge = await CctvInstallationCharge.findOne({ name: 'Camera Fitting', status: 'active' }).lean();
    fittingUnitPrice = fittingCharge ? fittingCharge.price : 400; // fallback ₹400
    installationTotal = totalCameraCount * fittingUnitPrice;
  }

  // Cable charges
  let cableTotal = 0;
  let cableUnitPrice = 0;
  if (installationRequired && cableLength > 0 && cableType) {
    const dbCable = await CctvCablePricing.findOne({ name: cableType, status: 'active' }).lean();
    cableUnitPrice = dbCable ? dbCable.price : 0;
    if (cableType === 'CAT6 Cable') {
      cableUnitPrice = 50;
    }
    cableTotal = cableLength * cableUnitPrice;
  }

  // Accessories (DVR, NVR, Rack, Monitor)
  let dvrTotal = 0;
  if (dvrRequired) {
    const dbAcc = await CctvAccessory.findOne({ name: 'DVR Installation', status: 'active' }).lean();
    dvrTotal = dbAcc ? dbAcc.price : 1000;
  }

  let nvrTotal = 0;
  if (nvrRequired) {
    const dbAcc = await CctvAccessory.findOne({ name: 'NVR Installation', status: 'active' }).lean();
    nvrTotal = dbAcc ? dbAcc.price : 1000;
  }

  let rackTotal = 0;
  if (networkRack) {
    const dbAcc = await CctvAccessory.findOne({ name: 'Network Rack Mount', status: 'active' }).lean();
    rackTotal = dbAcc ? dbAcc.price : 500;
  }

  let monitorTotal = 0;
  if (monitorMounting) {
    const dbAcc = await CctvAccessory.findOne({ name: 'Monitor Mount', status: 'active' }).lean();
    monitorTotal = dbAcc ? dbAcc.price : 350;
  }

  // SD Card pricing
  let sdCardTotal = 0;
  let sdCardUnitPrice = 0;
  if (sdCardRequired && sdCardQuantity > 0 && sdCardCapacity) {
    const dbSd = await CctvSdCard.findOne({ capacity: sdCardCapacity, status: 'active' }).lean();
    sdCardUnitPrice = dbSd ? dbSd.price : 0;
    sdCardTotal = sdCardQuantity * sdCardUnitPrice;
  }

  // Visit charges
  const visitCharge = config.baseCharge || 499;

  // Subtotal
  const subtotal = cameraTotal + installationTotal + cableTotal + dvrTotal + nvrTotal + rackTotal + monitorTotal + sdCardTotal + visitCharge;
  
  // Tax
  const gstPercent = config.tax?.status === 'active' ? Number(config.tax.percentage) || 0 : 18;
  const gstTotal = Math.round((subtotal * gstPercent) / 100);
  
  // Grand Total
  const grandTotal = subtotal + gstTotal;

  const result = {
    propertyType,
    cameraDetails,
    installation: {
      quantity: totalCameraCount,
      unitPrice: fittingUnitPrice,
      totalPrice: installationTotal
    },
    cable: {
      type: cableType || 'None',
      length: cableLength,
      unitPrice: cableUnitPrice,
      totalPrice: cableTotal
    },
    dvrTotal,
    nvrTotal,
    rackTotal,
    monitorTotal,
    sdCard: {
      required: sdCardRequired,
      capacity: sdCardCapacity || '',
      quantity: sdCardQuantity,
      unitPrice: sdCardUnitPrice,
      totalPrice: sdCardTotal
    },
    visitCharge,
    priceBreakdown: {
      baseCharge: visitCharge,
      cameraTotal,
      installationTotal,
      cableTotal,
      dvrTotal,
      nvrTotal,
      rackTotal,
      monitorTotal,
      sdCardTotal,
      subtotal,
      taxTotal: gstTotal,
      grandTotal
    }
  };

  return result;
}

module.exports = {
  calculateCctvPrice,
  getActivePricingConfig,
};
