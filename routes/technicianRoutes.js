const express = require('express');
const technicianController = require('../controllers/technicianController');
const jobController = require('../controllers/jobController');
const { authenticate, requireRoles } = require('../middlewares/auth');

const router = express.Router();

// Compatibility with Frontend ApiService
router.get('/tasks', authenticate, requireRoles('technician'), jobController.listJobs);
router.patch('/tasks/:id/status', authenticate, requireRoles('technician', 'manager', 'admin'), jobController.updateJobStatus);
router.patch('/location', authenticate, requireRoles('technician'), (req, res, next) => {
    // Alias to updateStatus but using self ID
    req.params.id = req.user.id;
    technicianController.updateStatus(req, res, next);
});
router.post('/update-status', authenticate, requireRoles('technician'), (req, res, next) => {
    const requestedUserId = req.body.userId;
    req.params.id = requestedUserId || req.user.id;
    technicianController.updateStatus(req, res, next);
});

// Standard Routes
router.get('/', authenticate, requireRoles('manager', 'admin'), technicianController.listTechnicians);
router.get('/:id', authenticate, technicianController.getTechnicianDetails);
router.patch('/:id/status', authenticate, technicianController.updateStatus);
router.get('/:id/jobs', authenticate, technicianController.listTechnicianJobs);

module.exports = router;
