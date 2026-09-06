const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { uploadToCloudinary } = require('../../utils/cloudinary');
const { authenticate, requireRoles } = require('../../middlewares/auth');
const rateLimit = require('../../middlewares/rateLimit');

const router = express.Router();
router.use(authenticate, requireRoles('client', 'technician', 'manager', 'admin'));

// Allowed MIME types and extensions whitelist
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  // Reject executable or script extensions
  const dangerousExts = ['.exe', '.sh', '.bat', '.cmd', '.js', '.php', '.phtml', '.py', '.html', '.htm', '.svg', '.cgi'];
  if (dangerousExts.includes(ext)) {
    return cb(new Error(`File type rejected for security: ${ext}`));
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error(`File extension '${ext}' is not permitted. Allowed: .jpg, .jpeg, .png, .webp, .pdf`));
  }

  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return cb(new Error(`File MIME type '${mime}' is not permitted.`));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB strict limit
});

function generateSafeFilename(originalName) {
  const ext = path.extname(originalName || '').toLowerCase() || '.png';
  const randomUuid = crypto.randomUUID();
  return `${randomUuid}${ext}`;
}

const uploadRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyPrefix: 'upload-rate',
  message: 'Upload limit exceeded. Please wait a moment before uploading more files.',
});

// POST /api/v2/upload — single file
router.post('/', uploadRateLimiter, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  try {
    const isPdf = req.file.mimetype.toLowerCase().includes('pdf') || req.file.originalname.toLowerCase().endsWith('.pdf');
    const safeFilename = generateSafeFilename(req.file.originalname);
    const folder = `techbes/uploads/${req.user.id}`;
    const options = {
      folder,
      resource_type: isPdf ? 'raw' : 'image',
      isRaw: isPdf,
    };
    const result = await uploadToCloudinary(req.file.buffer, safeFilename, options);
    const type = isPdf ? 'pdf' : 'image';

    return res.status(201).json({
      success: true,
      url: result.secure_url,
      fileUrl: result.secure_url,
      publicId: result.public_id,
      public_id: result.public_id,
      type,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Cloudinary upload failed', error: error.message });
  }
});

// POST /api/v2/upload/multiple — up to 10 files
router.post('/multiple', uploadRateLimiter, (req, res, next) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}, async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files uploaded' });
  }
  
  try {
    const uploadPromises = req.files.map((file) => {
      const safeFilename = generateSafeFilename(file.originalname);
      return uploadToCloudinary(file.buffer, safeFilename);
    });
    const results = await Promise.all(uploadPromises);
    
    const files = results.map((r, i) => ({
      fileUrl: r.secure_url,
      originalName: generateSafeFilename(req.files[i].originalname),
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
