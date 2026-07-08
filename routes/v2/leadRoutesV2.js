const express = require('express');
const publicController = require('../../controllers/v2/leadPublicControllerV2');
const { authenticate } = require('../../middlewares/auth');

const router = express.Router();

router.post('/', publicController.createLead);
router.get('/', publicController.listPublic);

module.exports = router;
