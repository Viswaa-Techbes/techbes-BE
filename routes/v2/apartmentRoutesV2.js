const express = require('express');
const router = express.Router();
const apartmentController = require('../../controllers/v2/apartmentControllerV2');
const { authenticate, requireRoles } = require('../../middlewares/auth');

router.use(authenticate);

// ─── TICKETS (ROLE-SCOPED: ADMIN, ASSOCIATION, RESIDENT, CLIENT) ───────────────
router.get('/tickets', apartmentController.getTickets);
router.post('/tickets', apartmentController.createTicket);
router.get('/tickets/:id', apartmentController.getTicketById);
router.put('/tickets/:id/reply', apartmentController.replyToTicket);

// ─── APARTMENTS MANAGEMENT ────────────────────────────────────────────────────
// List apartments (Admin only)
router.get('/', requireRoles('admin'), apartmentController.getApartments);

// Create apartment (Admin only)
router.post('/', requireRoles('admin'), apartmentController.createApartment);

// View apartment details (Admin & Association)
router.get('/:id', requireRoles('admin', 'association'), apartmentController.getApartmentById);

// Update apartment (Admin only)
router.put('/:id', requireRoles('admin'), apartmentController.updateApartment);

// Delete apartment (Admin only)
router.delete('/:id', requireRoles('admin'), apartmentController.deleteApartment);

// ─── ASSOCIATION USERS (ADMIN ONLY, EXACTLY UP TO 3 USERS) ────────────────────
router.post('/:id/association-users', requireRoles('admin'), apartmentController.createAssociationUser);
router.delete('/:id/association-users/:userId', requireRoles('admin'), apartmentController.removeAssociationUser);

// ─── RESIDENTS (ADMIN & ASSOCIATION OF THAT APARTMENT) ────────────────────────
router.post('/:id/residents', requireRoles('admin', 'association'), apartmentController.addResident);
router.delete('/:id/residents/:residentId', requireRoles('admin', 'association'), apartmentController.removeResident);

module.exports = router;
