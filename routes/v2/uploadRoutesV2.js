const express = require('express');
const multer = require('multer');
const path = require('path');
const { uploadToCloudinary } = require('../../utils/cloudinary');
const { authenticate, requireRoles } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate, requireRoles('client', 'technician', 'manager', 'admin'));

// Use memory storage for Cloudinary uploads
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|webp/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${ext}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// POST /api/v2/upload — single file
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  try {
    const isPdf = req.file.mimetype.toLowerCase().includes('pdf') || req.file.originalname.toLowerCase().endsWith('.pdf');
    const folder = `techbes/kyc/${req.user.id}`;
    const options = {
      folder,
      resource_type: isPdf ? 'raw' : 'image',
      isRaw: isPdf
    };
    const result = await uploadToCloudinary(req.file.buffer, req.file.originalname, options);
    const type = isPdf ? 'pdf' : 'image';

    return res.status(201).json({
      success: true,
      url: result.secure_url,
      fileUrl: result.secure_url,
      publicId: result.public_id,
      public_id: result.public_id,
      type
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Cloudinary upload failed', error: error.message });
  }
});

// POST /api/v2/upload/multiple — up to 10 files
router.post('/multiple', upload.array('files', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files uploaded' });
  }
  
  try {
    const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer, file.originalname));
    const results = await Promise.all(uploadPromises);
    
    const files = results.map((r, i) => ({
      fileUrl: r.secure_url,
      originalName: req.files[i].originalname,
      public_id: r.public_id,
      size: r.bytes,
      mimetype: r.format,
    }));
    
    return res.status(201).json({ success: true, files });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Cloudinary multiple upload failed', error: error.message });
  }
});

module.exports = router;
