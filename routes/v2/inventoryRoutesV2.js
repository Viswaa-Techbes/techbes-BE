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

router.get('/admin/products', inventoryControllerV2.listProductsAdmin);
router.post('/admin/products', inventoryControllerV2.createProductAdmin);
router.post('/products', inventoryControllerV2.createProductAdmin);
router.put('/admin/products/:id', inventoryControllerV2.updateProductAdmin);
router.put('/products/:id', inventoryControllerV2.updateProductAdmin);
router.patch('/admin/products/:id/status', inventoryControllerV2.toggleStatusAdmin);
router.patch('/products/:id/status', inventoryControllerV2.toggleStatusAdmin);
router.delete('/admin/products/:id', inventoryControllerV2.deleteProductAdmin);
router.delete('/products/:id', inventoryControllerV2.deleteProductAdmin);

module.exports = router;
