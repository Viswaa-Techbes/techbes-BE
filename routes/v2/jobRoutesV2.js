const express = require('express');
const jobControllerV2 = require('../../controllers/v2/jobControllerV2');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

router.post('/accept/:id', requireRoles('technician'), jobControllerV2.acceptJob);
router.post('/upload-work/:id', requireRoles('technician'), jobControllerV2.uploadWork);

module.exports = router;
