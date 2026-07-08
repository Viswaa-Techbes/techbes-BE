const express = require('express');
const routingService = require('../../services/routingService');
const { authenticate } = require('../../middlewares/auth');

const router = express.Router();

// Allow authenticated users (technician, admin, customer) to query route info
router.get('/directions', authenticate, async (req, res, next) => {
  try {
    const { startLat, startLng, endLat, endLng } = req.query;

    if (!startLat || !startLng || !endLat || !endLng) {
      return res.status(400).json({
        success: false,
        message: 'Missing startLat, startLng, endLat, or endLng query parameters'
      });
    }

    const start = { lat: parseFloat(startLat), lng: parseFloat(startLng) };
    const end = { lat: parseFloat(endLat), lng: parseFloat(endLng) };

    if (isNaN(start.lat) || isNaN(start.lng) || isNaN(end.lat) || isNaN(end.lng)) {
      return res.status(400).json({
        success: false,
        message: 'Parameters must be valid numbers'
      });
    }

    const directions = await routingService.getDirections(start, end);
    res.json({
      success: true,
      data: directions
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
