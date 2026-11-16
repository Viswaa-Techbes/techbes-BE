const express = require('express');
const router = express.Router();
const aiService = require('../../services/aiService');
const { processServiceRecommendation } = require('../../services/aiRecommendationService');
const { authenticate } = require('../../middlewares/auth');

router.post('/chat', aiService.processChat);
router.post('/recommend-services', processServiceRecommendation);
router.post('/handoff', authenticate, aiService.createAiTicketHandoff);

module.exports = router;
