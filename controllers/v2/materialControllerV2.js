const ServiceMaterial = require('../../models/ServiceMaterial');
const { Types } = require('mongoose');

async function listMaterials(req, res, next) {
  try {
    const query = req.user?.role === 'admin' ? {} : { status: 'active' };
    if (req.query.subcategoryId) {
      query.subcategoryId = req.query.subcategoryId;
    }
    const data = await ServiceMaterial.find(query).sort({ name: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getMaterial(req, res, next) {
  try {
    const m = await ServiceMaterial.findById(req.params.id).lean();
    if (!m) return res.status(404).json({ success: false, message: 'Material not found' });
    res.json({ success: true, data: m });
  } catch (err) {
    next(err);
  }
}

function slugify(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function crud() {
  return {
    async create(req, res, next) {
      try {
        const payload = { ...req.body };
        if (!payload.slug) {
          payload.slug = slugify(payload.name);
        }
        const data = await ServiceMaterial.create(payload);
        res.status(201).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
    async update(req, res, next) {
      try {
        const payload = { ...req.body };
        if (payload.name && !payload.slug) {
          payload.slug = slugify(payload.name);
        }
        const data = await ServiceMaterial.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
        if (!data) return res.status(404).json({ success: false, message: 'Material not found' });
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
    async remove(req, res, next) {
      try {
        const data = await ServiceMaterial.findByIdAndUpdate(req.params.id, { status: 'inactive' }, { new: true });
        if (!data) return res.status(404).json({ success: false, message: 'Material not found' });
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
  };
}

module.exports = {
  listMaterials,
  getMaterial,
  admin: crud(),
};
