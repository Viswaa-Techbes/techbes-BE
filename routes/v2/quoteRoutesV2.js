const express = require('express');
const quoteControllerV2 = require('../../controllers/v2/quoteControllerV2');
const { optionalAuthenticate } = require('../../middlewares/auth');
const rateLimit = require('../../middlewares/rateLimit');

const router = express.Router();

// Public submission of CCTV quote requests
router.post(
  '/',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'quotes' }),
  optionalAuthenticate,
  quoteControllerV2.submitQuoteRequest
);

module.exports = router;
