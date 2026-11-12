const express = require('express');
const router = express.Router();
const inventoryControllerV2 = require('../../controllers/v2/inventoryControllerV2');
const { authenticate, optionalAuthenticate, requireRoles, verifyCsrf } = require('../../middlewares/auth');

// Public search and real-time autocomplete (only active items returned)
router.get('/search', inventoryControllerV2.searchInventory);

// Public authoritative GST and price calculation
router.post('/calculate-gst', inventoryControllerV2.calculateGst);

// Product lookup by ID
router.get('/products/:id', optionalAuthenticate, inventoryControllerV2.getProductById);

// Public/authenticated product listing
router.get('/products', optionalAuthenticate, (req, res, next) => {
  if (req.user?.role === 'admin') {
    return inventoryControllerV2.listProductsAdmin(req, res, next);
  }
  return inventoryControllerV2.searchInventory(req, res, next);
});

// Admin-protected Inventory Management endpoints
router.use(authenticate);
router.use(requireRoles('admin'));
router.use(verifyCsrf);

router.get('/admin/dashboard', inventoryControllerV2.getDashboardAdmin);
router.get('/admin/products', inventoryControllerV2.listProductsAdmin);
router.get('/admin/products/:id', inventoryControllerV2.getItemDetailsAdmin);
router.post('/admin/products', inventoryControllerV2.createProductAdmin);
router.post('/products', inventoryControllerV2.createProductAdmin);
router.put('/admin/products/:id', inventoryControllerV2.updateProductAdmin);
router.put('/products/:id', inventoryControllerV2.updateProductAdmin);
router.patch('/admin/products/:id/pricing', inventoryControllerV2.updatePricingAdmin);
router.patch('/admin/products/:id/status', inventoryControllerV2.toggleStatusAdmin);
router.patch('/products/:id/status', inventoryControllerV2.toggleStatusAdmin);
router.post('/admin/products/:id/stock', inventoryControllerV2.adjustStockAdmin);
router.delete('/admin/products/:id', inventoryControllerV2.deleteProductAdmin);
router.delete('/products/:id', inventoryControllerV2.deleteProductAdmin);
router.get('/admin/stock/history', inventoryControllerV2.getStockHistoryAdmin);
router.get('/admin/stock/low-stock', inventoryControllerV2.getLowStockAlertsAdmin);
router.post('/admin/stock/validate', inventoryControllerV2.validateStockAdmin);
router.post('/admin/stock/allocate', inventoryControllerV2.allocateStockAdmin);
router.get('/admin/pricing-rules', inventoryControllerV2.listPricingConfigsAdmin);
router.post('/admin/pricing-rules', inventoryControllerV2.createPricingConfigAdmin);
router.put('/admin/pricing-rules/:id', inventoryControllerV2.updatePricingConfigAdmin);
router.delete('/admin/pricing-rules/:id', inventoryControllerV2.deletePricingConfigAdmin);
router.post('/admin/calculate-quote', inventoryControllerV2.calculateDynamicQuoteAdmin);
router.get('/ai/search', inventoryControllerV2.aiSearchInventory);
router.get('/ai/compatible/:id', inventoryControllerV2.aiGetCompatibleMaterials);
router.post('/ai/prepare-quote', inventoryControllerV2.aiPrepareQuotation);

module.exports = router;
