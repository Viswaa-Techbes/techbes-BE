const express = require('express');
const leadController = require('../controllers/leadController');
const { authenticate, requireRoles } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate, requireRoles('admin', 'manager'));

router.get('/', leadController.listLeads);
router.post('/', leadController.createLead);

module.exports = router;
