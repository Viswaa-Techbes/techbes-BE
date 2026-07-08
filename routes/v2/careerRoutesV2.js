const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const careerController = require('../../controllers/v2/careerController');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();

// Multer setup for resumes
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `resume-${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|doc|docx/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error('Only PDF, DOC, and DOCX files are allowed'));
  },
});

// Public apply route
router.post('/apply', upload.single('resume'), careerController.applyForJob);

// Admin routes
router.get('/', authenticate, requireRoles('admin'), careerController.getApplications);
router.patch('/:id/status', authenticate, requireRoles('admin'), careerController.updateApplicationStatus);

module.exports = router;
