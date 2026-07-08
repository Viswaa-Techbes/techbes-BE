const express = require('express');
const managerController = require('../controllers/managerController');
const technicianController = require('../controllers/technicianController');
const jobController = require('../controllers/jobController');
const { authenticate, requireRoles } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate, requireRoles('manager', 'admin'));

// Compatibility with Frontend ApiService
router.get('/technicians', technicianController.listTechnicians);
router.get('/tasks', jobController.listJobs);

// GET /managers/:id/team → list technicians under a manager
router.get('/:id/team', managerController.listTeam);

module.exports = router;
