const express = require('express');
const adminControllerV2 = require('../../controllers/v2/adminControllerV2');
const cctvControllerV2 = require('../../controllers/v2/cctvControllerV2');
const materialControllerV2 = require('../../controllers/v2/materialControllerV2');
const technicianControllerV2 = require('../../controllers/v2/technicianControllerV2');
const attendanceControllerV2 = require('../../controllers/v2/attendanceControllerV2');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

// Middleware to log API hits as requested
router.use((req, res, next) => {
  console.log(`[API V2] HIT: ${req.method} ${req.originalUrl}`);
  next();
});

// All routes require admin role
router.use(authenticate, requireRoles('admin'));

// Dashboard
router.get('/dashboard', adminControllerV2.getDashboard);

// Leads
router.get('/leads', adminControllerV2.getLeads);
router.post('/leads', adminControllerV2.createLead);
router.put('/leads/:id', adminControllerV2.updateLead);
router.delete('/leads/:id', adminControllerV2.deleteLead);

// Customers
router.get('/customers', adminControllerV2.getCustomers);
router.get('/customers/:id', adminControllerV2.getCustomerById);
router.post('/customers', adminControllerV2.createCustomer);
router.put('/customers/:id', adminControllerV2.updateCustomer);
router.delete('/customers/:id', adminControllerV2.deleteCustomer);

// Users (Technicians & Managers)
router.get('/users', adminControllerV2.getUsers);
router.get('/users/:id', adminControllerV2.getUserDetails);
router.post('/users', adminControllerV2.createUser);
router.put('/users/:id', adminControllerV2.updateUser);
router.delete('/users/:id', adminControllerV2.deleteUser);
router.put('/users/:id/password', adminControllerV2.changeUserPassword);

// Legacy aliases or specific routes if needed
router.post('/create-user', adminControllerV2.createUser); // Alias for compatibility

// Jobs
router.get('/jobs', adminControllerV2.getJobs);
router.post('/jobs', adminControllerV2.createJob);
router.put('/jobs/:id', adminControllerV2.updateJob);
router.delete('/jobs/:id', adminControllerV2.deleteJob);

// Bookings (v2 Service Requests)
router.get('/bookings', adminControllerV2.getBookings);
router.put('/bookings/:id/assign', adminControllerV2.assignBooking);
router.get('/service-requests', adminControllerV2.getServiceRequests);
router.get('/service-requests/:id', adminControllerV2.getServiceRequestById);
router.put('/service-requests/:id', adminControllerV2.updateServiceRequest);
router.patch('/service-requests/:id', adminControllerV2.updateServiceRequest);
router.delete('/service-requests/:id', adminControllerV2.deleteServiceRequest);

// Services Management: CCTV catalog and pricing
router.get('/services/cctv/categories', cctvControllerV2.listCategories);
router.post('/services/cctv/categories', cctvControllerV2.categoryAdmin.create);
router.put('/services/cctv/categories/:id', cctvControllerV2.categoryAdmin.update);
router.delete('/services/cctv/categories/:id', cctvControllerV2.categoryAdmin.remove);
router.get('/services/cctv/subcategories', cctvControllerV2.listSubcategories);
router.post('/services/cctv/subcategories', cctvControllerV2.subcategoryAdmin.create);
router.put('/services/cctv/subcategories/:id', cctvControllerV2.subcategoryAdmin.update);
router.delete('/services/cctv/subcategories/:id', cctvControllerV2.subcategoryAdmin.remove);
router.get('/services/cctv/camera-types', cctvControllerV2.listCameraTypes);
router.post('/services/cctv/camera-types', cctvControllerV2.cameraTypeAdmin.create);
router.put('/services/cctv/camera-types/:id', cctvControllerV2.cameraTypeAdmin.update);
router.delete('/services/cctv/camera-types/:id', cctvControllerV2.cameraTypeAdmin.remove);
router.get('/services/cctv/addons', cctvControllerV2.listAddons);
router.post('/services/cctv/addons', cctvControllerV2.addonAdmin.create);
router.put('/services/cctv/addons/:id', cctvControllerV2.addonAdmin.update);
router.delete('/services/cctv/addons/:id', cctvControllerV2.addonAdmin.remove);
// Material master (global)
router.get('/materials', materialControllerV2.listMaterials);
router.post('/materials', materialControllerV2.admin.create);
router.put('/materials/:id', materialControllerV2.admin.update);
router.delete('/materials/:id', materialControllerV2.admin.remove);
router.get('/services/cctv/products', cctvControllerV2.listProducts);
router.post('/services/cctv/products', cctvControllerV2.productAdmin.create);
router.put('/services/cctv/products/:id', cctvControllerV2.productAdmin.update);
router.delete('/services/cctv/products/:id', cctvControllerV2.productAdmin.remove);
router.get('/services/cctv/pricing-config', cctvControllerV2.getPricingConfig);

// Technicians
router.get('/technicians', technicianControllerV2.listTechnicians);
router.put('/technicians/:id/status', technicianControllerV2.updateStatus);
router.put('/technicians/:id/assign', technicianControllerV2.assignManager);

// Attendance (admin)
router.post('/attendance/clock-in', attendanceControllerV2.adminClockIn);
router.post('/attendance/clock-out', attendanceControllerV2.adminClockOut);
router.put('/services/cctv/pricing-config', cctvControllerV2.upsertPricingConfig);

// Requests & Approvals
router.get('/completion-requests', adminControllerV2.getCompletionRequests);
router.put('/completion-requests/:id', adminControllerV2.updateCompletionRequest);
router.get('/payment-requests', adminControllerV2.getPaymentRequests);
router.put('/payment-requests/:id', adminControllerV2.updatePaymentRequest);

// Tracking & Reports
router.get('/tracking', adminControllerV2.getTracking);
router.get('/reviews', adminControllerV2.getReviews);
router.get('/attendance', adminControllerV2.getAttendance);
router.get('/addresses', adminControllerV2.getAddresses);

// ─── Dynamic Category & Subcategory Management ────────────────────────────────
const Category = require('../../models/Category');
const SubCategory = require('../../models/SubCategory');

// Categories CRUD
router.get('/catalog/categories', async (req, res) => {
  try {
    const cats = await Category.find().sort({ sortOrder: 1 }).lean();
    res.json({ success: true, data: cats });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/catalog/categories', async (req, res) => {
  try {
    const cat = await Category.create(req.body);
    res.status(201).json({ success: true, data: cat });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

router.put('/catalog/categories/:id', async (req, res) => {
  try {
    const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: cat });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

router.delete('/catalog/categories/:id', async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    await SubCategory.deleteMany({ categoryId: req.params.id });
    res.json({ success: true, message: 'Category and its subcategories deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Subcategories CRUD
router.get('/catalog/subcategories', async (req, res) => {
  try {
    const filter = req.query.categoryId ? { categoryId: req.query.categoryId } : {};
    const subs = await SubCategory.find(filter).sort({ sortOrder: 1 }).populate('categoryId', 'name slug').lean();
    res.json({ success: true, data: subs });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/catalog/subcategories', async (req, res) => {
  try {
    const sub = await SubCategory.create(req.body);
    res.status(201).json({ success: true, data: sub });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

router.put('/catalog/subcategories/:id', async (req, res) => {
  try {
    const sub = await SubCategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!sub) return res.status(404).json({ success: false, message: 'Subcategory not found' });
    res.json({ success: true, data: sub });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

router.delete('/catalog/subcategories/:id', async (req, res) => {
  try {
    await SubCategory.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Subcategory deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Manage packages within a subcategory
router.put('/catalog/subcategories/:id/packages', async (req, res) => {
  try {
    const sub = await SubCategory.findByIdAndUpdate(req.params.id, { packages: req.body.packages }, { new: true });
    if (!sub) return res.status(404).json({ success: false, message: 'Subcategory not found' });
    res.json({ success: true, data: sub.packages });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// Manage booking questions within a subcategory
router.put('/catalog/subcategories/:id/questions', async (req, res) => {
  try {
    const sub = await SubCategory.findByIdAndUpdate(req.params.id, { bookingQuestions: req.body.questions }, { new: true });
    if (!sub) return res.status(404).json({ success: false, message: 'Subcategory not found' });
    res.json({ success: true, data: sub.bookingQuestions });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

module.exports = router;
