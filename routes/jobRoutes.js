const express = require('express');
const jobController = require('../controllers/jobController');
const { authenticate, requireRoles } = require('../middlewares/auth');

const router = express.Router();

// GET /jobs → list jobs (filtered by role)
router.get('/', authenticate, jobController.listJobs);

// GET /jobs/:id → job details
router.get('/:id', authenticate, jobController.getJobDetails);

// POST /jobs → create a new job (Manager only)
router.post('/', authenticate, requireRoles('manager'), jobController.createJob);

// POST /jobs/assign → assign technician to a job (Manager only)
router.post('/assign', authenticate, requireRoles('manager'), jobController.assignJob);

// PATCH /jobs/:id/status → technician updates job status (Technician only)
router.patch('/:id/status', authenticate, requireRoles('technician'), jobController.updateJobStatus);

module.exports = router;
