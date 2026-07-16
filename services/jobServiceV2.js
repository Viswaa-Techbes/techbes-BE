const Job = require('../models/Job');
const User = require('../models/User');
const TechnicianLocation = require('../models/TechnicianLocation');

async function createBookingV2(bookingData) {
  const {
    clientId,
    service,
    serviceId,
    serviceName,
    address,
    description,
    scheduledTime,
    date,
    timeSlot,
    lat,
    lng,
    customerName,
    customerPhone,
    cctvDetails,
    addressId,
    googleMapsLink,
    googleMapLink,
    products,
  } = bookingData;

  // 1. Date Validation (Check for past dates)
  if (date) {
    const bookingDateObj = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    bookingDateObj.setHours(0, 0, 0, 0);
    if (bookingDateObj < today) {
      const err = new Error('Booking date cannot be in the past');
      err.statusCode = 400;
      throw err;
    }
  }

  // 2. Time Slot Validation (Check if already booked)
  if (date && timeSlot) {
    const existingBooking = await Job.findOne({
      bookingDate: date,
      timeSlot: timeSlot,
      status: { $ne: 'Cancelled' }
    });
    if (existingBooking) {
      const err = new Error('The selected time slot is already booked. Please choose another slot.');
      err.statusCode = 400;
      throw err;
    }
  }

  // 3. Remove Cash on Delivery Validation
  if (bookingData.paymentMethod === 'cod') {
    const err = new Error('Cash on Delivery is no longer accepted. Please pay online or via Wallet.');
    err.statusCode = 400;
    throw err;
  }
  const grandTotal = Number(
    cctvDetails?.priceBreakdown?.grandTotal ?? bookingData.totalAmount ?? bookingData.priceValue ?? 0
  ) || 0;

  const derivedMapsLink = googleMapsLink || googleMapLink || cctvDetails?.mapLink || '';

  const job = await Job.create({
    title: serviceName || service || 'Service Request',
    description,
    location: address,
    client: clientId,
    customerName: customerName || '',
    customerPhone: customerPhone || '',
    scheduledTime: scheduledTime || (date && timeSlot ? `${date} ${timeSlot}` : 'ASAP'),
    status: 'pending',
    useNewFlow: true,
    appId: 'technician-v2',
    bookingDate: date || '',
    timeSlot: timeSlot || '',
    serviceId: serviceId || service || '',
    serviceName: serviceName || service || '',
    addressId: addressId || undefined,
    googleMapsLink: derivedMapsLink,
    latitude: Number(bookingData.latitude || lat || null),
    longitude: Number(bookingData.longitude || lng || null),
    addressDetails: {
      houseNumber: bookingData.houseNumber || '',
      street: bookingData.street || '',
      area: bookingData.area || '',
      landmark: bookingData.landmark || '',
      city: bookingData.city || '',
      district: bookingData.district || '',
      state: bookingData.state || '',
      pincode: bookingData.pincode || '',
      country: bookingData.country || '',
      manualNotes: bookingData.manualNotes || '',
      formattedAddress: bookingData.formattedAddress || address || '',
      addressType: bookingData.addressType || 'home',
    },
    // Pricing fields
    price: grandTotal,
    amount: grandTotal,
    advanceAmount: Math.round(grandTotal / 2),
    remainingAmount: Math.max(grandTotal - Math.round(grandTotal / 2), 0),
    products: products || cctvDetails?.products || undefined,
    cctvDetails: cctvDetails ? {
      ...cctvDetails,
      products: cctvDetails.products || products || undefined
    } : undefined,
    v2Metadata: {
      lat: String(lat || ''),
      lng: String(lng || ''),
      latitude: String(bookingData.latitude || lat || ''),
      longitude: String(bookingData.longitude || lng || ''),
      city: String(bookingData.city || ''),
      state: String(bookingData.state || ''),
      pincode: String(bookingData.pincode || ''),
      houseNumber: String(bookingData.houseNumber || ''),
      street: String(bookingData.street || ''),
      area: String(bookingData.area || ''),
      landmark: String(bookingData.landmark || ''),
      district: String(bookingData.district || ''),
      country: String(bookingData.country || ''),
      manualNotes: String(bookingData.manualNotes || ''),
      formattedAddress: String(bookingData.formattedAddress || address || ''),
    }
  });

  return job;
}

async function assignBookingV2(jobId, technicianId, managerId) {
  const technician = await User.findOne({ _id: technicianId, role: 'technician' });
  if (!technician) throw new Error('Technician not found');

  const job = await Job.findOneAndUpdate(
    { _id: jobId, assignedTechnician: null },
    {
      assignedTechnician: technicianId,
      assignedManager: managerId,
      status: 'assigned',
    },
    { new: true }
  );

  if (!job) {
    const checkJob = await Job.findById(jobId);
    if (!checkJob) throw new Error('Job not found');
    if (checkJob.assignedTechnician) {
      throw new Error('Job is already assigned to a technician');
    }
    throw new Error('Failed to assign booking');
  }

  return job;
}

async function acceptJobV2(jobId, technicianId) {
  const job = await Job.findOne({ _id: jobId, assignedTechnician: technicianId });
  if (!job) throw new Error('Job not found or not assigned to you');

  job.status = 'in_progress';
  job.acceptedAt = new Date();
  await job.save();

  return job;
}

async function updateLiveLocation(technicianId, lat, lng) {
  return await TechnicianLocation.findOneAndUpdate(
    { technicianId },
    { lat, lng, updatedAt: new Date() },
    { upsert: true, new: true }
  );
}

async function getTechnicianLocation(technicianId) {
  return await TechnicianLocation.findOne({ technicianId });
}

async function listJobsV2(query = {}) {
  return await Job.find({ ...query, useNewFlow: true })
    .sort({ createdAt: -1 })
    .populate('assignedTechnician', 'name email status')
    .populate('client', 'name phone email')
    .lean();
}

module.exports = {
  createBookingV2,
  assignBookingV2,
  acceptJobV2,
  updateLiveLocation,
  getTechnicianLocation,
  listJobsV2,
};
