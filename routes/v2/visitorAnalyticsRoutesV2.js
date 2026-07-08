const express = require('express');
const { authenticate, requireRoles } = require('../../middlewares/auth');
const { trackVisitor, getDashboard, getCityDetail } = require('../../controllers/v2/visitorAnalyticsControllerV2');

const router = express.Router();

// Legacy visitor analytics endpoints disabled. Return 410 Gone to indicate removal.
router.post('/track', (req, res) => res.status(410).json({ success: false, message: 'Legacy visitor analytics disabled. Use GA4.' }));
router.get('/dashboard', authenticate, requireRoles('admin'), (req, res) => res.status(410).json({ success: false, message: 'Legacy visitor analytics disabled. Use GA4.' }));
router.get('/city/:city', authenticate, requireRoles('admin'), (req, res) => res.status(410).json({ success: false, message: 'Legacy visitor analytics disabled. Use GA4.' }));

module.exports = router;
