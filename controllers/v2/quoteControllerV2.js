const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QuoteRequest = require('../../models/QuoteRequest');
const User = require('../../models/User');
const Address = require('../../models/Address');
const Job = require('../../models/Job');
const Payment = require('../../models/Payment');
const notificationService = require('../../services/notificationService');
const { sendWhatsApp } = require('../../services/channelNotificationService');
const paymentService = require('../../services/paymentService');

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
        message: 'Please select a service category (CCTV, Networking, or Web Designing)',
      });
    }
    const categoryValidation = validateCategory(categoryInput);
    if (!categoryValidation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid service category. Please choose CCTV, Networking, or Web Designing.',
      });
    }
    const canonicalCategory = categoryValidation.canonicalName;

    // 3. Validate and sanitize Subcategory / Service
    const subcategoryInput = (subcategory || service || serviceName || '').trim();
    if (!subcategoryInput) {
      return res.status(400).json({
        success: false,
        message: `Please select a service under ${canonicalCategory}`,
      });
    }
    const subcategoryValidation = validateSubcategory(
      categoryValidation.categoryConfig,
      subcategoryInput
    );
    if (!subcategoryValidation.valid) {
      return res.status(400).json({
        success: false,
        message: `Invalid service "${subcategoryInput}" for category "${canonicalCategory}". Please select a valid service from the catalogue.`,
      });
    }
    const canonicalSubcategory = subcategoryValidation.canonicalName;

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
        },
        duplicatePrevented: true,
      });
    }

    // 5. Construct items array (quantities only, NO pricing)
    let processedItems = [];
    if (Array.isArray(items) && items.length > 0) {
      processedItems = items
        .map((item) => ({
          productName: String(item.productName || item.name || '').trim(),
          quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
          unitPrice: null,
          lineTotal: null,
        }))
        .filter((item) => item.productName.length > 0);
    }
    if (processedItems.length === 0) {
      processedItems.push({
        productName: canonicalSubcategory,
        quantity: 1,
        unitPrice: null,
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

    // Check if client is logged in
    const customerId = req.user ? req.user.id : null;
    const finalRequirements = (additionalRequirements || message || '').trim();

    const quoteData = {
      fullName: fullName.trim(),
      mobile: cleanedMobile,
      email: (email || '').trim().toLowerCase(),
      whatsapp: (whatsapp || '').trim(),
      serviceCategory: canonicalCategory,
      subcategory: canonicalSubcategory,
      items: processedItems,
      subtotal: 0,
      gstRate: 18,
      gstAmount: 0,
      finalAmount: 0,
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
      // Find all admin and manager users to dispatch in-app notifications
      const admins = await User.find({ role: { $in: ['admin', 'manager'] } }).select('_id name email phone mobileNumber role');
      if (admins.length > 0) {
        for (const admin of admins) {
          await notificationService.createNotification(
            admin._id,
            notifTitle,
            notifMessage,
            'quote_request_created',
            null,
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
    'payment_pending',
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
    plain.pricingStatus = 'Pricing Under Review by TechBes Admin';
  } else {
    plain.pricingStatus = 'Pricing Ready';
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

    const quotes = await QuoteRequest.find(filter).sort({ createdAt: -1 });
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
      quote = await QuoteRequest.findOne({ requestId: id });
    } else {
      quote = await QuoteRequest.findById(id);
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
 */
async function getQuoteRequestDetails(req, res, next) {
  try {
    const quote = await QuoteRequest.findById(req.params.id)
      .populate('assignedTo', 'name email role')
      .populate('customerId', 'name email mobileNumber customerId')
      .populate('orderId');

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
    const { items, gstRate = 18, validityDays = 15, adminNotes, saveAsDraft } = req.body;

    const quote = await QuoteRequest.findById(id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote Request not found' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Items array with unit prices is required' });
    }

    let calculatedSubtotal = 0;
    const updatedItems = items.map((item) => {
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      const unitPrice = Math.max(0, parseFloat(item.unitPrice) || 0);
      const lineTotal = Math.round(quantity * unitPrice * 100) / 100;
      calculatedSubtotal += lineTotal;

      return {
        productName: String(item.productName || item.name || 'Item').trim(),
        quantity,
        unitPrice,
        lineTotal,
      };
    });

    const parsedGstRate = Math.max(0, parseFloat(gstRate) || 18);
    const calculatedGst = Math.round(((calculatedSubtotal * parsedGstRate) / 100) * 100) / 100;
    const calculatedFinal = Math.round((calculatedSubtotal + calculatedGst) * 100) / 100;

    quote.items = updatedItems;
    quote.subtotal = calculatedSubtotal;
    quote.gstRate = parsedGstRate;
    quote.gstAmount = calculatedGst;
    quote.finalAmount = calculatedFinal;
    quote.validityDays = Number(validityDays) || 15;

    if (adminNotes !== undefined) {
      quote.adminNotes = adminNotes;
    }

    quote.status = saveAsDraft ? 'quotation_draft' : 'quotation_draft';
    await quote.save();

    return res.json({
      success: true,
      message: 'Quotation calculated and saved successfully',
      data: quote,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin completes and sends quotation to customer.
 * Marks status as 'quotation_sent' and dispatches WhatsApp notification.
 */
async function sendQuotation(req, res, next) {
  try {
    const { id } = req.params;
    const quote = await QuoteRequest.findById(id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote Request not found' });
    }

    if (!quote.finalAmount || quote.finalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send quotation without pricing. Please enter unit prices first.',
      });
    }

    const validity = quote.validityDays || 15;
    const validUntil = new Date(Date.now() + validity * 24 * 60 * 60 * 1000);

    quote.status = 'quotation_sent';
    quote.sentAt = new Date();
    quote.validUntil = validUntil;
    await quote.save();

    // Prepare WhatsApp Notification content per Part 12
    const customerPhone = quote.mobile;
    const formattedAmount = `₹${quote.finalAmount.toLocaleString('en-IN')}`;
    const portalUrl = `${process.env.FRONTEND_URL || 'https://techbes.co.in'}/dashboard/quotes`;

    const whatsappMessage =
      `Your quotation has been prepared by TechBes.\n\n` +
      `Quotation No: ${quote.requestId}\n` +
      `Total Amount: ${formattedAmount} (incl. GST)\n` +
      `Valid For: ${validity} days\n\n` +
      `Please login to your TechBes account to view the quotation and proceed with booking/payment:\n` +
      `${portalUrl}`;

    // Server-side WhatsApp delivery via channelNotificationService (Twilio)
    let waResult = { success: false };
    try {
      waResult = await sendWhatsApp({
        to: customerPhone,
        body: whatsappMessage,
      });
    } catch (waErr) {
      console.error('[WhatsApp Error]', waErr.message);
      waResult = { success: false, reason: waErr.message };
    }

    // Generate click-to-chat fallback URL
    const cleanPhone = customerPhone.replace(/[^\d]/g, '');
    const clickToChatUrl = `https://wa.me/91${cleanPhone.slice(-10)}?text=${encodeURIComponent(whatsappMessage)}`;

    // In-app notification if customerId exists
    if (quote.customerId) {
      try {
        await notificationService.createNotification(
          quote.customerId,
          'Quotation Ready – TechBes',
          `Your quotation ${quote.requestId} for ${quote.serviceCategory} is ready. Total: ${formattedAmount}. Login to review and pay now to book.`,
          'quotation_sent',
          null,
          { quoteId: quote._id, requestId: quote.requestId }
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
        whatsappSent: waResult.success && !waResult.fallback,
        whatsappFallback: Boolean(waResult.fallback),
        clickToChatUrl,
      },
    });
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
    const quote = await QuoteRequest.findById(id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    // Validate quotation status
    const payableStatuses = ['quotation_sent', 'quotation_accepted', 'payment_pending', 'Quote Sent', 'Quotation Sent'];
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

    // Authoritative amount in paise
    const finalAmount = quote.finalAmount;
    if (!finalAmount || finalAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Quotation amount is invalid' });
    }
    const amountInPaise = Math.round(finalAmount * 100);

    const description = `TechBes Quotation Booking: ${quote.requestId}`;
    const receipt = `RCP_${quote.requestId}_${Date.now().toString().slice(-4)}`;

    let orderData = null;
    const isTestMode =
      process.env.CCTV_TEST_PAYMENT === 'true' ||
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET;

    if (isTestMode) {
      const mockOrderId = `order_qt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
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

    quote.status = 'payment_pending';
    quote.paymentDetails = quote.paymentDetails || {};
    quote.paymentDetails.razorpayOrderId = orderData.orderId;
    await quote.save();

    return res.json({
      success: true,
      message: 'Payment order created successfully',
      data: {
        orderId: orderData.orderId,
        amount: amountInPaise,
        displayAmount: finalAmount,
        currency: 'INR',
        keyId: orderData.keyId,
        quotationId: quote._id,
        requestId: quote.requestId,
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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, mockSuccess } = req.body;

    const quote = await QuoteRequest.findById(id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    const isTestMode =
      process.env.CCTV_TEST_PAYMENT === 'true' ||
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET;

    if (isTestMode && mockSuccess) {
      console.log(`[Quote Payment] Verified via mock test payment for ${quote.requestId}`);
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

    // 1. Generate unique sequential Order Number ORD-YYYY-XXXXX
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
    const orderNumber = `ORD-${year}-${String(orderSeq).padStart(5, '0')}`;

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

    // 4. Create Payment Record
    const payment = await Payment.create({
      userId: clientUser._id,
      razorpayOrderId: razorpay_order_id || `order_mock_${Date.now()}`,
      razorpayPaymentId: razorpay_payment_id || `pay_mock_${Date.now()}`,
      razorpaySignature: razorpay_signature || 'mock_sig',
      amount: Math.round(quote.finalAmount * 100),
      currency: 'INR',
      status: 'paid',
      orderNumber,
      meta: {
        quotationId: quote._id,
        requestId: quote.requestId,
        itemsCount: quote.items.length,
      },
    });

    // 5. Create Job / Order linked to Customer, Quotation, Payment, Items, Location
    const itemsDescription = quote.items
      .map((it) => `• ${it.productName} (Qty: ${it.quantity}, Rate: ₹${it.unitPrice})`)
      .join('\n');

    const job = await Job.create({
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
      paymentStatus: 'paid',
    });

    // 6. Update QuoteRequest record
    quote.status = 'paid';
    quote.paidAt = new Date();
    quote.orderNumber = orderNumber;
    quote.orderId = job._id;
    quote.paymentDetails = {
      razorpayOrderId: razorpay_order_id || '',
      razorpayPaymentId: razorpay_payment_id || '',
      razorpaySignature: razorpay_signature || '',
      paymentId: payment._id,
      amountPaid: quote.finalAmount,
    };
    await quote.save();

    // 7. Dispatch notifications
    try {
      await notificationService.createNotification(
        clientUser._id,
        'Order Confirmed Successfully!',
        `Your payment of ₹${quote.finalAmount} was verified. Order #${orderNumber} is being prepared.`,
        'order_confirmed',
        null,
        { orderNumber, jobId: job._id }
      );
    } catch (e) {
      console.error('Order notification error:', e.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Order Confirmed Successfully',
      data: {
        orderNumber,
        orderId: job._id,
        orderDate: new Date(),
        amountPaid: quote.finalAmount,
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
    const quote = await QuoteRequest.findById(id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote Request not found' });
    }

    Object.assign(quote, req.body);
    await quote.save();

    const populated = await QuoteRequest.findById(id)
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
    const quote = await QuoteRequest.findById(id);
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

    return res.json({ success: true, data: { job: existingJob, quote } });
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
};
