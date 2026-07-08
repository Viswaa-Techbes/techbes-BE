const express = require('express');
const locationControllerV2 = require('../../controllers/v2/locationControllerV2');
const { authenticate } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

router.post('/update', locationControllerV2.updateLocation);
router.get('/:technicianId', locationControllerV2.getLiveLocation);

module.exports = router;
