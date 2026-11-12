const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QuoteRequest = require('../../models/QuoteRequest');
const Material = require('../../models/Material');
const inventoryService = require('../../services/inventoryService');
const User = require('../../models/User');
const Address = require('../../models/Address');
const Job = require('../../models/Job');
const Payment = require('../../models/Payment');
const notificationService = require('../../services/notificationService');
const { sendWhatsApp } = require('../../services/channelNotificationService');
const paymentService = require('../../services/paymentService');
const { generateQuotationPdfBuffer } = require('../../services/quotationPdfService');

/**
 * Configure voice notes upload directory
 */
const VOICE_NOTES_DIR = path.join(__dirname, '../../uploads/voice_notes');
if (!fs.existsSync(VOICE_NOTES_DIR)) {
  try {
    fs.mkdirSync(VOICE_NOTES_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create voice notes directory:', err.message);
  }
}

/**
 * Upload voice note audio file
 */
async function uploadVoiceNote(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No audio file provided' });
    }

    const fileExt = path.extname(req.file.originalname) || '.webm';
    const filename = `vn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${fileExt}`;
    const targetPath = path.join(VOICE_NOTES_DIR, filename);

    fs.writeFileSync(targetPath, req.file.buffer);

    const relativeUrl = `/uploads/voice_notes/${filename}`;
    return res.status(201).json({
      success: true,
      message: 'Voice note uploaded successfully',
      data: {
        url: relativeUrl,
        filename,
        size: req.file.size,
        mimeType: req.file.mimetype,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Public submission of quotation requests
 * Customer DOES NOT enter or see pricing here!
 */
async function submitQuoteRequest(req, res, next) {
  try {
    const { validateCategory, validateSubcategory } = require('../../utils/serviceQuotationConfig');
    const { sendEmail } = require('../../services/channelNotificationService');

    const {
      fullName,
      mobile,
      email,
      whatsapp,
      serviceCategory,
      category,
      subcategory,
      service,
      serviceName,
      items,
      companyName,
      googleMapsUrl,
      source,
      locality,
      location,
      pincode,
      address,
      latitude,
      longitude,
      propertyType,
      requirementType,
      cameraCount,
      cameraRequirement,
      features,
      recorder,
      storage,
      additionalRequirements,
      message,
      voiceNote,
      preferredContact,
      preferredVisitDate,
      preferredVisitTime,
    } = req.body;

    // 1. Validate required contact & address fields
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }
    if (!mobile || !mobile.trim()) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    // Validate and normalize Indian mobile number
    const rawMobile = mobile.trim();
    const mobileDigits = rawMobile.replace(/[^\d]/g, '');
    const mobileRegex = /^(?:\+91|0)?[6-9]\d{9}$/;
    if (!mobileRegex.test(rawMobile) || (mobileDigits.length !== 10 && mobileDigits.length !== 12)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit Indian mobile number' });
    }
    const cleanedMobile = mobileDigits.length === 12 && mobileDigits.startsWith('91')
      ? mobileDigits.slice(2)
      : mobileDigits.slice(-10);

    const rawAddress = (address || location || locality || '').trim();
    if (!rawAddress) {
      return res.status(400).json({ success: false, message: 'Location / address is required' });
    }
    const finalLocality = (locality || location || rawAddress).trim();

    // 2. Validate and sanitize Category
    const categoryInput = (serviceCategory || category || '').trim();
    if (!categoryInput) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid service category (CCTV, Networking, Web Designing, Digital Marketing, or AMC)',
      });
    }
    const categoryValidation = validateCategory(categoryInput);
    if (!categoryValidation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid service category. Please choose CCTV, Networking, Web Designing, Digital Marketing, or AMC.',
      });
    }
    const canonicalCategory = categoryValidation.canonicalName;

    // 3. Validate and sanitize Subcategory / Service
    const subcategoryInput = (subcategory || service || serviceName || req.body.serviceSlug || '').trim();
    const subcategoryValidation = validateSubcategory(
      categoryValidation.categoryConfig,
      subcategoryInput
    );
    let canonicalSubcategory = subcategoryValidation.valid
      ? subcategoryValidation.canonicalName
      : (canonicalCategory === 'CCTV' ? 'Install New CCTV' : null);

    if (!canonicalSubcategory) {
      return res.status(400).json({
        success: false,
        message: `Invalid service "${subcategoryInput}" for category "${canonicalCategory}". Please select a valid service from the catalogue.`,
      });
    }

    // 4. Prevent duplicate submissions caused by repeated button clicks (within 60 seconds)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const existingQuote = await QuoteRequest.findOne({
      mobile: { $regex: new RegExp(cleanedMobile + '$') },
      serviceCategory: canonicalCategory,
      subcategory: canonicalSubcategory,
      createdAt: { $gte: oneMinuteAgo },
    });

    if (existingQuote) {
      return res.status(200).json({
        success: true,
        message: 'Quotation request already received and is being processed.',
        data: {
          id: existingQuote._id,
          requestId: existingQuote.requestId,
          fullName: existingQuote.fullName,
          mobile: existingQuote.mobile,
          email: existingQuote.email,
          serviceCategory: existingQuote.serviceCategory,
          subcategory: existingQuote.subcategory,
          locality: existingQuote.locality,
          address: existingQuote.address,
          status: existingQuote.status,
          createdAt: existingQuote.createdAt,
          itemsCount: Array.isArray(existingQuote.items) ? existingQuote.items.length : 0,
        },
        duplicatePrevented: true,
      });
    }

    // 5. Construct items array with authoritative inventory product lookup & GST calculation
    let processedItems = [];
    let calculatedSubtotal = 0;
    let calculatedGstAmount = 0;
    let hasAuthoritativePricing = false;

    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const rawName = String(item.productName || item.name || '').trim();
        if (!rawName) continue;
        const qty = Math.max(1, parseInt(item.quantity, 10) || 1);

        let authoritativeMat = null;
        if (item.productId) {
          try {
            authoritativeMat = await Material.findById(item.productId).lean();
          } catch (_) {}
        }

        if (authoritativeMat) {
          hasAuthoritativePricing = true;
          let basePrice = typeof authoritativeMat.basePrice === 'number'
            ? authoritativeMat.basePrice
            : (authoritativeMat.price || 0);
          const gstRate = typeof authoritativeMat.gstRate === 'number' ? authoritativeMat.gstRate : 18;
          let variantName = String(item.variant || authoritativeMat.variant || '').trim();

          if (variantName && Array.isArray(authoritativeMat.variants)) {
            const vMatch = authoritativeMat.variants.find((v) => v.name === variantName || v.sku === variantName);
            if (vMatch && typeof vMatch.price === 'number') {
              basePrice = vMatch.price;
            }
          }

          let taxableAmount = 0;
          let lineGst = 0;
          let lineTotal = 0;

          if (authoritativeMat.isTaxInclusive) {
            lineTotal = Math.round((basePrice * qty) * 100) / 100;
            taxableAmount = Math.round((lineTotal / (1 + gstRate / 100)) * 100) / 100;
            lineGst = Math.round((lineTotal - taxableAmount) * 100) / 100;
          } else {
            taxableAmount = Math.round((basePrice * qty) * 100) / 100;
            lineGst = Math.round(((taxableAmount * gstRate) / 100) * 100) / 100;
            lineTotal = Math.round((taxableAmount + lineGst) * 100) / 100;
          }

          calculatedSubtotal += taxableAmount;
          calculatedGstAmount += lineGst;

          processedItems.push({
            productId: authoritativeMat._id,
            brand: authoritativeMat.brand || '',
            sku: authoritativeMat.sku || '',
            variant: variantName,
            productName: authoritativeMat.name || rawName,
            quantity: qty,
            unitPrice: basePrice,
            gstRate,
            gstAmount: lineGst,
            lineTotal,
          });
        } else {
          // Standard service-only item or unlinked custom note
          processedItems.push({
            productId: null,
            brand: String(item.brand || '').trim(),
            sku: String(item.sku || '').trim(),
            variant: String(item.variant || '').trim(),
            productName: rawName,
            quantity: qty,
            unitPrice: null,
            gstRate: 18,
            gstAmount: 0,
            lineTotal: null,
          });
        }
      }
    }
    if (processedItems.length === 0) {
      processedItems.push({
        productId: null,
        brand: '',
        sku: '',
        variant: '',
        productName: canonicalSubcategory,
        quantity: 1,
        unitPrice: null,
        gstRate: 18,
        gstAmount: 0,
        lineTotal: null,
      });
    }

    // Process voice note if provided
    let processedVoiceNote = { url: '', duration: 0, filename: '', mimeType: '' };
    if (voiceNote && typeof voiceNote === 'object') {
      processedVoiceNote = {
        url: voiceNote.url || '',
        duration: Number(voiceNote.duration) || 0,
        filename: voiceNote.filename || '',
        mimeType: voiceNote.mimeType || '',
      };
    } else if (typeof voiceNote === 'string' && voiceNote.trim()) {
      processedVoiceNote.url = voiceNote.trim();
    }

    // Check if client is logged in or match existing registered user by mobile
    let customerId = req.user ? req.user.id : null;
    if (!customerId && cleanedMobile) {
      try {
        const matchedUser = await User.findOne({
          $or: [{ phone: cleanedMobile }, { mobileNumber: cleanedMobile }]
        }).select('_id').lean();
        if (matchedUser) {
          customerId = matchedUser._id;
        }
      } catch (_) {}
    }
    const finalRequirements = (additionalRequirements || message || '').trim();

    const quoteData = {
      fullName: fullName.trim(),
      mobile: cleanedMobile,
      email: (email || '').trim().toLowerCase(),
      whatsapp: (whatsapp || '').trim(),
      serviceCategory: canonicalCategory,
      subcategory: canonicalSubcategory,
      items: processedItems,
      subtotal: hasAuthoritativePricing ? Math.round(calculatedSubtotal * 100) / 100 : 0,
      gstRate: 18,
      gstAmount: hasAuthoritativePricing ? Math.round(calculatedGstAmount * 100) / 100 : 0,
      finalAmount: hasAuthoritativePricing ? Math.round((calculatedSubtotal + calculatedGstAmount) * 100) / 100 : 0,
      companyName: (companyName || '').trim(),
      googleMapsUrl: (googleMapsUrl || '').trim(),
      source: (source || 'Website Quotation Request').trim(),
      locality: finalLocality,
      pincode: (pincode || '').trim(),
      address: rawAddress,
      latitude: Number(latitude) || null,
      longitude: Number(longitude) || null,
      propertyType: propertyType || '',
      requirementType: requirementType || `${canonicalCategory} - ${canonicalSubcategory}`,
      cameraCount: cameraCount || '',
      cameraRequirement: cameraRequirement || '',
      features: Array.isArray(features) ? features : [],
      recorder: recorder || '',
      storage: storage || '',
      additionalRequirements: finalRequirements,
      voiceNote: processedVoiceNote,
      preferredContact: preferredContact || '',
      preferredVisitDate: preferredVisitDate ? new Date(preferredVisitDate) : null,
      preferredVisitTime: preferredVisitTime || '',
      customerId,
      status: 'quotation_requested',
    };

    const quoteRequest = await QuoteRequest.create(quoteData);

    // Auto-save & associate address with customer's saved addresses if not already existing
    if (customerId && (quoteData.address || rawAddress)) {
      try {
        const addressText = (quoteData.address || rawAddress).trim();
        const existingAddress = await Address.findOne({
          userId: customerId,
          $or: [
            { address: addressText },
            { formattedAddress: addressText }
          ]
        }).lean();

        if (!existingAddress) {
          await Address.create({
            userId: customerId,
            name: quoteData.fullName,
            mobile: quoteData.mobile,
            address: addressText,
            landmark: req.body.landmark || '',
            city: req.body.city || 'Bangalore',
            state: req.body.state || 'Karnataka',
            pincode: quoteData.pincode || '',
            area: quoteData.locality || '',
            label: req.body.addressType || req.body.label || 'Home',
            latitude: quoteData.latitude || null,
            longitude: quoteData.longitude || null,
            manualNotes: req.body.additionalInstructions || req.body.manualNotes || '',
            formattedAddress: addressText,
            googleMapLink: (quoteData.latitude && quoteData.longitude)
              ? `https://maps.google.com/?q=${quoteData.latitude},${quoteData.longitude}`
              : (quoteData.googleMapsUrl || ''),
            isDefault: false,
          });
        }
      } catch (addrErr) {
        console.error('[QuoteController] Could not auto-save address:', addrErr.message);
      }
    }

    // 6. Admin Notification
    const submissionTimeFormatted = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const notifTitle = `New ${canonicalCategory} Quote Request #${quoteRequest.requestId}`;
    const notifMessage = `Quotation #${quoteRequest.requestId} requested by ${quoteRequest.fullName} (${quoteRequest.mobile}) for ${canonicalCategory} - ${canonicalSubcategory}. Location: ${quoteRequest.address}. Submitted at: ${submissionTimeFormatted}.`;

    const extraNotifData = {
      requestId: quoteRequest.requestId,
      customerName: quoteRequest.fullName,
      fullName: quoteRequest.fullName,
      mobile: quoteRequest.mobile,
      email: quoteRequest.email,
      category: canonicalCategory,
      serviceCategory: canonicalCategory,
      subcategory: canonicalSubcategory,
      serviceName: canonicalSubcategory,
      address: quoteRequest.address,
      locality: quoteRequest.locality,
      preferredVisitDate: quoteRequest.preferredVisitDate
        ? new Date(quoteRequest.preferredVisitDate).toLocaleDateString('en-IN')
        : null,
      additionalRequirements: quoteRequest.additionalRequirements,
      submissionTime: submissionTimeFormatted,
    };

    // Track channels and missing configuration
    const notificationReport = {
      inAppDispatched: false,
      emailDispatched: false,
      missingChannels: [],
    };

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      notificationReport.missingChannels.push('Email: SMTP credentials (SMTP_USER/SMTP_PASS) missing in .env');
    }
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_SMS_FROM) {
      notificationReport.missingChannels.push('SMS: Twilio credentials (TWILIO_ACCOUNT_SID/TWILIO_SMS_FROM) missing in .env');
    }
    if (!process.env.TWILIO_WA_FROM) {
      notificationReport.missingChannels.push('WhatsApp: TWILIO_WA_FROM missing in .env');
    }

    try {
      const io = req.app.get('io') || global._socketIo;
      if (io) {
        io.to('admin_room').emit('newQuoteRequest', quoteRequest);
      }

      // Find all admin and manager users to dispatch in-app notifications
      const admins = await User.find({ role: { $in: ['admin', 'manager'] } }).select('_id name email phone mobileNumber role');
      if (admins.length > 0) {
        for (const admin of admins) {
          await notificationService.createNotification(
            admin._id,
            notifTitle,
            notifMessage,
            'quote_request_created',
            io,
            extraNotifData
          );
        }
        notificationReport.inAppDispatched = true;
      }

      // If SMTP is configured, ensure an alert email is delivered to the designated admin inbox
      const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'viswaatechbes@gmail.com';
      if (process.env.SMTP_USER && adminEmail) {
        const { getEmailTemplate } = require('../../utils/emailTemplates');
        const emailResult = await sendEmail({
          to: adminEmail,
          subject: notifTitle,
          html: getEmailTemplate('quote_request_created', notifTitle, notifMessage, extraNotifData),
          text: notifMessage,
        });
        notificationReport.emailDispatched = Boolean(emailResult?.success);
        if (!emailResult?.success && emailResult?.reason) {
          notificationReport.emailError = emailResult.reason;
        }
      }
    } catch (notifErr) {
      console.error('[QuoteController] Failed to dispatch admin notifications:', notifErr.message);
      notificationReport.error = notifErr.message;
    }

    return res.status(201).json({
      success: true,
      message: 'Quotation request submitted successfully',
      data: {
        id: quoteRequest._id,
        requestId: quoteRequest.requestId,
        fullName: quoteRequest.fullName,
        mobile: quoteRequest.mobile,
        email: quoteRequest.email,
        serviceCategory: quoteRequest.serviceCategory,
        subcategory: quoteRequest.subcategory,
        locality: quoteRequest.locality,
        address: quoteRequest.address,
        status: quoteRequest.status,
        createdAt: quoteRequest.createdAt,
        itemsCount: Array.isArray(quoteRequest.items) ? quoteRequest.items.length : 0,
      },
      notifications: notificationReport,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Helper to sanitize quote data for customer view
 * Rule: Customer does NOT see price before quotation is sent!
 */
function sanitizeQuoteForCustomer(quote) {
  const isSentOrPaid = [
    'quotation_sent',
    'quotation_accepted',
    'advance_paid',
    'payment_pending',
    'balance_pending',
    'paid',
    'converted_to_order',
    'Quote Sent',
    'Quotation Sent',
    'Accepted',
    'Converted to Booking',
    'Converted',
  ].includes(quote.status);

  const plain = quote.toObject ? quote.toObject() : { ...quote };

  if (!isSentOrPaid) {
    // Hide prices completely
    plain.items = (plain.items || []).map((item) => ({
      _id: item._id,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: null,
      lineTotal: null,
    }));
    plain.subtotal = null;
    plain.gstAmount = null;
    plain.finalAmount = null;
    plain.pricingBreakdown = null;
    plain.advancePercentage = null;
    plain.advanceAmount = null;
    plain.advancePaidAmount = null;
    plain.balanceAmount = null;
    plain.balancePaidAmount = null;
    plain.pricingStatus = 'Pricing Under Review by TechBes Admin';
  } else {
    plain.pricingStatus = 'Pricing Ready';
    const finalAmount = Number(plain.finalAmount || 0);
    const advPct = typeof plain.advancePercentage === 'number' ? plain.advancePercentage : 50;
    plain.advancePercentage = advPct;
    if (plain.advanceAmount === undefined || plain.advanceAmount === null || plain.advanceAmount === 0) {
      plain.advanceAmount = Math.round(((finalAmount * advPct) / 100) * 100) / 100;
    }
    const advPaid = Number(plain.advancePaidAmount || 0);
    if (plain.balanceAmount === undefined || plain.balanceAmount === null) {
      plain.balanceAmount = advPaid > 0
        ? Math.max(0, Math.round((finalAmount - advPaid - (plain.balancePaidAmount || 0)) * 100) / 100)
        : Math.max(0, Math.round((finalAmount - plain.advanceAmount) * 100) / 100);
    }
    plain.pricingBreakdown = plain.pricingBreakdown || {
      labourCharge: 0,
      serviceCharge: 0,
      accessoriesCharge: 0,
      miscCharge: 0,
    };
  }

  // Include job status if linked
  if (plain.orderId && typeof plain.orderId === 'object' && plain.orderId.status) {
    plain.jobStatus = plain.orderId.status;
  }

  return plain;
}

/**
 * List quotes for logged-in customer (Customer Portal)
 */
async function getCustomerQuotes(req, res, next) {
  try {
    const userId = req.user.id;
    const userDoc = req.authUser || (await User.findById(userId));
    const mobile = userDoc ? userDoc.mobileNumber : '';

    const filter = {
      $or: [{ customerId: userId }],
    };
    if (mobile) {
      filter.$or.push({ mobile });
    }

    const quotes = await QuoteRequest.find(filter).populate('orderId', 'status scheduledTime technicianName assignedTechnician').sort({ createdAt: -1 });
    const sanitized = quotes.map(sanitizeQuoteForCustomer);

    return res.json({ success: true, data: sanitized });
  } catch (err) {
    next(err);
  }
}

/**
 * Get quotation details for customer by ID or requestId
 */
async function getQuoteDetailsForCustomer(req, res, next) {
  try {
    const { id } = req.params;
    let quote = null;

    if (id.startsWith('QT-')) {
      quote = await QuoteRequest.findOne({ requestId: id }).populate('orderId', 'status scheduledTime technicianName assignedTechnician');
    } else {
      quote = await QuoteRequest.findById(id).populate('orderId', 'status scheduledTime technicianName assignedTechnician');
    }

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    // Security check: if customer is logged in, verify ownership
    if (req.user && req.user.role === 'client') {
      const userDoc = req.authUser || (await User.findById(req.user.id));
      const userMobile = userDoc?.mobileNumber;
      const isOwner =
        (quote.customerId && quote.customerId.toString() === req.user.id) ||
        (userMobile && quote.mobile === userMobile);

      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Access denied to this quotation' });
      }
    }

    return res.json({ success: true, data: sanitizeQuoteForCustomer(quote) });
  } catch (err) {
    next(err);
  }
}

/**
 * List quote requests with filters (Admin only)
 */
async function getQuoteRequests(req, res, next) {
  try {
    const { search, status, locality, area, date, assignedTo, serviceCategory } = req.query;
    const filter = {};

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { requestId: searchRegex },
        { fullName: searchRegex },
        { mobile: searchRegex },
        { email: searchRegex },
        { locality: searchRegex },
        { address: searchRegex },
        { serviceCategory: searchRegex },
        { subcategory: searchRegex },
        { companyName: searchRegex },
      ];
    }

    if (serviceCategory && serviceCategory !== 'All') {
      filter.serviceCategory = serviceCategory;
    }

    if (status && status !== 'All') {
      filter.status = status;
    }

    const searchArea = locality || area;
    if (searchArea && searchArea !== 'All') {
      filter.locality = new RegExp(searchArea, 'i');
    }

    if (assignedTo && assignedTo !== 'All') {
      filter.assignedTo = assignedTo;
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: startOfDay, $lte: endOfDay };
    }

    const quotes = await QuoteRequest.find(filter)
      .populate('assignedTo', 'name email role')
      .populate('customerId', 'name email mobileNumber customerId')
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: quotes });
  } catch (err) {
    next(err);
  }
}

/**
 * Quote request details (Admin only)
 * Supports lookup by MongoDB ObjectId or requestId (e.g. QT-2026-00001)
 */
async function getQuoteRequestDetails(req, res, next) {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');
    let query;
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = QuoteRequest.findById(id);
    } else {
      query = QuoteRequest.findOne({ requestId: id });
    }

    let quote = await query
      .populate('assignedTo', 'name email role')
      .populate('customerId', 'name email mobileNumber customerId')
      .populate('orderId');

    if (!quote && mongoose.Types.ObjectId.isValid(id)) {
      quote = await QuoteRequest.findOne({ requestId: id })
        .populate('assignedTo', 'name email role')
        .populate('customerId', 'name email mobileNumber customerId')
        .populate('orderId');
    }

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote Request not found' });
    }
    return res.json({ success: true, data: quote });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin enters Per Unit Price for every requested item.
 * Backend is the STRICT authoritative source of truth for:
 * Line totals, Subtotal, GST, Final Amount.
 */
async function priceQuotation(req, res, next) {
  try {
    const { id } = req.params;
    const {
      items,
      pricingBreakdown = {},
      advancePercentage = 50,
      gstRate = 18,
      validityDays = 15,
      adminNotes,
      terms,
      saveAsDraft = true,
    } = req.body;
    const mongoose = require('mongoose');

    let quote = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      quote = await QuoteRequest.findById(id);
    }
    if (!quote) {
      quote = await QuoteRequest.findOne({ requestId: id });
    }
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote Request not found' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Items array with unit prices is required' });
    }

    let calculatedItemsTotal = 0;
    const stockCheckInputs = [];
    const updatedItems = [];

    for (const item of items) {
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      let authoritativeMat = null;
      if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
        authoritativeMat = await Material.findById(item.productId).lean();
      } else if (item.sku) {
        authoritativeMat = await Material.findOne({
          sku: String(item.sku).trim().toUpperCase(),
        }).lean();
      }

      const catalogPrice = authoritativeMat
        ? Number(authoritativeMat.basePrice ?? authoritativeMat.price ?? 0)
        : 0;
      const hasExplicitUnitPrice =
        item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== '';
      const unitPrice = Math.max(
        0,
        hasExplicitUnitPrice && !item.useCatalogPrice
          ? parseFloat(item.unitPrice) || 0
          : catalogPrice
      );
      const itemGstRate = authoritativeMat ? Number(authoritativeMat.gstRate ?? gstRate ?? 18) : Number(item.gstRate ?? gstRate ?? 18);
      const lineSubtotal = Math.round(quantity * unitPrice * 100) / 100;
      const itemGstAmount = Math.round(((lineSubtotal * itemGstRate) / 100) * 100) / 100;
      const lineTotal = lineSubtotal;
      calculatedItemsTotal += lineTotal;

      if (authoritativeMat) {
        stockCheckInputs.push({ productId: authoritativeMat._id, quantity });
      }

      updatedItems.push({
        productId: authoritativeMat?._id || item.productId || null,
        brand: item.brand || authoritativeMat?.brand || '',
        sku: item.sku || authoritativeMat?.sku || '',
        variant: item.variant || authoritativeMat?.variant || '',
        productName: String(item.productName || item.name || authoritativeMat?.name || 'Item').trim(),
        quantity,
        unitPrice,
        gstRate: itemGstRate,
        gstAmount: itemGstAmount,
        lineTotal,
      });
    }

    const stockValidation = await inventoryService.validateStockAvailability(stockCheckInputs);
    if (req.body.enforceStock === true && !stockValidation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock for one or more inventory items in quotation.',
        stockValidation,
      });
    }

    const labourCharge = Math.max(0, parseFloat(pricingBreakdown?.labourCharge ?? req.body.labourCharge) || 0);
    const serviceCharge = Math.max(0, parseFloat(pricingBreakdown?.serviceCharge ?? req.body.serviceCharge) || 0);
    const accessoriesCharge = Math.max(0, parseFloat(pricingBreakdown?.accessoriesCharge ?? req.body.accessoriesCharge) || 0);
    const miscCharge = Math.max(0, parseFloat(pricingBreakdown?.miscCharge ?? req.body.miscCharge) || 0);

    const extraCharges = labourCharge + serviceCharge + accessoriesCharge + miscCharge;
    const calculatedSubtotal = Math.round((calculatedItemsTotal + extraCharges) * 100) / 100;

    const parsedGstRate = Math.max(0, parseFloat(gstRate) || 18);
    const calculatedGst = Math.round(((calculatedSubtotal * parsedGstRate) / 100) * 100) / 100;
    const calculatedFinal = Math.round((calculatedSubtotal + calculatedGst) * 100) / 100;

    const parsedAdvancePercentage = Math.min(100, Math.max(0, parseFloat(advancePercentage !== undefined ? advancePercentage : (quote.advancePercentage || 50))));
    const calculatedAdvance = Math.round(((calculatedFinal * parsedAdvancePercentage) / 100) * 100) / 100;
    const currentAdvancePaid = quote.advancePaidAmount || 0;
    const calculatedBalance = currentAdvancePaid > 0
      ? Math.max(0, Math.round((calculatedFinal - currentAdvancePaid - (quote.balancePaidAmount || 0)) * 100) / 100)
      : Math.max(0, Math.round((calculatedFinal - calculatedAdvance) * 100) / 100);

    // Snapshot version history before updating if there was already pricing
    if (!Array.isArray(quote.quoteVersions)) {
      quote.quoteVersions = [];
    }
    if (quote.finalAmount && quote.finalAmount > 0) {
      quote.quoteVersions.push({
        version: quote.quoteVersions.length + 1,
        savedAt: new Date(),
        savedBy: req.user?.id || null,
        items: quote.items,
        pricingBreakdown: quote.pricingBreakdown,
        subtotal: quote.subtotal,
        gstRate: quote.gstRate,
        gstAmount: quote.gstAmount,
        finalAmount: quote.finalAmount,
        advancePercentage: quote.advancePercentage,
        advanceAmount: quote.advanceAmount,
        balanceAmount: quote.balanceAmount,
        terms: quote.terms,
        adminNotes: quote.adminNotes,
        status: quote.status,
      });
    }

    quote.items = updatedItems;
    quote.pricingBreakdown = {
      labourCharge,
      serviceCharge,
      accessoriesCharge,
      miscCharge,
    };
    quote.subtotal = calculatedSubtotal;
    quote.gstRate = parsedGstRate;
    quote.gstAmount = calculatedGst;
    quote.finalAmount = calculatedFinal;
    quote.advancePercentage = parsedAdvancePercentage;
    quote.advanceAmount = calculatedAdvance;
    quote.balanceAmount = calculatedBalance;
    quote.validityDays = Number(validityDays) || 15;

    if (adminNotes !== undefined) quote.adminNotes = adminNotes;
    if (terms !== undefined) quote.terms = terms;

    if (saveAsDraft) {
      quote.status = 'quotation_draft';
    }

    await quote.save();

    // Real-time Socket.IO emission to both admin and customer rooms
    const io = req.app.get('io') || global._socketIo;
    if (io) {
      io.to('admin_room').emit('quoteUpdated', quote);
      if (quote.customerId) {
        io.to(quote.customerId.toString()).emit('quoteUpdated', sanitizeQuoteForCustomer(quote));
      }
    }

    return res.json({
      success: true,
      message: 'Quotation calculated and saved successfully',
      data: quote,
      stockValidation,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin completes and sends quotation to customer.
 * Validates quotation, generates PDF, marks status as 'quotation_sent', and dispatches WhatsApp notification.
 */
async function sendQuotation(req, res, next) {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');
    let quote = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      quote = await QuoteRequest.findById(id);
    }
    if (!quote) {
      quote = await QuoteRequest.findOne({ requestId: id });
    }
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote Request not found' });
    }

    if (!quote.finalAmount || quote.finalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send quotation without pricing. Please enter unit prices first.',
      });
    }

    // Safely check and normalize phone number
    const rawPhone = String(quote.mobile || quote.whatsapp || '');
    const cleanPhone = rawPhone.replace(/[^\d]/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Customer mobile number is missing or invalid. Please update the customer phone number before sending.',
      });
    }

    // Generate PDF buffer to guarantee PDF validity and catch any generation errors
    try {
      await generateQuotationPdfBuffer(quote);
    } catch (pdfErr) {
      console.error('[Quotation PDF Error]', pdfErr);
      return res.status(500).json({
        success: false,
        message: `Failed to generate quotation PDF: ${pdfErr.message}`,
      });
    }

    // Secure PDF endpoint path
    const downloadPdfPath = `/api/v2/admin/quotes/${encodeURIComponent(quote.requestId || quote._id)}/pdf`;
    quote.pdfUrl = downloadPdfPath;

    const validity = quote.validityDays || 15;
    const validUntil = new Date(Date.now() + validity * 24 * 60 * 60 * 1000);

    // Ensure advance/balance amounts are configured
    if (!quote.advanceAmount || quote.advanceAmount <= 0) {
      quote.advancePercentage = quote.advancePercentage || 50;
      quote.advanceAmount = Math.round(((quote.finalAmount * quote.advancePercentage) / 100) * 100) / 100;
      quote.balanceAmount = (quote.advancePaidAmount || 0) > 0
        ? Math.max(0, Math.round((quote.finalAmount - quote.advancePaidAmount - (quote.balancePaidAmount || 0)) * 100) / 100)
        : Math.max(0, Math.round((quote.finalAmount - quote.advanceAmount) * 100) / 100);
    }

    quote.status = 'quotation_sent';
    quote.sentAt = new Date();
    quote.validUntil = validUntil;
    await quote.save();

    // Prepare WhatsApp Notification content per Part 12
    const customerPhone = cleanPhone.slice(-10);
    const formattedAmount = `₹${quote.finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formattedAdvance = `₹${(quote.advanceAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formattedBalance = `₹${(quote.balanceAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const portalUrl = `${process.env.FRONTEND_URL || 'https://techbes.co.in'}/dashboard/quotes`;

    const whatsappMessage =
      `*TechBes Quotation Ready* 📄\n\n` +
      `Dear ${quote.fullName || 'Customer'},\n` +
      `Your itemized quotation for *${quote.serviceCategory || 'CCTV Installation'}* has been prepared.\n\n` +
      `• *Quotation No:* ${quote.requestId}\n` +
      `• *Grand Total:* ${formattedAmount} (incl. GST)\n` +
      `• *Advance (${quote.advancePercentage}%):* ${formattedAdvance}\n` +
      `• *Balance on Completion:* ${formattedBalance}\n` +
      `• *Validity:* ${validity} days\n\n` +
      `Please review your quotation details and proceed with online booking:\n` +
      `${portalUrl}\n\n` +
      `TechBes Services | Support: +91 91080 34888`;

    // Server-side WhatsApp delivery via channelNotificationService (Twilio)
    let waResult = { success: false };
    try {
      waResult = await sendWhatsApp({
        to: `+91${customerPhone}`,
        body: whatsappMessage,
      });
    } catch (waErr) {
      console.error('[WhatsApp Error]', waErr.message);
      waResult = { success: false, reason: waErr.message };
    }

    // Generate click-to-chat fallback URL
    const clickToChatUrl = `https://wa.me/91${customerPhone}?text=${encodeURIComponent(whatsappMessage)}`;

    // Real-time socket broadcast to both Admin and Customer rooms
    const io = req.app.get('io') || global._socketIo;
    if (io) {
      io.to('admin_room').emit('quoteStatusUpdated', {
        quoteId: quote._id,
        requestId: quote.requestId,
        status: quote.status,
        finalAmount: quote.finalAmount,
        advanceAmount: quote.advanceAmount,
        balanceAmount: quote.balanceAmount,
      });
      if (quote.customerId) {
        io.to(quote.customerId.toString()).emit('quoteStatusUpdated', sanitizeQuoteForCustomer(quote));
        io.to(quote.customerId.toString()).emit('quoteUpdated', sanitizeQuoteForCustomer(quote));
      }
    }

    // In-app notification if customerId exists
    if (quote.customerId) {
      try {
        await notificationService.createNotification(
          quote.customerId,
          'Quotation Ready – TechBes',
          `Your quotation ${quote.requestId} for ${quote.serviceCategory} is ready. Total: ${formattedAmount} (Advance: ${formattedAdvance}). Login to review and approve.`,
          'quotation_sent',
          io,
          { quoteId: quote._id, requestId: quote.requestId, finalAmount: quote.finalAmount, advanceAmount: quote.advanceAmount }
        );
      } catch (notifErr) {
        console.error('Failed to send in-app notification:', notifErr.message);
      }
    }

    return res.json({
      success: true,
      message: 'Quotation sent successfully to customer',
      data: {
        quote,
        whatsappSent: Boolean(waResult.success && !waResult.fallback),
        whatsappFallback: Boolean(waResult.fallback || !waResult.success),
        clickToChatUrl,
        pdfUrl: downloadPdfPath,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Streams the generated authoritative Quotation PDF directly.
 */
async function downloadQuotationPdf(req, res, next) {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');
    let quote = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      quote = await QuoteRequest.findById(id);
    }
    if (!quote) {
      quote = await QuoteRequest.findOne({ requestId: id });
    }
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote Request not found' });
    }

    const pdfBuffer = await generateQuotationPdfBuffer(quote);
    const fileName = `TechBes_Quotation_${quote.requestId || id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
}


/**
 * Pay Now to Book: Create Razorpay Payment Order for Quotation
 * Authoritative final amount calculated by backend.
 */
async function createPaymentOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { paymentType = 'advance' } = req.body;
    const quote = await QuoteRequest.findById(id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    // Validate quotation status
    const payableStatuses = [
      'quotation_sent',
      'quotation_accepted',
      'advance_paid',
      'payment_pending',
      'balance_pending',
      'Quote Sent',
      'Quotation Sent',
      'Accepted',
    ];
    if (!payableStatuses.includes(quote.status)) {
      return res.status(400).json({
        success: false,
        message: `Quotation is in '${quote.status}' status and cannot be paid. Must be sent by Admin first.`,
      });
    }

    // Check validity date
    if (quote.validUntil && new Date() > new Date(quote.validUntil)) {
      quote.status = 'expired';
      await quote.save();
      return res.status(400).json({ success: false, message: 'This quotation has expired. Please request a new quote.' });
    }

    // Backend-authoritative amount calculation
    let payableAmount = 0;
    if (paymentType === 'advance') {
      if (quote.advancePaidAmount >= quote.advanceAmount && quote.advanceAmount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Advance payment has already been completed for this quotation.',
        });
      }
      payableAmount = quote.advanceAmount > 0
        ? quote.advanceAmount
        : Math.round(((quote.finalAmount * (quote.advancePercentage || 50)) / 100) * 100) / 100;
    } else if (paymentType === 'balance') {
      if ((quote.advancePaidAmount || 0) <= 0 && quote.advanceAmount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Advance payment must be paid before making balance payment.',
        });
      }

      // Check job completion status
      let job = null;
      if (quote.orderId) {
        job = await Job.findById(quote.orderId);
      }
      if (!job) {
        job = await Job.findOne({ quoteRequestId: quote.requestId });
      }
      if (!job || job.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Balance payment is only available after job completion by technician (job status must be completed).',
        });
      }

      if (quote.balanceAmount <= 0 || (quote.balancePaidAmount >= quote.balanceAmount && quote.balancePaidAmount > 0)) {
        return res.status(400).json({
          success: false,
          message: 'Balance has already been paid in full.',
        });
      }
      payableAmount = quote.balanceAmount;
    } else {
      payableAmount = quote.finalAmount;
    }

    if (!payableAmount || payableAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Calculated payable amount is zero or invalid' });
    }

    const amountInPaise = Math.round(payableAmount * 100);
    const description = `TechBes ${paymentType === 'advance' ? 'Advance' : 'Balance'} Payment: ${quote.requestId}`;
    const receipt = `RCP_${paymentType.toUpperCase()}_${quote.requestId}_${Date.now().toString().slice(-4)}`;

    let orderData = null;
    const isTestMode =
      process.env.CCTV_TEST_PAYMENT === 'true' ||
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET;

    if (isTestMode) {
      const mockOrderId = `order_${paymentType}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      orderData = {
        orderId: mockOrderId,
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        description,
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_techbes',
        isMock: true,
      };
    } else {
      orderData = await paymentService.createRazorpayOrder(amountInPaise, description, receipt, req.user?.id);
    }

    if (paymentType === 'advance') {
      quote.advancePaymentDetails = quote.advancePaymentDetails || {};
      quote.advancePaymentDetails.razorpayOrderId = orderData.orderId;
      quote.status = 'payment_pending';
    } else {
      quote.balancePaymentDetails = quote.balancePaymentDetails || {};
      quote.balancePaymentDetails.razorpayOrderId = orderData.orderId;
      quote.status = 'balance_pending';
    }
    await quote.save();

    // Create Payment record in pending state
    await Payment.create({
      userId: req.user?.id || quote.customerId,
      quoteId: quote._id,
      jobId: quote.orderId || null,
      razorpayOrderId: orderData.orderId,
      amount: amountInPaise,
      currency: 'INR',
      status: 'pending',
      paymentType,
      meta: {
        quotationId: quote._id,
        requestId: quote.requestId,
        paymentType,
      },
    });

    return res.json({
      success: true,
      message: `${paymentType === 'advance' ? 'Advance' : 'Balance'} payment order created successfully`,
      data: {
        orderId: orderData.orderId,
        amount: amountInPaise,
        displayAmount: payableAmount,
        currency: 'INR',
        keyId: orderData.keyId,
        quotationId: quote._id,
        requestId: quote.requestId,
        paymentType,
        customerName: quote.fullName,
        customerEmail: quote.email,
        customerMobile: quote.mobile,
        isMock: Boolean(orderData.isMock),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Verify Razorpay payment and automatically create verified Order
 */
async function verifyQuotePayment(req, res, next) {
  try {
    const { id } = req.params;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      mockSuccess,
      paymentType = 'advance',
    } = req.body;

    const quote = await QuoteRequest.findById(id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    const isTestMode =
      process.env.CCTV_TEST_PAYMENT === 'true' ||
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET;

    if (isTestMode && mockSuccess) {
      console.log(`[Quote Payment] Verified via mock test payment for ${quote.requestId} (${paymentType})`);
    } else {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Payment verification details missing' });
      }

      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keySecret) {
        throw new Error('Razorpay secret key not configured');
      }

      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Payment signature verification failed' });
      }
    }

    // 1. Generate unique sequential Order Number & Invoice Number
    const year = new Date().getFullYear();
    const Counter = require('../../models/Counter');
    let orderSeq = 1;
    try {
      const counter = await Counter.findOneAndUpdate(
        { id: `order_number_${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      orderSeq = counter.seq;
    } catch {
      orderSeq = Math.floor(Math.random() * 90000) + 10000;
    }
    const orderNumber = quote.orderNumber || `ORD-${year}-${String(orderSeq).padStart(5, '0')}`;
    const invoicePrefix = paymentType === 'balance' ? 'INV-BAL' : 'INV-ADV';
    const invoiceNumber = `${invoicePrefix}-${year}-${String(orderSeq).padStart(5, '0')}`;

    // 2. Find or create Client User
    let clientUser = null;
    if (req.user && req.user.id) {
      clientUser = await User.findById(req.user.id);
    } else if (quote.customerId) {
      clientUser = await User.findById(quote.customerId);
    }
    if (!clientUser) {
      clientUser = await User.findOne({ mobileNumber: quote.mobile });
    }
    if (!clientUser) {
      const randomPassword = Math.random().toString(36).substring(2, 10);
      clientUser = await User.create({
        name: quote.fullName,
        mobileNumber: quote.mobile,
        email: quote.email || undefined,
        password: randomPassword,
        role: 'client',
        userType: 'web_user',
      });
    }

    // 3. Find or create Address
    let addr = await Address.findOne({ userId: clientUser._id });
    if (!addr) {
      addr = await Address.create({
        userId: clientUser._id,
        address: quote.address,
        pincode: quote.pincode || '',
      });
    }

    // 4. Calculate Authoritative Amounts
    const advanceAmt = quote.advanceAmount > 0
      ? quote.advanceAmount
      : Math.round(((quote.finalAmount * (quote.advancePercentage || 50)) / 100) * 100) / 100;
    const paidAmount = paymentType === 'balance' ? quote.balanceAmount : advanceAmt;
    const amountInPaise = Math.round(paidAmount * 100);

    // 5. Idempotent Payment Record
    let payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (payment) {
      payment.razorpayPaymentId = razorpay_payment_id || `pay_${Date.now()}`;
      payment.razorpaySignature = razorpay_signature || 'verified_sig';
      payment.status = 'paid';
      payment.paymentType = paymentType;
      payment.invoiceNumber = payment.invoiceNumber || invoiceNumber;
      await payment.save();
    } else {
      payment = await Payment.create({
        userId: clientUser._id,
        quoteId: quote._id,
        jobId: quote.orderId || null,
        razorpayOrderId: razorpay_order_id || `order_mock_${Date.now()}`,
        razorpayPaymentId: razorpay_payment_id || `pay_mock_${Date.now()}`,
        razorpaySignature: razorpay_signature || 'mock_sig',
        amount: amountInPaise,
        currency: 'INR',
        status: 'paid',
        paymentType,
        orderNumber,
        invoiceNumber,
        meta: {
          quotationId: quote._id,
          requestId: quote.requestId,
          paymentType,
        },
      });
    }

    // 6. Find or Create Job
    let job = quote.orderId ? await Job.findById(quote.orderId) : await Job.findOne({ quoteRequestId: quote.requestId });

    if (paymentType === 'advance') {
      quote.advancePaidAmount = advanceAmt;
      quote.balanceAmount = Math.max(0, Math.round((quote.finalAmount - quote.advancePaidAmount) * 100) / 100);
      quote.status = quote.balanceAmount === 0 ? 'paid' : 'advance_paid';
      quote.quotePaymentStatus = quote.balanceAmount === 0 ? 'fully_paid' : 'advance_paid';
      quote.orderNumber = orderNumber;
      quote.advancePaymentDetails = {
        razorpayOrderId: razorpay_order_id || '',
        razorpayPaymentId: razorpay_payment_id || '',
        razorpaySignature: razorpay_signature || '',
        paymentId: payment._id,
        amountPaid: advanceAmt,
        paidAt: new Date(),
      };

      if (!job) {
        const itemsDescription = quote.items
          .map((it) => `• ${it.productName} (Qty: ${it.quantity}, Rate: ₹${it.unitPrice})`)
          .join('\n');

        job = await Job.create({
          title: `${quote.serviceCategory} Order - ${orderNumber}`,
          description: `Quotation: ${quote.requestId}\nOrder No: ${orderNumber}\n\nOrdered Items:\n${itemsDescription}\n\nAdditional Requirements:\n${quote.additionalRequirements || 'None'}`,
          location: quote.address,
          client: clientUser._id,
          customerName: quote.fullName,
          customerPhone: quote.mobile,
          scheduledTime: quote.preferredVisitDate
            ? `${new Date(quote.preferredVisitDate).toISOString().split('T')[0]} ${quote.preferredVisitTime || 'ASAP'}`
            : 'ASAP',
          status: 'pending',
          useNewFlow: true,
          bookingDate: quote.preferredVisitDate ? new Date(quote.preferredVisitDate).toISOString().split('T')[0] : '',
          timeSlot: quote.preferredVisitTime || '',
          addressId: addr ? addr._id : undefined,
          latitude: quote.latitude,
          longitude: quote.longitude,
          googleMapsLink:
            quote.googleMapsUrl ||
            (quote.latitude && quote.longitude ? `https://www.google.com/maps?q=${quote.latitude},${quote.longitude}` : ''),
          addressDetails: {
            area: quote.locality || '',
            pincode: quote.pincode || '',
            formattedAddress: quote.address || '',
          },
          quoteRequestId: quote.requestId,
          paymentId: payment._id,
          paymentStatus: 'advance_paid',
          advancePaid: true,
          advancePaymentId: razorpay_payment_id || '',
          advanceAmount: advanceAmt,
          remainingAmount: quote.balanceAmount,
          price: quote.finalAmount,
          amount: quote.finalAmount,
        });
      } else {
        job.paymentStatus = 'advance_paid';
        job.advancePaid = true;
        job.advancePaymentId = razorpay_payment_id || '';
        job.advanceAmount = advanceAmt;
        job.remainingAmount = quote.balanceAmount;
        await job.save();
      }

      quote.orderId = job._id;
      payment.jobId = job._id;
      await payment.save();
    } else if (paymentType === 'balance') {
      quote.balancePaidAmount = quote.balanceAmount;
      quote.balanceAmount = 0;
      quote.status = 'paid';
      quote.quotePaymentStatus = 'fully_paid';
      quote.paidAt = new Date();
      quote.balancePaymentDetails = {
        razorpayOrderId: razorpay_order_id || '',
        razorpayPaymentId: razorpay_payment_id || '',
        razorpaySignature: razorpay_signature || '',
        paymentId: payment._id,
        amountPaid: paidAmount,
        paidAt: new Date(),
      };

      if (job) {
        job.paymentStatus = 'paid';
        job.remainingAmount = 0;
        await job.save();
      }
    }

    await quote.save();

    // 7. Socket.IO Real-time updates
    const io = req.app.get('io') || global._socketIo;
    if (io) {
      io.to('admin_room').emit('quoteStatusUpdated', {
        quoteId: quote._id,
        requestId: quote.requestId,
        status: quote.status,
        quotePaymentStatus: quote.quotePaymentStatus,
        paymentType,
        amountPaid: paidAmount,
        balanceAmount: quote.balanceAmount,
      });
      io.to('admin_room').emit('quoteUpdated', quote);
      if (clientUser) {
        io.to(clientUser._id.toString()).emit('quoteUpdated', sanitizeQuoteForCustomer(quote));
        io.to(clientUser._id.toString()).emit('quoteStatusUpdated', sanitizeQuoteForCustomer(quote));
        if (paymentType === 'advance') {
          io.to(clientUser._id.toString()).emit('bookingConfirmed', job);
        }
      }
    }

    // 8. Dispatch notifications
    try {
      const notifTitle = paymentType === 'balance' ? 'Quotation Balance Paid Successfully' : 'Order Confirmed! Advance Payment Received';
      const notifMsg = paymentType === 'balance'
        ? `Your balance payment of ₹${paidAmount} for Quotation #${quote.requestId} was verified. Quotation is fully settled.`
        : `Your advance payment of ₹${paidAmount} was verified. Order #${orderNumber} is confirmed and assigned to engineering.`;

      await notificationService.createNotification(
        clientUser._id,
        notifTitle,
        notifMsg,
        paymentType === 'balance' ? 'payment_received' : 'order_confirmed',
        io,
        { orderNumber, jobId: job?._id, quoteId: quote._id, paymentType, invoiceNumber }
      );
    } catch (e) {
      console.error('Order notification error:', e.message);
    }

    return res.status(200).json({
      success: true,
      message: paymentType === 'balance' ? 'Balance Payment Verified Successfully' : 'Advance Payment Verified & Order Confirmed',
      data: {
        orderNumber,
        invoiceNumber,
        orderId: job?._id,
        orderDate: new Date(),
        paymentType,
        amountPaid: paidAmount,
        advancePaidAmount: quote.advancePaidAmount,
        balanceAmount: quote.balanceAmount,
        paymentStatus: quote.quotePaymentStatus,
        quotationId: quote._id,
        requestId: quote.requestId,
        serviceCategory: quote.serviceCategory,
        items: quote.items,
        address: quote.address,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update quote request parameters (Admin only)
 */
async function updateQuoteRequest(req, res, next) {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');
    let quote = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      quote = await QuoteRequest.findById(id);
    }
    if (!quote) {
      quote = await QuoteRequest.findOne({ requestId: id });
    }
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote Request not found' });
    }

    Object.assign(quote, req.body);
    await quote.save();

    const populated = await QuoteRequest.findById(quote._id)
      .populate('assignedTo', 'name email role')
      .populate('customerId', 'name email mobileNumber customerId');

    return res.json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

/**
 * Convert accepted quote request to job booking (Admin only)
 */
async function convertToBooking(req, res, next) {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');
    let quote = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      quote = await QuoteRequest.findById(id);
    }
    if (!quote) {
      quote = await QuoteRequest.findOne({ requestId: id });
    }
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote Request not found' });
    }

    if (quote.status === 'Converted to Booking' || quote.status === 'converted_to_order') {
      return res.status(400).json({ success: false, message: 'This quote request has already been converted to an order' });
    }

    let clientUser = await User.findOne({ mobileNumber: quote.mobile });
    if (!clientUser && quote.customerId) {
      clientUser = await User.findById(quote.customerId);
    }
    if (!clientUser) {
      const password = Math.random().toString(36).substring(2, 10);
      clientUser = await User.create({
        name: quote.fullName,
        mobileNumber: quote.mobile,
        email: quote.email || undefined,
        password,
        role: 'client',
        userType: 'web_user',
      });
    }

    let addr = await Address.findOne({ userId: clientUser._id });
    if (!addr) {
      addr = await Address.create({
        userId: clientUser._id,
        address: quote.address,
        pincode: quote.pincode || '',
      });
    }

    let existingJob = await Job.findOne({ quoteRequestId: quote.requestId });
    if (!existingJob) {
      existingJob = await Job.create({
        title: `${quote.serviceCategory || 'Quote'} Order`,
        description: quote.additionalRequirements || `Created from Quote Request ID: ${quote.requestId}`,
        location: quote.address,
        client: clientUser._id,
        customerName: quote.fullName,
        customerPhone: quote.mobile,
        scheduledTime: quote.preferredVisitDate
          ? `${new Date(quote.preferredVisitDate).toISOString().split('T')[0]} ${quote.preferredVisitTime || 'ASAP'}`
          : 'ASAP',
        status: 'pending',
        useNewFlow: true,
        bookingDate: quote.preferredVisitDate ? new Date(quote.preferredVisitDate).toISOString().split('T')[0] : '',
        timeSlot: quote.preferredVisitTime || '',
        addressId: addr ? addr._id : undefined,
        googleMapsLink:
          quote.googleMapsUrl ||
          (quote.latitude && quote.longitude ? `https://www.google.com/maps?q=${quote.latitude},${quote.longitude}` : ''),
        latitude: quote.latitude,
        longitude: quote.longitude,
        addressDetails: {
          area: quote.locality || '',
          pincode: quote.pincode || '',
          formattedAddress: quote.address || '',
        },
        quoteRequestId: quote.requestId,
      });
    }

    quote.status = 'converted_to_order';
    quote.orderId = existingJob._id;
    await quote.save();

    const io = req.app.get('io') || global._socketIo;
    if (io) {
      io.to('admin_room').emit('newBooking', existingJob);
      io.emit('newBooking', existingJob);
      if (clientUser) {
        io.to(clientUser._id.toString()).emit('bookingConfirmed', existingJob);
      }
    }

    if (clientUser) {
      await notificationService.createNotification(
        clientUser._id,
        'Booking Created from Quotation',
        `Your quotation ${quote.requestId} has been converted into an active booking: ${existingJob.title}.`,
        'booking_confirmed',
        io,
        { bookingId: existingJob._id.toString(), quoteId: quote.requestId }
      );
    }

    // Trigger auto-dispatch in background
    setImmediate(async () => {
      try {
        const dispatchService = require('../../services/dispatchService');
        await dispatchService.autoAssignTechnician(existingJob._id, io);
      } catch (dispatchErr) {
        console.error('[quoteControllerV2] Auto-dispatch for converted booking failed (non-critical):', dispatchErr.message);
      }
    });

    return res.json({ success: true, data: { job: existingJob, quote } });
  } catch (err) {
    next(err);
  }
}

/**
 * Customer approval of quotation
 * POST /api/v2/quotes/:id/accept
 */
async function acceptQuote(req, res, next) {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};
    const mongoose = require('mongoose');
    let quote = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      quote = await QuoteRequest.findById(id);
    }
    if (!quote) {
      quote = await QuoteRequest.findOne({ requestId: id });
    }
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote Request not found' });
    }

    // Check ownership if authenticated customer
    if (req.user && req.user.role === 'client' && quote.customerId && String(quote.customerId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized to accept this quotation' });
    }

    quote.status = 'quotation_accepted';
    if (notes) {
      quote.adminNotes = (quote.adminNotes ? quote.adminNotes + '\n' : '') + `[Customer Note on Accept]: ${notes}`;
    }
    await quote.save();

    // Real-time broadcast to Admin room
    const io = req.app.get('io') || global._socketIo;
    if (io) {
      io.to('admin_room').emit('quoteStatusUpdated', {
        quoteId: quote._id,
        requestId: quote.requestId,
        status: quote.status,
        customerName: quote.fullName,
        finalAmount: quote.finalAmount,
      });
    }

    // Notify Admins
    const admins = await User.find({ role: 'admin', isDeleted: { $ne: true } }).select('_id');
    await Promise.allSettled(admins.map(admin =>
      notificationService.createNotification(
        admin._id,
        'Quotation Approved by Customer',
        `Customer ${quote.fullName} has accepted quotation #${quote.requestId} (₹${(quote.finalAmount || 0).toLocaleString('en-IN')}).`,
        'quotation_accepted',
        io,
        { quoteId: quote._id, requestId: quote.requestId }
      )
    ));

    return res.json({
      success: true,
      message: 'Quotation accepted successfully. You can now proceed to confirm booking.',
      data: quote,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Customer rejection of quotation
 * POST /api/v2/quotes/:id/reject
 */
async function rejectQuote(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const mongoose = require('mongoose');
    let quote = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      quote = await QuoteRequest.findById(id);
    }
    if (!quote) {
      quote = await QuoteRequest.findOne({ requestId: id });
    }
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote Request not found' });
    }

    // Check ownership if authenticated customer
    if (req.user && req.user.role === 'client' && quote.customerId && String(quote.customerId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized to decline this quotation' });
    }

    quote.status = 'Rejected';
    if (reason) {
      quote.adminNotes = (quote.adminNotes ? quote.adminNotes + '\n' : '') + `[Customer Rejection Reason]: ${reason}`;
    }
    await quote.save();

    // Real-time broadcast to Admin room
    const io = req.app.get('io') || global._socketIo;
    if (io) {
      io.to('admin_room').emit('quoteStatusUpdated', {
        quoteId: quote._id,
        requestId: quote.requestId,
        status: quote.status,
        customerName: quote.fullName,
        reason,
      });
    }

    // Notify Admins
    const admins = await User.find({ role: 'admin', isDeleted: { $ne: true } }).select('_id');
    await Promise.allSettled(admins.map(admin =>
      notificationService.createNotification(
        admin._id,
        'Quotation Declined by Customer',
        `Customer ${quote.fullName} has declined quotation #${quote.requestId}${reason ? `: "${reason}"` : '.'}`,
        'quotation_rejected',
        io,
        { quoteId: quote._id, requestId: quote.requestId }
      )
    ));

    return res.json({
      success: true,
      message: 'Quotation marked as declined',
      data: quote,
    });
  } catch (err) {
    next(err);
  }
}


/**
 * Get Invoice/Receipt for quotation payment (Advance or Balance)
 */
async function getQuotationInvoice(req, res, next) {
  try {
    const { id, paymentType = 'advance' } = req.params;
    const mongoose = require('mongoose');
    let quote = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      quote = await QuoteRequest.findById(id);
    }
    if (!quote) {
      quote = await QuoteRequest.findOne({ requestId: id });
    }
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    const paymentDetails = paymentType === 'balance' ? quote.balancePaymentDetails : quote.advancePaymentDetails;
    const payment = await Payment.findOne({
      quoteId: quote._id,
      paymentType,
      status: { $in: ['paid', 'verified'] },
    }).sort({ createdAt: -1 });

    const invoiceData = {
      invoiceNumber: payment?.invoiceNumber || `${paymentType === 'balance' ? 'INV-BAL' : 'INV-ADV'}-${quote.requestId}`,
      receiptNumber: payment?.paymentReference || `RCP-${quote.requestId}`,
      date: paymentDetails?.paidAt || payment?.createdAt || new Date(),
      customerName: quote.fullName,
      customerEmail: quote.email,
      customerMobile: quote.mobile,
      address: quote.address,
      serviceCategory: quote.serviceCategory,
      subcategory: quote.subcategory,
      quotationNumber: quote.requestId,
      orderNumber: quote.orderNumber,
      paymentType,
      items: quote.items,
      pricingBreakdown: quote.pricingBreakdown,
      subtotal: quote.subtotal,
      gstRate: quote.gstRate,
      gstAmount: quote.gstAmount,
      finalAmount: quote.finalAmount,
      advancePercentage: quote.advancePercentage,
      advanceAmount: quote.advanceAmount,
      amountPaid: paymentDetails?.amountPaid || (payment ? payment.amount / 100 : 0),
      balanceAmount: quote.balanceAmount,
      paymentMethod: 'Razorpay Online',
      transactionId: paymentDetails?.razorpayPaymentId || payment?.razorpayPaymentId || 'N/A',
      status: 'PAID',
    };

    return res.json({ success: true, data: invoiceData });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitQuoteRequest,
  uploadVoiceNote,
  getCustomerQuotes,
  getQuoteDetailsForCustomer,
  getQuoteRequests,
  getQuoteRequestDetails,
  priceQuotation,
  sendQuotation,
  createPaymentOrder,
  verifyQuotePayment,
  updateQuoteRequest,
  convertToBooking,
  downloadQuotationPdf,
  acceptQuote,
  rejectQuote,
  getQuotationInvoice,
};

