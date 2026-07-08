const express = require('express');
const router = express.Router();
const Category = require('../../models/Category');
const SubCategory = require('../../models/SubCategory');

// ─── Public Catalog Endpoints ─────────────────────────────────────────────────

// Dynamic Auto-Seeding Trigger Helper
const ensureSeeded = async () => {
  try {
    const { runSeed } = require('../../utils/catalogSeeder');
    await runSeed();
  } catch (err) {
    console.error("Auto-seeding check failed:", err.message);
  }
};


// GET /api/v2/catalog/categories
router.get('/categories', async (req, res) => {
  try {
    await ensureSeeded();
    const categories = await Category.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// GET /api/v2/catalog/categories/:slug
router.get('/categories/:slug', async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/catalog/categories/:slug/subcategories
router.get('/categories/:slug/subcategories', async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    const subcategories = await SubCategory.find({ categoryId: category._id, isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    res.json({ success: true, data: subcategories, category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/catalog/subcategories
router.get('/subcategories', async (req, res) => {
  try {
    await ensureSeeded();
    const subs = await SubCategory.find({ isActive: true })

      .populate('categoryId', 'name slug')
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    res.json({ success: true, data: subs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/catalog/subcategories/:slug
router.get('/subcategories/:slug', async (req, res) => {
  try {
    const sub = await SubCategory.findOne({ slug: req.params.slug, isActive: true })
      .populate('categoryId', 'name slug')
      .lean();
    if (!sub) return res.status(404).json({ success: false, message: 'Subcategory not found' });
    res.json({ success: true, data: sub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/catalog/subcategories/:slug/packages
router.get('/subcategories/:slug/packages', async (req, res) => {
  try {
    const sub = await SubCategory.findOne({ slug: req.params.slug, isActive: true })
      .select('packages name slug')
      .lean();
    if (!sub) return res.status(404).json({ success: false, message: 'Subcategory not found' });

    const packages = (sub.packages || []).filter((p) => p.isActive);
    res.json({ success: true, data: packages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/catalog/subcategories/:slug/questions
router.get('/subcategories/:slug/questions', async (req, res) => {
  try {
    const sub = await SubCategory.findOne({ slug: req.params.slug, isActive: true })
      .select('bookingQuestions name slug')
      .lean();
    if (!sub) return res.status(404).json({ success: false, message: 'Subcategory not found' });

    const questions = (sub.bookingQuestions || []).sort((a, b) => a.sortOrder - b.sortOrder);
    res.json({ success: true, data: questions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
