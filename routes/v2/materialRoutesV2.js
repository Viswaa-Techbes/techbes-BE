const express = require('express');
const materialController = require('../../controllers/v2/materialControllerV2');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.get('/', materialController.listMaterials);
router.get('/:id', materialController.getMaterial);

// Admin routes
router.post('/', authenticate, requireRoles('admin'), materialController.admin.create);
router.put('/:id', authenticate, requireRoles('admin'), materialController.admin.update);
router.delete('/:id', authenticate, requireRoles('admin'), materialController.admin.remove);

module.exports = router;
