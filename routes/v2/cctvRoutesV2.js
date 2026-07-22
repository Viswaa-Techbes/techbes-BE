const express = require('express');
const cctvController = require('../../controllers/v2/cctvControllerV2');

const router = express.Router();

router.get('/', cctvController.listSubcategories);
router.get('/categories', cctvController.listCategories);
router.get('/subcategories', cctvController.listSubcategories);
router.get('/subcategories/:slug', cctvController.getSubcategoryBySlug);
router.get('/camera-types', cctvController.listCameraTypes);
router.get('/addons', cctvController.listAddons);
router.get('/products', cctvController.listProducts);
router.get('/pricing-config', cctvController.getPricingConfig);
router.get('/brands', cctvController.listBrands);
router.get('/models', cctvController.listModels);
router.get('/sd-cards', cctvController.listSdCards);
router.get('/installation-charges', cctvController.listInstallationCharges);
router.get('/cable-pricings', cctvController.listCablePricings);
router.get('/accessories', cctvController.listAccessories);
router.post('/calculate-price', cctvController.calculatePrice);

router.get('/:serviceId/config', cctvController.getServiceConfig);

// Keep this at the end to avoid matching static endpoints
router.get('/:id', cctvController.getServiceById);

module.exports = router;


