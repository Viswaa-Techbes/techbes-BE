const express = require('express');
const multer = require('multer');
const path = require('path');
const quoteControllerV2 = require('../../controllers/v2/quoteControllerV2');
const { authenticate, optionalAuthenticate } = require('../../middlewares/auth');
const rateLimit = require('../../middlewares/rateLimit');

const router = express.Router();

const audioStorage = multer.memoryStorage();
const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB audio limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExts = ['.webm', '.ogg', '.mp3', '.wav', '.m4a', '.aac', '.mp4'];
    const allowedMimes = ['audio/webm', 'audio/ogg', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mp4', 'video/webm'];
    
    if (!allowedExts.includes(ext) && !allowedMimes.includes(file.mimetype.toLowerCase())) {
      return cb(new Error('Only audio recordings (.webm, .mp3, .wav, .ogg, .m4a) are allowed.'));
    }
    cb(null, true);
  },
});

// Upload voice note for quotation
router.post(
  '/voice-note',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'quotes-audio' }),
  audioUpload.single('audio'),
  quoteControllerV2.uploadVoiceNote
);

// Public submission of quotation requests (with optional auth)
router.post(
  '/',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'quotes' }),
  optionalAuthenticate,
  quoteControllerV2.submitQuoteRequest
);

// Customer portal: list user's quotations
router.get(
  '/my-quotes',
  authenticate,
  quoteControllerV2.getCustomerQuotes
);

// Customer portal: view quotation details
router.get(
  '/:id',
  optionalAuthenticate,
  quoteControllerV2.getQuoteDetailsForCustomer
);

// Customer portal: create payment order for quotation (Pay Now to Book)
router.post(
  '/:id/create-payment-order',
  authenticate,
  quoteControllerV2.createPaymentOrder
);

// Customer portal: verify payment for quotation
router.post(
  '/:id/verify-payment',
  authenticate,
  quoteControllerV2.verifyQuotePayment
);

module.exports = router;
