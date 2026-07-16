const CctvCategory = require('../models/CctvCategory');
const CctvSubcategory = require('../models/CctvSubcategory');
const CctvCameraType = require('../models/CctvCameraType');
const CctvAddon = require('../models/CctvAddon');
const CctvPricingConfig = require('../models/CctvPricingConfig');

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

async function calculateCctvPrice(input = {}) {
  const Material = require('../models/Material');
  const slugify = (val = '') => String(val).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const config = await getActivePricingConfig();
  
  let subcategory = null;
  if (input.subcategoryId) {
    subcategory = await CctvSubcategory.findById(input.subcategoryId).lean();
  }
  if (!subcategory && input.subcategorySlug) {
    subcategory = await CctvSubcategory.findOne({ slug: input.subcategorySlug }).lean();
  }

  let category = null;
  if (input.categoryId) {
    category = await CctvCategory.findById(input.categoryId).lean();
  }
  if (!category && subcategory && subcategory.categoryId) {
    const CctvCategory = require('../models/CctvCategory');
    category = await CctvCategory.findById(subcategory.categoryId).lean();
  }

  // Handle custom dynamic pricing for Install New CCTV
  if (subcategory && subcategory.slug === 'install-new-cctv') {
    const propertyType = input.propertyType || '';
    const cameraTypes = Array.isArray(input.cameraTypes) ? input.cameraTypes : [];
    const installationRequired = input.installationRequired === true || input.installationRequired === 'Yes' || String(input.installationRequired).toLowerCase() === 'true';
    const cableType = input.cableType || 'CAT6';
    const cableLength = Math.max(Number(input.cableLength) || 0, 0);
    const dvrRequired = input.dvrRequired === true || input.dvrRequired === 'Yes' || String(input.dvrRequired).toLowerCase() === 'true';
    const nvrRequired = input.nvrRequired === true || input.nvrRequired === 'Yes' || String(input.nvrRequired).toLowerCase() === 'true';
    const networkRack = input.networkRack === true || input.networkRack === 'Yes' || String(input.networkRack).toLowerCase() === 'true';
    const monitorMounting = input.monitorMounting === true || input.monitorMounting === 'Yes' || String(input.monitorMounting).toLowerCase() === 'true';

    // 1. Camera Installation Charge: ₹400 * total cameras
    const totalCameras = cameraTypes.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const cameraInstallation = totalCameras * 400;

    // 2. Cabling Charge: CAT6 (₹60/m), 3+1 (₹18/m)
    let cableCharge = 0;
    if (installationRequired) {
      const is3Plus1 = String(cableType).includes('3+1');
      const rate = is3Plus1 ? 18 : 60;
      cableCharge = cableLength * rate;
    }

    // 3. DVR & NVR Charges: flat ₹1000 each
    const dvrCharge = dvrRequired ? 1000 : 0;
    const nvrCharge = nvrRequired ? 1000 : 0;

    // 4. Rack charge: +500
    const rackCharge = networkRack ? 500 : 0;

    // 5. Monitor mounting: +350
    const monitorCharge = monitorMounting ? 350 : 0;

    // Visit charge
    const visitCharge = Number(input.visitCharge) || 0;

    // Subtotal
    const subtotal = cameraInstallation + cableCharge + dvrCharge + nvrCharge + rackCharge + monitorCharge + visitCharge;

    // GST (18%)
    const gst = Math.round(subtotal * 0.18);

    // Grand Total
    const grandTotal = subtotal + gst;

    return {
      category: category ? { id: category._id, name: category.name, slug: category.slug } : undefined,
      subcategory: { id: subcategory._id, name: subcategory.name, slug: subcategory.slug },
      propertyType,
      cameraTypes,
      installationRequired,
      cableType,
      cableLength,
      dvrRequired,
      nvrRequired,
      networkRack,
      monitorMounting,
      priceBreakdown: {
        cameraInstallation,
        cableCharge,
        dvrCharge,
        nvrCharge,
        rackCharge,
        monitorCharge,
        visitCharge,
        subtotal,
        gst,
        grandTotal
      }
    };
  }

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


  // Load custom quantity mappings if provided in input
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

  // Set default pricing configuration
  let baseCharge = roundAmount(config.baseCharge);
  let taxPercentage = config.tax?.status === 'active' ? Number(config.tax.percentage) || 0 : 0;
  let wirePricePerMeter = roundAmount(config.wirePricePerMeter);
  let indoorCharge = roundAmount(config.indoorCharge);
  let outdoorCharge = roundAmount(config.outdoorCharge);

  // Apply subcategory pricing rules overrides if present
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

module.exports = {
  calculateCctvPrice,
  getActivePricingConfig,
};
