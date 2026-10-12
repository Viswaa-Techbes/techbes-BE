const express = require('express');
const router = express.Router();
const apartmentController = require('../../controllers/v2/apartmentControllerV2');
const { authenticate, requireRoles } = require('../../middlewares/auth');

// ─── PUBLIC RESIDENT ACTIVATION ENDPOINT ──────────────────────────────────────
router.post('/residents/activate', apartmentController.activateResident);

// All subsequent routes require valid authentication
router.use(authenticate);

// ─── TICKETS (ROLE-SCOPED: ADMIN, ASSOCIATION, RESIDENT, CLIENT) ───────────────
router.get('/tickets', apartmentController.getTickets);
router.post('/tickets', apartmentController.createTicket);
router.get('/tickets/:id', apartmentController.getTicketById);
router.put('/tickets/:id/reply', apartmentController.replyToTicket);
router.put('/tickets/:id/status', requireRoles('admin', 'association'), apartmentController.updateTicketStatus);
router.put('/tickets/:id/assign', requireRoles('admin', 'association'), apartmentController.assignStaff);
router.post('/tickets/:id/internal-notes', requireRoles('admin', 'association'), apartmentController.addInternalNote);
router.put('/tickets/:id/resolve', requireRoles('admin', 'association'), apartmentController.resolveTicket);
router.put('/tickets/:id/reopen', apartmentController.reopenTicket);

// ─── APARTMENTS MANAGEMENT ────────────────────────────────────────────────────
// List apartments (Admin & Association scoped)
router.get('/', requireRoles('admin', 'association'), apartmentController.getApartments);

// Create apartment (Admin only)
router.post('/', requireRoles('admin'), apartmentController.createApartment);

// View apartment details (Admin & Association)
router.get('/:id', requireRoles('admin', 'association'), apartmentController.getApartmentById);

// View apartment tickets
router.get('/:id/tickets', requireRoles('admin', 'association'), (req, res, next) => {
  req.query.apartmentId = req.params.id;
  apartmentController.getTickets(req, res, next);
});

// Update apartment (Admin only)
router.put('/:id', requireRoles('admin'), apartmentController.updateApartment);

// Delete apartment (Admin only)
router.delete('/:id', requireRoles('admin'), apartmentController.deleteApartment);

// ─── ASSOCIATION USERS (ADMIN ONLY, EXACTLY UP TO 3 USERS) ────────────────────
router.post('/:id/association-users', requireRoles('admin'), apartmentController.createAssociationUser);
router.delete('/:id/association-users/:userId', requireRoles('admin'), apartmentController.removeAssociationUser);

// ─── RESIDENTS REGISTRY (ADMIN & ASSOCIATION OF THAT APARTMENT) ───────────────
router.post('/:id/residents', requireRoles('admin', 'association'), apartmentController.addResident);
router.put('/:id/residents/:residentId', requireRoles('admin', 'association'), apartmentController.updateResident);
router.delete('/:id/residents/:residentId', requireRoles('admin', 'association'), apartmentController.removeResident);
router.post('/:id/residents/:residentId/invite', requireRoles('admin', 'association'), apartmentController.inviteResident);

module.exports = router;
