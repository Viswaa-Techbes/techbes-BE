const Apartment = require('../../models/Apartment');
const User = require('../../models/User');
const SupportTicket = require('../../models/SupportTicket');
const bcrypt = require('bcryptjs');

// ─── APARTMENT MASTER (ADMIN) ──────────────────────────────────────────────────

/**
 * List all apartments
 */
async function getApartments(req, res, next) {
  try {
    const apartments = await Apartment.find()
      .populate('associationUsers', 'name mobileNumber email role')
      .sort({ name: 1 })
      .lean();

    // Attach count statistics
    const withCounts = await Promise.all(
      apartments.map(async (apt) => {
        const ticketCount = await SupportTicket.countDocuments({ apartmentId: apt._id });
        const openTickets = await SupportTicket.countDocuments({
          apartmentId: apt._id,
          status: { $in: ['Open', 'In Progress'] },
        });
        return {
          ...apt,
          residentsCount: (apt.residents || []).length,
          associationCount: (apt.associationUsers || []).length,
          ticketCount,
          openTickets,
        };
      })
    );

    return res.json({ success: true, data: withCounts });
  } catch (err) {
    next(err);
  }
}

/**
 * Get apartment details
 */
async function getApartmentById(req, res, next) {
  try {
    const apartment = await Apartment.findById(req.params.id)
      .populate('associationUsers', 'name mobileNumber email role')
      .lean();

    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }

    const tickets = await SupportTicket.find({ apartmentId: apartment._id })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({
      success: true,
      data: {
        ...apartment,
        tickets,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create apartment
 */
async function createApartment(req, res, next) {
  try {
    const { name, address, locality, city = 'Bangalore', pincode, contactPerson, contactPhone, contactEmail } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Apartment name is required' });
    }
    if (!address || !address.trim()) {
      return res.status(400).json({ success: false, message: 'Apartment address is required' });
    }

    const existing = await Apartment.findOne({ name: new RegExp(`^${name.trim()}$`, 'i') });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An apartment with this name already exists' });
    }

    const apartment = await Apartment.create({
      name: name.trim(),
      address: address.trim(),
      locality: locality?.trim() || '',
      city: city?.trim() || 'Bangalore',
      pincode: pincode?.trim() || '',
      contactPerson: contactPerson?.trim() || '',
      contactPhone: contactPhone?.trim() || '',
      contactEmail: contactEmail?.trim() || '',
      associationUsers: [],
      residents: [],
    });

    return res.status(201).json({ success: true, data: apartment });
  } catch (err) {
    next(err);
  }
}

/**
 * Update apartment
 */
async function updateApartment(req, res, next) {
  try {
    const apartment = await Apartment.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }
    return res.json({ success: true, data: apartment });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete apartment
 */
async function deleteApartment(req, res, next) {
  try {
    const apartment = await Apartment.findById(req.params.id);
    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }

    // Clean up association users and residents
    if (apartment.associationUsers && apartment.associationUsers.length > 0) {
      await User.deleteMany({ _id: { $in: apartment.associationUsers } });
    }
    const residentUserIds = (apartment.residents || [])
      .map((r) => r.userId)
      .filter(Boolean);
    if (residentUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: residentUserIds } });
    }

    await Apartment.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Apartment deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── ASSOCIATION USERS (ADMIN) ────────────────────────────────────────────────

/**
 * Create or assign Association User (Max 3 per apartment)
 */
async function createAssociationUser(req, res, next) {
  try {
    const { id } = req.params;
    const { name, mobileNumber, email, password } = req.body;

    const apartment = await Apartment.findById(id);
    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }

    if ((apartment.associationUsers || []).length >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Maximum limit reached: each apartment association supports exactly 3 association login users.',
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (!mobileNumber || !mobileNumber.trim()) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const cleanMobile = mobileNumber.trim();
    let existingUser = await User.findOne({ mobileNumber: cleanMobile });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this mobile number already exists in the system',
      });
    }

    // Create new association user
    const user = await User.create({
      name: name.trim(),
      mobileNumber: cleanMobile,
      email: email?.trim() || undefined,
      password, // hashed automatically by User pre-save hook
      role: 'association',
      apartmentId: apartment._id,
      userType: 'web_user',
    });

    apartment.associationUsers.push(user._id);
    await apartment.save();

    return res.status(201).json({
      success: true,
      message: 'Association user created successfully',
      data: user.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Remove Association User from Apartment
 */
async function removeAssociationUser(req, res, next) {
  try {
    const { id, userId } = req.params;
    const apartment = await Apartment.findById(id);
    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }

    apartment.associationUsers = (apartment.associationUsers || []).filter(
      (uId) => uId.toString() !== userId
    );
    await apartment.save();

    await User.findByIdAndDelete(userId);

    return res.json({ success: true, message: 'Association user removed successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── RESIDENTS (ADMIN & ASSOCIATION) ──────────────────────────────────────────

/**
 * Add Resident to Apartment
 */
async function addResident(req, res, next) {
  try {
    const { id } = req.params;
    const { flatNumber, name, phone, email, password } = req.body;

    const apartment = await Apartment.findById(id);
    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }

    if (!flatNumber || !flatNumber.trim()) {
      return res.status(400).json({ success: false, message: 'Flat number is required' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Resident name is required' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Resident phone is required' });
    }

    const cleanFlat = flatNumber.trim().toUpperCase();
    const cleanPhone = phone.trim();

    // Check duplicate flat
    const existingFlat = (apartment.residents || []).find((r) => r.flatNumber === cleanFlat);
    if (existingFlat) {
      return res.status(409).json({ success: false, message: `Flat ${cleanFlat} is already registered in this apartment` });
    }

    // Create resident user login account if password provided
    let residentUserId = null;
    if (password && password.length >= 6) {
      const existingUser = await User.findOne({ mobileNumber: cleanPhone });
      if (existingUser) {
        existingUser.role = 'resident';
        existingUser.apartmentId = apartment._id;
        existingUser.flatNumber = cleanFlat;
        await existingUser.save();
        residentUserId = existingUser._id;
      } else {
        const newUser = await User.create({
          name: name.trim(),
          mobileNumber: cleanPhone,
          email: email?.trim() || undefined,
          password,
          role: 'resident',
          apartmentId: apartment._id,
          flatNumber: cleanFlat,
          userType: 'web_user',
        });
        residentUserId = newUser._id;
      }
    }

    const residentRecord = {
      flatNumber: cleanFlat,
      name: name.trim(),
      phone: cleanPhone,
      email: email?.trim() || '',
      userId: residentUserId,
      status: 'active',
    };

    apartment.residents.push(residentRecord);
    await apartment.save();

    return res.status(201).json({
      success: true,
      message: 'Resident added successfully',
      data: residentRecord,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Remove Resident from Apartment
 */
async function removeResident(req, res, next) {
  try {
    const { id, residentId } = req.params;
    const apartment = await Apartment.findById(id);
    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }

    const resident = apartment.residents.id(residentId);
    if (resident && resident.userId) {
      await User.findByIdAndDelete(resident.userId);
    }

    apartment.residents = apartment.residents.filter(
      (r) => r._id.toString() !== residentId
    );
    await apartment.save();

    return res.json({ success: true, message: 'Resident removed successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── TICKETING ENGINE & ACCESS RULES (PARTS 18, 19, 21, 22, 24) ───────────────

/**
 * Create ticket (Association, Resident, or Admin)
 */
async function createTicket(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const { subject, description, category = 'Other', priority = 'Medium', voiceNote, attachments } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, message: 'Ticket subject is required' });
    }

    let ticketData = {
      subject: subject.trim(),
      description: description?.trim() || '',
      category,
      priority,
      status: 'Open',
      messages: [{ sender: user._id, text: description || subject }],
    };

    if (voiceNote) ticketData.voiceNote = voiceNote;
    if (Array.isArray(attachments)) ticketData.attachments = attachments;

    // Association Member Ticket
    if (user.role === 'association') {
      if (!user.apartmentId) {
        return res.status(400).json({ success: false, message: 'Association user is not linked to an apartment' });
      }

      const apartment = await Apartment.findById(user.apartmentId);
      if (!apartment) {
        return res.status(404).json({ success: false, message: 'Apartment not found' });
      }

      ticketData.customer = user._id;
      ticketData.apartmentId = apartment._id;
      ticketData.companyId = apartment._id;
      ticketData.apartmentName = apartment.name;
      ticketData.raisedByType = 'association';
      ticketData.raisedByUserId = user._id;
      ticketData.raisedByName = user.name;
      ticketData.raisedByPhone = user.mobileNumber;
    }
    // Resident Ticket
    else if (user.role === 'resident') {
      if (!user.apartmentId || !user.flatNumber) {
        return res.status(400).json({ success: false, message: 'Resident is not associated with an apartment and flat' });
      }

      const apartment = await Apartment.findById(user.apartmentId);
      if (!apartment) {
        return res.status(404).json({ success: false, message: 'Apartment not found' });
      }

      // RULE 21: Backend derives and enforces flat ownership strictly!
      // Resident can ONLY raise tickets for their OWN flat.
      ticketData.customer = user._id;
      ticketData.apartmentId = apartment._id;
      ticketData.companyId = apartment._id;
      ticketData.apartmentName = apartment.name;
      ticketData.raisedByType = 'resident';
      ticketData.raisedByUserId = user._id;
      ticketData.raisedByName = user.name;
      ticketData.raisedByPhone = user.mobileNumber;
      ticketData.residentId = user._id;
      ticketData.flatNumber = user.flatNumber;
      ticketData.flatId = user.flatNumber;
    }
    // Admin Ticket
    else if (user.role === 'admin') {
      const { apartmentId, raisedByType = 'association', flatNumber, residentName, residentPhone } = req.body;
      if (apartmentId) {
        const apartment = await Apartment.findById(apartmentId);
        if (apartment) {
          ticketData.apartmentId = apartment._id;
          ticketData.companyId = apartment._id;
          ticketData.apartmentName = apartment.name;
          ticketData.raisedByType = raisedByType;
          ticketData.flatNumber = flatNumber || '';
          ticketData.raisedByName = residentName || user.name;
          ticketData.raisedByPhone = residentPhone || user.mobileNumber;
        }
      }
      ticketData.customer = user._id;
      ticketData.raisedByUserId = user._id;
    }
    // Standard customer
    else {
      ticketData.customer = user._id;
      ticketData.raisedByType = 'customer';
      ticketData.raisedByName = user.name;
      ticketData.raisedByPhone = user.mobileNumber;
    }

    const ticket = await SupportTicket.create(ticketData);

    return res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      data: ticket,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List tickets based on user role and apartment scoping
 * RULE 19: All 3 association users belonging to same apartment can view that apartment's tickets.
 * RULE 21: Residents can view ONLY their own flat tickets.
 * RULE 24: IDOR protection enforced on backend.
 */
async function getTickets(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const filter = {};

    // 1. Admin: can view all tickets, with filters
    if (user.role === 'admin') {
      const { apartmentId, raisedByType, flatNumber, status, category, date } = req.query;

      if (apartmentId && apartmentId !== 'All') {
        filter.apartmentId = apartmentId;
      }
      if (raisedByType && raisedByType !== 'All') {
        filter.raisedByType = raisedByType;
      }
      if (flatNumber && flatNumber.trim()) {
        filter.flatNumber = new RegExp(flatNumber.trim(), 'i');
      }
      if (status && status !== 'All') {
        filter.status = status;
      }
      if (category && category !== 'All') {
        filter.category = category;
      }
      if (date) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        filter.createdAt = { $gte: start, $lte: end };
      }
    }
    // 2. Association: ALL 3 association members of that apartment can view all tickets of that apartment
    else if (user.role === 'association') {
      if (!user.apartmentId) {
        return res.json({ success: true, data: [] });
      }
      filter.apartmentId = user.apartmentId;
    }
    // 3. Resident: can view ONLY their own flat tickets
    else if (user.role === 'resident') {
      if (!user.apartmentId || !user.flatNumber) {
        return res.json({ success: true, data: [] });
      }
      filter.apartmentId = user.apartmentId;
      filter.flatNumber = user.flatNumber;
      filter.raisedByType = 'resident';
    }
    // 4. Regular client: can view only own tickets
    else {
      filter.customer = user._id;
    }

    const tickets = await SupportTicket.find(filter)
      .populate('apartmentId', 'name address')
      .populate('customer', 'name mobileNumber')
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: tickets });
  } catch (err) {
    next(err);
  }
}

/**
 * Get ticket details by ID with strict IDOR access control
 */
async function getTicketById(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const ticket = await SupportTicket.findById(req.params.id)
      .populate('apartmentId', 'name address')
      .populate('messages.sender', 'name role');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Role-based IDOR checks
    if (user.role === 'admin') {
      // Admin has full access
    } else if (user.role === 'association') {
      if (!ticket.apartmentId || ticket.apartmentId._id.toString() !== user.apartmentId.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied to tickets of other apartments' });
      }
    } else if (user.role === 'resident') {
      if (
        !ticket.apartmentId ||
        ticket.apartmentId._id.toString() !== user.apartmentId.toString() ||
        ticket.flatNumber !== user.flatNumber
      ) {
        return res.status(403).json({ success: false, message: 'Access denied: residents can view only their own flat tickets' });
      }
    } else {
      if (ticket.customer.toString() !== user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    return res.json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
}

/**
 * Reply to a ticket or update status
 */
async function replyToTicket(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const { text, status, images } = req.body;

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // IDOR Check
    if (user.role === 'association') {
      if (ticket.apartmentId?.toString() !== user.apartmentId?.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } else if (user.role === 'resident') {
      if (
        ticket.apartmentId?.toString() !== user.apartmentId?.toString() ||
        ticket.flatNumber !== user.flatNumber
      ) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (text) {
      ticket.messages.push({
        sender: user._id,
        text,
        images: Array.isArray(images) ? images : [],
      });
    }

    if (status && ['Open', 'In Progress', 'Resolved', 'Closed', 'Escalated'].includes(status)) {
      ticket.status = status;
    }

    await ticket.save();

    const populated = await SupportTicket.findById(ticket._id)
      .populate('apartmentId', 'name address')
      .populate('messages.sender', 'name role');

    return res.json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getApartments,
  getApartmentById,
  createApartment,
  updateApartment,
  deleteApartment,
  createAssociationUser,
  removeAssociationUser,
  addResident,
  removeResident,
  createTicket,
  getTickets,
  getTicketById,
  replyToTicket,
};
