const express = require('express');
const jobControllerV2 = require('../../controllers/v2/jobControllerV2');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

router.post('/', authenticate, jobControllerV2.createBooking);
router.post('/create', authenticate, jobControllerV2.createBooking); // alias

// List bookings — requires login (role-filtered in controller)
router.get('/', authenticate, jobControllerV2.listBookings);

// Assign a booking to a technician (admin / manager only)
router.put('/:id/assign', authenticate, requireRoles('manager', 'admin'), jobControllerV2.assignById);

// Legacy assign via body
router.post('/assign', authenticate, requireRoles('manager', 'admin'), jobControllerV2.assignBooking);

// Technician accepts job
router.post('/:id/accept', authenticate, requireRoles('technician'), jobControllerV2.acceptJob);

// Update job status — any authenticated user (controller enforces business rules)
router.patch('/:id/status', authenticate, jobControllerV2.updateJobStatus);

// Technician requests payment after job completion
router.post('/:id/request-payment', authenticate, requireRoles('technician'), jobControllerV2.requestPayment);

// Upload work proof
router.post('/:id/upload', authenticate, jobControllerV2.uploadWork);

module.exports = router;
