const express = require('express');
const { authenticate, requireRoles } = require('../../middlewares/auth');
const controller = require('../../controllers/v2/admissionControllerV2');

const router = express.Router();

// PUBLIC: Allow students to apply
router.post('/', controller.createAdmission);
router.get('/:id/receipt', controller.getReceipt);

// Admin-only admission management
router.use(authenticate, requireRoles('admin'));

router.get('/', controller.listAdmissions);
// Bulk assignment endpoint for admin UI
router.post('/assign', controller.bulkAssign);
// Preview multiple admissions before bulk assign
router.post('/preview', controller.bulkPreview);
router.get('/:id', controller.getAdmissionById);
router.put('/:id', controller.updateAdmission);
router.delete('/:id', controller.deleteAdmission);

router.patch('/:id/status', controller.updateStatus);
router.patch('/:id/assignment', controller.assignCourseOrInternship);
router.get('/:id/activity', controller.getActivity);
router.get('/:id/payments', controller.getPayments);
router.get('/:id/assignment/history', controller.getAssignmentHistory);
router.put('/:id/payment', controller.upsertPayment);
router.post('/:id/payment/verify', controller.verifyPayment);
router.post('/:id/documents', controller.addDocument);

module.exports = router;
