const QuoteRequest = require('../../models/QuoteRequest');
const User = require('../../models/User');
const Address = require('../../models/Address');
const Job = require('../../models/Job');
const notificationService = require('../../services/notificationService');

/**
 * Public submission of CCTV quote requests
 */
async function submitQuoteRequest(req, res, next) {
  try {
    const {
      fullName,
      mobile,
      email,
      whatsapp,
      serviceCategory,
      companyName,
      googleMapsUrl,
      source,
      locality,
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
      preferredContact,
      preferredVisitDate,
      preferredVisitTime,
    } = req.body;

    // Validate required fields
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ success: false, message: 'Full Name is required' });
    }
    if (!mobile || !mobile.trim()) {
      return res.status(400).json({ success: false, message: 'Mobile Number is required' });
    }
    if (!address || !address.trim()) {
      return res.status(400).json({ success: false, message: 'Address / Area is required' });
    }

    // Validate Indian mobile number
    const mobileRegex = /^(?:\+91|0)?[6-9]\d{9}$/;
    if (!mobileRegex.test(mobile.trim())) {
      return res.status(400).json({ success: false, message: 'Please enter a valid Indian mobile number' });
    }

    // Check if client is logged in
    const customerId = req.user && req.user.role === 'client' ? req.user.id : null;

    const finalLocality = locality?.trim() || address.trim();

    const quoteData = {
      fullName: fullName.trim(),
      mobile: mobile.trim(),
      email: email?.trim() || '',
      whatsapp: whatsapp?.trim() || '',
      serviceCategory: serviceCategory?.trim() || 'CCTV',
      companyName: companyName?.trim() || '',
      googleMapsUrl: googleMapsUrl?.trim() || '',
      source: source?.trim() || 'Website Quote Request',
      locality: finalLocality,
      pincode: pincode?.trim() || '',
      address: address.trim(),
      latitude: Number(latitude) || null,
      longitude: Number(longitude) || null,
      propertyType: propertyType || '',
      requirementType: requirementType || '',
      cameraCount: cameraCount || '',
      cameraRequirement: cameraRequirement || '',
      features: Array.isArray(features) ? features : [],
      recorder: recorder || '',
      storage: storage || '',
      additionalRequirements: additionalRequirements || '',
      preferredContact: preferredContact || '',
      preferredVisitDate: preferredVisitDate ? new Date(preferredVisitDate) : null,
      preferredVisitTime: preferredVisitTime || '',
      customerId,
      status: 'New',
    };

    const quoteRequest = await QuoteRequest.create(quoteData);

    // Notify admins asynchronously
    try {
      const admins = await User.find({ role: 'admin' }).select('_id');
      for (const admin of admins) {
        await notificationService.createNotification(
          admin._id,
          `New ${quoteRequest.serviceCategory} Quote Request`,
          `A new ${quoteRequest.serviceCategory} quote request ${quoteRequest.requestId} has been submitted by ${quoteRequest.fullName}.`,
          'quote_request_created'
        );
      }
    } catch (err) {
      console.error('Failed to dispatch admin notifications for quote request:', err.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Quote request submitted successfully',
      data: {
        id: quoteRequest._id,
        requestId: quoteRequest.requestId,
        fullName: quoteRequest.fullName,
        locality: quoteRequest.locality,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List quote requests with filters (Admin only)
 */
async function getQuoteRequests(req, res, next) {
  try {
    const { search, status, propertyType, requirementType, area, date, assignedTo, serviceCategory } = req.query;
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
        { companyName: searchRegex },
      ];
    }

    if (serviceCategory && serviceCategory !== 'All') {
      filter.serviceCategory = serviceCategory;
    }

    if (status && status !== 'All') {
      filter.status = status;
    }
    if (propertyType && propertyType !== 'All') {
      filter.propertyType = propertyType;
    }
    if (requirementType && requirementType !== 'All') {
      filter.requirementType = requirementType;
    }
    if (area && area !== 'All') {
      filter.locality = new RegExp(area, 'i');
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
      .populate('customerId', 'name email mobileNumber customerId');

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote Request not found' });
    }
    return res.json({ success: true, data: quote });
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

    if (quote.status === 'Converted to Booking') {
      return res.status(400).json({ success: false, message: 'This quote request has already been converted to a booking' });
    }

    // 1. Find or create Client User based on mobile number
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

    // 2. Find or create Address
    let addr = await Address.findOne({ userId: clientUser._id });
    if (!addr) {
      addr = await Address.create({
        userId: clientUser._id,
        address: quote.address,
        pincode: quote.pincode || '',
      });
    }

    // 3. Create Job booking if it does not already exist
    let existingJob = await Job.findOne({ quoteRequestId: quote.requestId });
    if (!existingJob) {
      const isCctv = quote.serviceCategory === 'CCTV';
      const title = isCctv 
        ? (quote.requirementType ? `CCTV ${quote.requirementType}` : 'CCTV Installation')
        : `${quote.serviceCategory || 'Quote'} Services`;

      const jobData = {
        title,
        description: quote.additionalRequirements || `Created from Quote Request ID: ${quote.requestId}`,
        location: quote.address,
        client: clientUser._id,
        customerName: quote.fullName,
        customerPhone: quote.mobile,
        scheduledTime: quote.preferredVisitDate ? `${new Date(quote.preferredVisitDate).toISOString().split('T')[0]} ${quote.preferredVisitTime || 'ASAP'}` : 'ASAP',
        status: 'pending',
        useNewFlow: true,
        bookingDate: quote.preferredVisitDate ? new Date(quote.preferredVisitDate).toISOString().split('T')[0] : '',
        timeSlot: quote.preferredVisitTime || '',
        addressId: addr ? addr._id : undefined,
        googleMapsLink: quote.googleMapsUrl || (quote.latitude && quote.longitude ? `https://www.google.com/maps?q=${quote.latitude},${quote.longitude}` : ''),
        latitude: quote.latitude,
        longitude: quote.longitude,
        addressDetails: {
          area: quote.locality || '',
          pincode: quote.pincode || '',
          formattedAddress: quote.address || '',
        },
        quoteRequestId: quote.requestId,
      };

      if (isCctv) {
        const cleanCameraCount = Number(quote.cameraCount.split(/[^\d]+/)[0]) || 4;
        jobData.cctvDetails = {
          propertyType: quote.propertyType || 'Home',
          cameraCount: cleanCameraCount,
          cameraTypes: [
            {
              type: quote.cameraRequirement === 'Indoor' ? 'Dome Camera' : 'Bullet Camera',
              quantity: cleanCameraCount,
            },
          ],
        };
      }

      existingJob = await Job.create(jobData);
    }

    // 4. Update Quote Request status
    quote.status = 'Converted to Booking';
    await quote.save();

    return res.json({ success: true, data: { job: existingJob, quote } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitQuoteRequest,
  getQuoteRequests,
  getQuoteRequestDetails,
  updateQuoteRequest,
  convertToBooking,
};
