const CctvCategory = require('../../models/CctvCategory');
const CctvSubcategory = require('../../models/CctvSubcategory');
const CctvCameraType = require('../../models/CctvCameraType');
const CctvAddon = require('../../models/CctvAddon');
const CctvProduct = require('../../models/CctvProduct');
const CctvPricingConfig = require('../../models/CctvPricingConfig');
const CctvBrand = require('../../models/CctvBrand');
const CctvModel = require('../../models/CctvModel');
const CctvSdCard = require('../../models/CctvSdCard');
const CctvInstallationCharge = require('../../models/CctvInstallationCharge');
const CctvCablePricing = require('../../models/CctvCablePricing');
const CctvAccessory = require('../../models/CctvAccessory');
const { calculateCctvPrice, getActivePricingConfig } = require('../../services/cctvPricingService');

function slugify(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function withSlug(body) {
  return { ...body, slug: body.slug ? slugify(body.slug) : slugify(body.name) };
}

async function listCategories(req, res, next) {
  try {
    const query = req.user?.role === 'admin' ? {} : { status: 'active' };
    const data = await CctvCategory.find(query).sort({ sortOrder: 1, name: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function listSubcategories(req, res, next) {
  try {
    const query = req.user?.role === 'admin' ? {} : { status: 'active' };
    if (req.query.categoryId) query.categoryId = req.query.categoryId;
    const data = await CctvSubcategory.find(query)
      .populate('categoryId', 'name slug')
      .populate('supportedProducts')
      .populate('supportedAddons')
      .populate('supportedSpareParts')
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getSubcategoryBySlug(req, res, next) {
  try {
    const item = await CctvSubcategory.findOne({ slug: req.params.slug, status: 'active' })
      .populate('categoryId', 'name slug')
      .populate('supportedProducts')
      .populate('supportedAddons')
      .populate('supportedSpareParts')
      .lean();
    if (!item) return res.status(404).json({ success: false, message: 'CCTV service not found' });
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
}

async function listCameraTypes(req, res, next) {
  try {
    const query = req.user?.role === 'admin' ? {} : { status: 'active' };
    const data = await CctvCameraType.find(query).sort({ sortOrder: 1, name: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function listAddons(req, res, next) {
  try {
    const query = req.user?.role === 'admin' ? {} : { status: 'active' };
    const data = await CctvAddon.find(query).sort({ sortOrder: 1, name: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function listProducts(req, res, next) {
  try {
    const query = req.user?.role === 'admin' ? {} : { status: 'active' };
    const data = await CctvProduct.find(query).sort({ sortOrder: 1, name: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getPricingConfig(req, res, next) {
  try {
    const data = await getActivePricingConfig();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function calculatePrice(req, res, next) {
  try {
    const data = await calculateCctvPrice(req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

function crud(Model) {
  return {
    async create(req, res, next) {
      try {
        const data = await Model.create(withSlug(req.body));
        res.status(201).json({ success: true, data });
      } catch (err) { next(err); }
    },
    async update(req, res, next) {
      try {
        const body = req.body.name || req.body.slug ? withSlug(req.body) : req.body;
        const data = await Model.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
        if (!data) return res.status(404).json({ success: false, message: 'Item not found' });
        res.json({ success: true, data });
      } catch (err) { next(err); }
    },
    async remove(req, res, next) {
      try {
        const data = await Model.findByIdAndUpdate(req.params.id, { status: 'inactive' }, { new: true });
        if (!data) return res.status(404).json({ success: false, message: 'Item not found' });
        res.json({ success: true, data });
      } catch (err) { next(err); }
    },
  };
}

async function upsertPricingConfig(req, res, next) {
  try {
    const existing = await CctvPricingConfig.findOne().sort({ updatedAt: -1 });
    const data = existing
      ? await CctvPricingConfig.findByIdAndUpdate(existing._id, req.body, { new: true, runValidators: true })
      : await CctvPricingConfig.create(req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getServiceConfig(req, res, next) {
  try {
    const mongoose = require('mongoose');
    const ServiceSubcategory = require('../../models/ServiceSubcategory');
    const CctvSubcategory = require('../../models/CctvSubcategory');
    const ServiceMaterial = require('../../models/ServiceMaterial');
    const { serviceId } = req.params;

    let query = {};
    if (mongoose.Types.ObjectId.isValid(serviceId)) {
      query = { _id: serviceId };
    } else {
      let lookupSlug = serviceId.toLowerCase();
      if (lookupSlug === 'laptop-desktop-repair' || lookupSlug === 'laptop-service') {
        query = { slug: { $in: ['laptop-desktop-repair', 'laptop-service'] } };
      } else if (lookupSlug === 'cyber-security' || lookupSlug === 'managed-firewall-setup') {
        query = { slug: { $in: ['cyber-security', 'managed-firewall-setup'] } };
      } else if (lookupSlug === 'fire-safety' || lookupSlug === 'fire-safety-services' || lookupSlug === 'fire-alarm-installation') {
        query = { slug: { $in: ['fire-safety', 'fire-safety-services', 'fire-alarm-installation'] } };
      } else if (lookupSlug === 'network-setup' || lookupSlug === 'office-network-deployment') {
        query = { slug: { $in: ['network-setup', 'office-network-deployment'] } };
      } else if (lookupSlug === 'amc-services' || lookupSlug === 'business-amc-plan') {
        query = { slug: { $in: ['amc-services', 'business-amc-plan'] } };
      } else {
        query = { slug: lookupSlug };
      }
    }

    let subcategory = await ServiceSubcategory.findOne(query).lean();
    if (!subcategory) {
      subcategory = await CctvSubcategory.findOne(query).lean();
    }
    
    // If still not found, fallback to a stub so UI doesn't crash on config fetch
    if (!subcategory) {
      subcategory = { _id: mongoose.Types.ObjectId.isValid(serviceId) ? serviceId : new mongoose.Types.ObjectId(), slug: req.params.serviceId };
    }

    const materials = await ServiceMaterial.find({ subcategoryId: subcategory._id, status: 'active' }).lean();

    const result = {
      serviceTypes: subcategory.serviceTypes || [],
      materials: materials.map(m => ({
        id: String(m._id),
        name: m.name,
        slug: m.slug,
        price: m.price,
        unit: m.unit || 'each',
        image: m.image || '',
        description: m.description || '',
        isLabour: m.isLabour || false
      })),
      labourCharges: materials.filter(m => m.isLabour).map(m => ({
        id: String(m._id),
        name: m.name,
        price: m.price,
        unit: m.unit || 'each'
      })),
      pricingRules: subcategory.pricingRules || {}
    };

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getServiceById(req, res, next) {
  try {
    const mongoose = require('mongoose');
    const ServiceSubcategory = require('../../models/ServiceSubcategory');
    const CctvSubcategory = require('../../models/CctvSubcategory');
    const { id } = req.params;

    let query = {};
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id };
    } else {
      let lookupSlug = id.toLowerCase();
      if (lookupSlug === 'laptop-desktop-repair' || lookupSlug === 'laptop-service') {
        query = { slug: { $in: ['laptop-desktop-repair', 'laptop-service'] } };
      } else if (lookupSlug === 'cyber-security' || lookupSlug === 'managed-firewall-setup') {
        query = { slug: { $in: ['cyber-security', 'managed-firewall-setup'] } };
      } else if (lookupSlug === 'fire-safety' || lookupSlug === 'fire-safety-services' || lookupSlug === 'fire-alarm-installation') {
        query = { slug: { $in: ['fire-safety', 'fire-safety-services', 'fire-alarm-installation'] } };
      } else if (lookupSlug === 'network-setup' || lookupSlug === 'office-network-deployment') {
        query = { slug: { $in: ['network-setup', 'office-network-deployment'] } };
      } else if (lookupSlug === 'amc-services' || lookupSlug === 'business-amc-plan') {
        query = { slug: { $in: ['amc-services', 'business-amc-plan'] } };
      } else {
        query = { slug: lookupSlug };
      }
    }

    let subcategory = await ServiceSubcategory.findOne(query)
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug')
      .lean();

    if (!subcategory) {
      subcategory = await CctvSubcategory.findOne(query)
        .populate('categoryId', 'name slug')
        .lean();
    }

    if (!subcategory) {
      // Fallback
      subcategory = { _id: mongoose.Types.ObjectId.isValid(id) ? id : new mongoose.Types.ObjectId(), slug: req.params.id, name: req.params.id };
    }

    res.json({ success: true, data: subcategory });
  } catch (err) {
    next(err);
  }
}

async function listBrands(req, res, next) {
  try {
    const query = req.user?.role === 'admin' ? {} : { status: 'active' };
    const data = await CctvBrand.find(query).sort({ name: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function listModels(req, res, next) {
  try {
    const query = req.user?.role === 'admin' ? {} : { status: 'active' };
    if (req.query.brandId) query.brandId = req.query.brandId;
    if (req.query.cameraType) query.cameraType = req.query.cameraType;
    const data = await CctvModel.find(query).populate('brandId', 'name').sort({ price: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function listSdCards(req, res, next) {
  try {
    const query = req.user?.role === 'admin' ? {} : { status: 'active' };
    const data = await CctvSdCard.find(query).sort({ price: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function listInstallationCharges(req, res, next) {
  try {
    const query = req.user?.role === 'admin' ? {} : { status: 'active' };
    const data = await CctvInstallationCharge.find(query).sort({ name: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function listCablePricings(req, res, next) {
  try {
    const query = req.user?.role === 'admin' ? {} : { status: 'active' };
    const data = await CctvCablePricing.find(query).sort({ name: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function listAccessories(req, res, next) {
  try {
    const query = req.user?.role === 'admin' ? {} : { status: 'active' };
    const data = await CctvAccessory.find(query).sort({ name: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

module.exports = {
  listCategories,
  listSubcategories,
  getSubcategoryBySlug,
  listCameraTypes,
  listAddons,
  listProducts,
  getPricingConfig,
  calculatePrice,
  getServiceConfig,
  getServiceById,
  listBrands,
  listModels,
  listSdCards,
  listInstallationCharges,
  listCablePricings,
  listAccessories,
  categoryAdmin: crud(CctvCategory),
  subcategoryAdmin: crud(CctvSubcategory),
  cameraTypeAdmin: crud(CctvCameraType),
  addonAdmin: crud(CctvAddon),
  productAdmin: crud(CctvProduct),
  brandAdmin: crud(CctvBrand),
  modelAdmin: crud(CctvModel),
  sdCardAdmin: crud(CctvSdCard),
  installationChargeAdmin: crud(CctvInstallationCharge),
  cablePricingAdmin: crud(CctvCablePricing),
  accessoryAdmin: crud(CctvAccessory),
  upsertPricingConfig,
};

