const Apartment = require('../../models/Apartment');
const User = require('../../models/User');
const SupportTicket = require('../../models/SupportTicket');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { signToken } = require('../../utils/jwt');
const notificationService = require('../../services/notificationService');

// Helper to generate 6-digit activation code
function generateActivationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Helper to generate a unique Resident ID
function generateResidentId(apartment, flatNumber) {
  const prefix = (apartment?.name || 'APT')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase();
  const cleanFlat = String(flatNumber || '').replace(/[^A-Za-z0-9]/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  return `RES-${prefix}-${cleanFlat}-${rand}`;
}

// ─── APARTMENT MASTER (ADMIN & ASSOCIATION) ───────────────────────────────────

/**
 * List all apartments with comprehensive statistics (residents, committee users, open complaints)
 */
async function getApartments(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const filter = {};

    // Association members are scoped strictly to their own apartment
    if (user.role === 'association') {
      if (!user.apartmentId) {
        return res.json({ success: true, data: [] });
      }
      filter._id = user.apartmentId;
    }

    const { search } = req.query;
    if (search && search.trim()) {
      filter.$or = [
        { name: new RegExp(search.trim(), 'i') },
        { address: new RegExp(search.trim(), 'i') },
        { city: new RegExp(search.trim(), 'i') },
        { locality: new RegExp(search.trim(), 'i') },
      ];
    }

    const apartments = await Apartment.find(filter)
      .populate('associationUsers', 'name mobileNumber email role')
      .sort({ name: 1 })
      .lean();

    // Attach accurate counts
    const withCounts = await Promise.all(
      apartments.map(async (apt) => {
        const ticketCount = await SupportTicket.countDocuments({ apartmentId: apt._id });
        const openTickets = await SupportTicket.countDocuments({
          apartmentId: apt._id,
          status: { $in: ['New', 'Open', 'Acknowledged', 'Assigned', 'In Progress', 'Reopened'] },
        });
        const activeResidentsCount = (apt.residents || []).filter(r => r.status === 'active').length;

        return {
          ...apt,
          residentsCount: (apt.residents || []).length,
          activeResidentsCount,
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
 * Get apartment details by ID (with IDOR check for association users)
 */
async function getApartmentById(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const { id } = req.params;

    // IDOR check: association users can ONLY view their own apartment
    if (user.role === 'association') {
      if (!user.apartmentId || user.apartmentId.toString() !== id) {
        return res.status(403).json({ success: false, message: 'Access denied to other apartment records' });
      }
    }

    const apartment = await Apartment.findById(id)
      .populate('associationUsers', 'name mobileNumber email role')
      .lean();

    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }

    // Fetch tickets for this apartment
    const tickets = await SupportTicket.find({ apartmentId: apartment._id })
      .populate('assignedStaff', 'name mobileNumber phone')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const openTicketsCount = tickets.filter(t =>
      ['New', 'Open', 'Acknowledged', 'Assigned', 'In Progress', 'Reopened'].includes(t.status)
    ).length;

    return res.json({
      success: true,
      data: {
        ...apartment,
        openTicketsCount,
        tickets,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create apartment (Admin only)
 */
async function createApartment(req, res, next) {
  try {
    const {
      name,
      address,
      locality,
      city = 'Bangalore',
      state = 'Karnataka',
      pincode,
      contactPerson,
      contactPhone,
      contactMobile,
      contactEmail,
      blocks,
      totalFlats,
      notes,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Apartment name is required' });
    }

    let addressStr = '';
    if (typeof address === 'string') {
      addressStr = address.trim();
    } else if (address && typeof address === 'object') {
      addressStr = [
        address.street,
        address.locality || locality,
        address.city || city,
        address.state || state,
        address.pincode || pincode,
      ]
        .filter(Boolean)
        .join(', ');
    }
    if (!addressStr) {
      addressStr = (locality || city || 'Bangalore').trim();
    }

    const existing = await Apartment.findOne({ name: new RegExp(`^${name.trim()}$`, 'i') });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An apartment with this name already exists' });
    }

    const cleanBlocks = Array.isArray(blocks)
      ? blocks.map(b => ({
          name: String(b.name || '').trim(),
          floors: parseInt(b.floors, 10) || 1,
          flatsCount: parseInt(b.flatsCount, 10) || 0,
        })).filter(b => Boolean(b.name))
      : [];

    const apartment = await Apartment.create({
      name: name.trim(),
      address: addressStr,
      locality: locality?.trim() || (typeof address === 'object' ? address.locality || '' : ''),
      city: city?.trim() || (typeof address === 'object' ? address.city || 'Bangalore' : 'Bangalore'),
      state: state?.trim() || (typeof address === 'object' ? address.state || 'Karnataka' : 'Karnataka'),
      pincode: pincode?.trim() || (typeof address === 'object' ? address.pincode || '' : ''),
      contactPerson: contactPerson?.trim() || '',
      contactPhone: (contactPhone || contactMobile)?.trim() || '',
      contactEmail: contactEmail?.trim() || '',
      blocks: cleanBlocks,
      totalFlats: parseInt(totalFlats, 10) || 0,
      notes: notes?.trim() || '',
      associationUsers: [],
      residents: [],
    });

    return res.status(201).json({ success: true, data: apartment });
  } catch (err) {
    next(err);
  }
}

/**
 * Update apartment (Admin only)
 */
async function updateApartment(req, res, next) {
  try {
    const updateData = { ...req.body };
    if (updateData.address && typeof updateData.address === 'object') {
      updateData.address = [
        updateData.address.street,
        updateData.address.locality || updateData.locality,
        updateData.address.city || updateData.city,
        updateData.address.state || updateData.state,
        updateData.address.pincode || updateData.pincode,
      ]
        .filter(Boolean)
        .join(', ');
    }

    if (updateData.contactMobile && !updateData.contactPhone) {
      updateData.contactPhone = updateData.contactMobile;
    }

    if (Array.isArray(updateData.blocks)) {
      updateData.blocks = updateData.blocks
        .map(b => ({
          name: String(b.name || '').trim(),
          floors: parseInt(b.floors, 10) || 1,
          flatsCount: parseInt(b.flatsCount, 10) || 0,
        }))
        .filter(b => Boolean(b.name));
    }

    const apartment = await Apartment.findByIdAndUpdate(req.params.id, updateData, {
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
 * Delete apartment safely
 */
async function deleteApartment(req, res, next) {
  try {
    const apartment = await Apartment.findById(req.params.id);
    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }

    // Clean up associated committee user logins
    if (apartment.associationUsers && apartment.associationUsers.length > 0) {
      await User.deleteMany({ _id: { $in: apartment.associationUsers } });
    }

    // Clean up resident user accounts
    const residentUserIds = (apartment.residents || [])
      .map(r => r.userId)
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

// ─── ASSOCIATION COMMITTEE USERS (MAX 3 ACCOUNTS PER APARTMENT) ───────────────

/**
 * Create or assign Association User (strictly max 3 per apartment)
 */
async function createAssociationUser(req, res, next) {
  try {
    const { id } = req.params;
    const { name, mobileNumber, mobile, phone, email, password } = req.body;

    const apartment = await Apartment.findById(id);
    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }

    // Enforce 3-user limit strictly on backend
    if ((apartment.associationUsers || []).length >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Maximum limit reached: each apartment association is strictly limited to 3 committee accounts.',
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    const rawMobile = mobileNumber || mobile || phone;
    if (!rawMobile || !rawMobile.trim()) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }
    const userPassword = (password && password.length >= 6) ? password : Math.random().toString(36).slice(-8) + 'Ab#1';

    const cleanMobile = rawMobile.trim();
    let existingUser = await User.findOne({ mobileNumber: cleanMobile });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this mobile number already exists in the system',
      });
    }

    // Create association committee user
    const user = await User.create({
      name: name.trim(),
      mobileNumber: cleanMobile,
      email: email?.trim() || undefined,
      password: userPassword, // hashed automatically by User pre-save hook
      role: 'association',
      apartmentId: apartment._id,
      userType: 'web_user',
    });

    apartment.associationUsers.push(user._id);
    await apartment.save();

    return res.status(201).json({
      success: true,
      message: 'Association committee account created successfully',
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
      uId => uId.toString() !== userId
    );
    await apartment.save();

    await User.findByIdAndDelete(userId);

    return res.json({ success: true, message: 'Association user removed successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── RESIDENT REGISTRY (ADMIN & ASSOCIATION) ──────────────────────────────────

/**
 * Add Resident to Apartment Registry
 */
async function addResident(req, res, next) {
  try {
    const authUser = req.authUser || (await User.findById(req.user.id));
    const { id } = req.params;
    const {
      flatNumber,
      block = '',
      floor = '',
      name,
      phone,
      email,
      residentType = 'owner',
      moveInDate,
      emergencyContact,
      password,
    } = req.body;

    // IDOR check: association users can ONLY add to their own apartment
    if (authUser.role === 'association' && authUser.apartmentId.toString() !== id) {
      return res.status(403).json({ success: false, message: 'Access denied: cannot add residents to other apartments' });
    }

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

    // Prevent duplicate active resident in the same flat of this apartment
    const existingActiveFlat = (apartment.residents || []).find(
      r => r.flatNumber === cleanFlat && r.status === 'active'
    );
    if (existingActiveFlat) {
      return res.status(409).json({
        success: false,
        message: `Flat ${cleanFlat} currently has an active resident (${existingActiveFlat.name}). Please mark them as Vacated before assigning a new active resident.`,
      });
    }

    const uniqueResidentId = generateResidentId(apartment, cleanFlat);

    let residentUserId = null;
    let accountStatus = 'unregistered';
    let activationCode = '';
    let activationExpires = null;

    // If admin set password directly, activate immediately
    if (password && password.length >= 6) {
      let existingUser = await User.findOne({ mobileNumber: cleanPhone });
      if (existingUser) {
        existingUser.role = 'resident';
        existingUser.apartmentId = apartment._id;
        existingUser.flatNumber = cleanFlat;
        existingUser.block = block?.trim() || '';
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
          block: block?.trim() || '',
          userType: 'web_user',
        });
        residentUserId = newUser._id;
      }
      accountStatus = 'active';
    } else {
      // Secure Invitation / Activation code flow (7 days expiry)
      activationCode = generateActivationCode();
      activationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      accountStatus = 'invited';
    }

    const residentRecord = {
      residentId: uniqueResidentId,
      flatNumber: cleanFlat,
      block: block?.trim() || '',
      floor: floor?.trim() || '',
      name: name.trim(),
      phone: cleanPhone,
      email: email?.trim() || '',
      residentType: residentType === 'tenant' ? 'tenant' : 'owner',
      status: 'active',
      moveInDate: moveInDate ? new Date(moveInDate) : new Date(),
      emergencyContact: {
        name: emergencyContact?.name?.trim() || '',
        phone: emergencyContact?.phone?.trim() || '',
        relation: emergencyContact?.relation?.trim() || '',
      },
      userId: residentUserId,
      accountStatus,
      activationCode,
      activationExpires,
    };

    apartment.residents.push(residentRecord);
    await apartment.save();

    return res.status(201).json({
      success: true,
      message: 'Resident added to apartment registry successfully',
      data: residentRecord,
    });
  } catch (err) {
    next(err);
  }
}

function findResident(apartment, residentId) {
  if (!apartment || !Array.isArray(apartment.residents)) return null;
  // Try subdocument id if valid ObjectId
  let res = null;
  try {
    res = apartment.residents.id(residentId);
  } catch (e) {
    res = null;
  }
  if (!res) {
    res = apartment.residents.find(
      r => r.residentId === residentId || r._id.toString() === residentId
    );
  }
  return res;
}

/**
 * Update resident in Apartment Registry
 */
async function updateResident(req, res, next) {
  try {
    const authUser = req.authUser || (await User.findById(req.user.id));
    const { id, residentId } = req.params;
    const {
      name,
      phone,
      email,
      block,
      floor,
      flatNumber,
      residentType,
      status,
      moveInDate,
      emergencyContact,
    } = req.body;

    if (authUser.role === 'association' && authUser.apartmentId.toString() !== id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const apartment = await Apartment.findById(id);
    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }

    const resident = findResident(apartment, residentId);
    if (!resident) {
      return res.status(404).json({ success: false, message: 'Resident record not found' });
    }

    if (name) resident.name = name.trim();
    if (phone) resident.phone = phone.trim();
    if (email !== undefined) resident.email = email.trim();
    if (block !== undefined) resident.block = block.trim();
    if (floor !== undefined) resident.floor = floor.trim();
    if (flatNumber) resident.flatNumber = flatNumber.trim().toUpperCase();
    if (residentType) resident.residentType = residentType === 'tenant' ? 'tenant' : 'owner';
    if (moveInDate) resident.moveInDate = new Date(moveInDate);
    if (emergencyContact) {
      resident.emergencyContact = {
        name: emergencyContact.name?.trim() || resident.emergencyContact?.name || '',
        phone: emergencyContact.phone?.trim() || resident.emergencyContact?.phone || '',
        relation: emergencyContact.relation?.trim() || resident.emergencyContact?.relation || '',
      };
    }

    // Handle occupancy status change (e.g. marking as Vacated)
    if (status && ['active', 'vacated', 'inactive'].includes(status)) {
      resident.status = status;
      if (status === 'vacated' && resident.userId) {
        // Deactivate login but preserve tickets history
        await User.findByIdAndUpdate(resident.userId, { isOnline: false, sessionActive: false });
        resident.accountStatus = 'suspended';
      }
    }

    await apartment.save();

    return res.json({
      success: true,
      message: 'Resident record updated successfully',
      data: resident,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Remove Resident from Apartment Registry
 */
async function removeResident(req, res, next) {
  try {
    const authUser = req.authUser || (await User.findById(req.user.id));
    const { id, residentId } = req.params;

    if (authUser.role === 'association' && authUser.apartmentId.toString() !== id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const apartment = await Apartment.findById(id);
    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }

    const resident = findResident(apartment, residentId);
    if (!resident) {
      return res.status(404).json({ success: false, message: 'Resident record not found' });
    }

    // If resident has a user account, delete or unlink
    if (resident.userId) {
      await User.findByIdAndDelete(resident.userId).catch(() => {});
    }

    apartment.residents = apartment.residents.filter(
      r => r._id.toString() !== resident._id.toString() && r.residentId !== residentId
    );
    await apartment.save();

    return res.json({ success: true, message: 'Resident removed from registry successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * Generate fresh activation invitation for a resident
 */
async function inviteResident(req, res, next) {
  try {
    const { id, residentId } = req.params;
    const apartment = await Apartment.findById(id);
    if (!apartment) {
      return res.status(404).json({ success: false, message: 'Apartment not found' });
    }

    const resident = findResident(apartment, residentId);
    if (!resident) {
      return res.status(404).json({ success: false, message: 'Resident not found' });
    }

    const activationCode = generateActivationCode();
    resident.activationCode = activationCode;
    resident.activationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    resident.accountStatus = 'invited';
    await apartment.save();

    const activationUrl = `${process.env.FRONTEND_URL || 'https://techbes.co.in'}/resident/activate?phone=${encodeURIComponent(resident.phone)}&code=${activationCode}`;

    return res.json({
      success: true,
      message: `Activation invitation generated for ${resident.name}`,
      data: {
        residentName: resident.name,
        phone: resident.phone,
        flatNumber: resident.flatNumber,
        activationCode,
        activationUrl,
        expiresAt: resident.activationExpires,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Public endpoint: Resident activates their own login account with phone, code, and new password
 */
async function activateResident(req, res, next) {
  try {
    const { phone, activationCode, password } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    if (!activationCode || !activationCode.trim()) {
      return res.status(400).json({ success: false, message: 'Activation code is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const cleanPhone = phone.trim();
    const cleanCode = activationCode.trim();

    // Find apartment containing matching resident
    const apartment = await Apartment.findOne({
      'residents.phone': cleanPhone,
      'residents.activationCode': cleanCode,
    });

    if (!apartment) {
      return res.status(400).json({ success: false, message: 'Invalid phone number or activation code' });
    }

    const resident = apartment.residents.find(
      r => r.phone === cleanPhone && r.activationCode === cleanCode
    );

    if (!resident) {
      return res.status(400).json({ success: false, message: 'Activation record not found' });
    }

    if (resident.activationExpires && new Date(resident.activationExpires) < new Date()) {
      return res.status(400).json({ success: false, message: 'Activation code has expired. Please ask your society admin for a fresh code.' });
    }

    // Create or update resident User login
    let user = await User.findOne({ mobileNumber: cleanPhone });
    if (user) {
      user.password = password; // hashed automatically
      user.role = 'resident';
      user.apartmentId = apartment._id;
      user.flatNumber = resident.flatNumber;
      user.block = resident.block || '';
      user.name = resident.name;
      user.isOnline = true;
      user.sessionActive = true;
      user.lastSeen = new Date();
      await user.save();
    } else {
      user = await User.create({
        name: resident.name,
        mobileNumber: cleanPhone,
        email: resident.email || undefined,
        password,
        role: 'resident',
        apartmentId: apartment._id,
        flatNumber: resident.flatNumber,
        block: resident.block || '',
        userType: 'web_user',
        isOnline: true,
        sessionActive: true,
        lastSeen: new Date(),
      });
    }

    // Mark resident as active and clear activation code
    resident.userId = user._id;
    resident.accountStatus = 'active';
    resident.activationCode = '';
    resident.activationExpires = null;
    await apartment.save();

    const token = signToken(user._id, user.role);

    return res.json({
      success: true,
      message: 'Resident account activated successfully! Welcome to TechBes Society Portal.',
      token,
      user: user.toSafeObject(),
      data: {
        token,
        user: user.toSafeObject(),
        apartment: {
          _id: apartment._id,
          name: apartment.name,
          address: apartment.address,
          locality: apartment.locality,
          city: apartment.city,
        },
        resident: {
          residentId: resident.residentId,
          flatNumber: resident.flatNumber,
          block: resident.block,
          residentType: resident.residentType,
          name: resident.name,
          phone: resident.phone,
          status: resident.status,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── RESIDENT COMPLAINTS & SOCIETY TICKETS ───────────────────────────────────

/**
 * Create complaint / ticket
 */
async function createTicket(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const {
      subject,
      description,
      category = 'Other',
      priority = 'Medium',
      voiceNote,
      attachments,
    } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, message: 'Ticket subject is required' });
    }

    // Prevent duplicate submissions within 60 seconds
    const sixtySecsAgo = new Date(Date.now() - 60 * 1000);
    const existingRecent = await SupportTicket.findOne({
      customer: user._id,
      subject: subject.trim(),
      createdAt: { $gte: sixtySecsAgo },
    });
    if (existingRecent) {
      return res.status(409).json({
        success: false,
        message: 'A complaint with this exact title was recently submitted. Please check your existing complaints.',
        data: existingRecent,
      });
    }

    let ticketData = {
      subject: subject.trim(),
      description: description?.trim() || '',
      category,
      priority: ['Low', 'Medium', 'High', 'Emergency', 'Urgent'].includes(priority) ? priority : 'Medium',
      status: 'New',
      messages: [{ sender: user._id, text: description || subject }],
      statusHistory: [
        {
          status: 'New',
          changedBy: user._id,
          changedByName: user.name || 'User',
          reason: 'Complaint submitted',
          timestamp: new Date(),
        },
      ],
    };

    if (voiceNote) ticketData.voiceNote = voiceNote;
    if (Array.isArray(attachments)) ticketData.attachments = attachments;

    // 1. Association Member Ticket
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
    // 2. Resident Ticket (derived strictly from authenticated resident account)
    else if (user.role === 'resident') {
      if (!user.apartmentId || !user.flatNumber) {
        return res.status(400).json({ success: false, message: 'Resident is not associated with an apartment and flat' });
      }

      const apartment = await Apartment.findById(user.apartmentId);
      if (!apartment) {
        return res.status(404).json({ success: false, message: 'Apartment not found' });
      }

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
      ticketData.block = user.block || '';
    }
    // 3. Admin Ticket
    else if (user.role === 'admin') {
      const { apartmentId, raisedByType = 'association', flatNumber, residentName, residentPhone, block } = req.body;
      if (apartmentId) {
        const apartment = await Apartment.findById(apartmentId);
        if (apartment) {
          ticketData.apartmentId = apartment._id;
          ticketData.companyId = apartment._id;
          ticketData.apartmentName = apartment.name;
          ticketData.raisedByType = raisedByType;
          ticketData.flatNumber = flatNumber || '';
          ticketData.block = block || '';
          ticketData.raisedByName = residentName || user.name;
          ticketData.raisedByPhone = residentPhone || user.mobileNumber;
        }
      }
      ticketData.customer = user._id;
      ticketData.raisedByUserId = user._id;
    }
    // 4. Standard customer
    else {
      ticketData.customer = user._id;
      ticketData.raisedByType = 'customer';
      ticketData.raisedByName = user.name;
      ticketData.raisedByPhone = user.mobileNumber;
    }

    const ticket = await SupportTicket.create(ticketData);

    // Notify apartment association committee members if raised by resident
    if (ticket.raisedByType === 'resident' && ticket.apartmentId) {
      const apt = await Apartment.findById(ticket.apartmentId);
      if (apt && Array.isArray(apt.associationUsers)) {
        for (const assocUserId of apt.associationUsers) {
          await notificationService.createNotification(
            assocUserId,
            `New Resident Complaint: Flat ${ticket.flatNumber}`,
            `Flat ${ticket.flatNumber} logged a ${ticket.category} complaint: "${ticket.subject}"`,
            'society_ticket'
          ).catch(() => {});
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      data: ticket,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List tickets based on user role, apartment scoping, filters, and pending ageing
 */
async function getTickets(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const filter = {};

    // 1. Admin: can view all tickets with filters
    if (user.role === 'admin') {
      const { apartmentId, raisedByType, flatNumber, status, category, priority, date, staffId } = req.query;

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
      if (priority && priority !== 'All') {
        filter.priority = priority;
      }
      if (staffId && staffId !== 'All') {
        filter.assignedStaff = staffId;
      }
      if (date) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        filter.createdAt = { $gte: start, $lte: end };
      }
    }
    // 2. Association: ALL 3 association members can view ALL tickets of their apartment
    else if (user.role === 'association') {
      if (!user.apartmentId) {
        return res.json({ success: true, data: [] });
      }
      filter.apartmentId = user.apartmentId;
    }
    // 3. Resident: can view their own flat's and their own submitted tickets
    else if (user.role === 'resident') {
      const orConditions = [{ raisedByUserId: user._id }, { customer: user._id }, { residentId: user._id }];
      if (user.apartmentId && user.flatNumber) {
        orConditions.push({
          apartmentId: user.apartmentId,
          flatNumber: user.flatNumber,
        });
      }
      filter.$or = orConditions;
    }
    // 4. Regular client
    else {
      filter.customer = user._id;
    }

    const tickets = await SupportTicket.find(filter)
      .populate('apartmentId', 'name address locality')
      .populate('customer', 'name mobileNumber')
      .populate('assignedStaff', 'name mobileNumber phone')
      .sort({ createdAt: -1 })
      .lean();

    // Attach ageing calculation (days pending)
    const ticketsWithAgeing = tickets.map(t => {
      const isClosed = ['Resolved', 'Closed'].includes(t.status);
      const createdTime = new Date(t.createdAt).getTime();
      const endTime = isClosed && t.resolvedAt ? new Date(t.resolvedAt).getTime() : Date.now();
      const ageingDays = Math.max(0, Math.floor((endTime - createdTime) / (1000 * 60 * 60 * 24)));

      return {
        ...t,
        ageingDays,
        isOverdue: !isClosed && ageingDays >= 3,
      };
    });

    return res.json({ success: true, data: ticketsWithAgeing });
  } catch (err) {
    next(err);
  }
}

/**
 * Get single ticket details by ID with strict IDOR access control
 */
async function getTicketById(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const ticket = await SupportTicket.findById(req.params.id)
      .populate('apartmentId', 'name address contactPerson contactPhone')
      .populate('customer', 'name mobileNumber')
      .populate('assignedStaff', 'name mobileNumber phone')
      .populate('messages.sender', 'name role')
      .lean();

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Role-based IDOR checks
    if (user.role === 'admin') {
      // Full admin access
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
      if (ticket.customer?._id?.toString() !== user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Convert to plain object to properly delete private fields
    const ticketObj = ticket.toObject ? ticket.toObject() : JSON.parse(JSON.stringify(ticket));

    // Hide internal notes from resident/customer/client
    if (user.role === 'resident' || user.role === 'client' || user.role === 'customer') {
      delete ticketObj.internalNotes;
    }

    return res.json({ success: true, data: ticketObj });
  } catch (err) {
    next(err);
  }
}

/**
 * Post a resident-visible reply or status update
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

    if (text && text.trim()) {
      ticket.messages.push({
        sender: user._id,
        text: text.trim(),
        images: Array.isArray(images) ? images : [],
      });
    }

    if (status && ['New', 'Acknowledged', 'Assigned', 'In Progress', 'Resolved', 'Closed'].includes(status)) {
      if (user.role === 'resident' && status !== 'Closed') {
        // Residents can only close or reply, not arbitrarily change maintenance status
      } else {
        ticket.status = status;
        ticket.statusHistory.push({
          status,
          changedBy: user._id,
          changedByName: user.name || 'User',
          reason: 'Status updated via ticket response',
          timestamp: new Date(),
        });
      }
    }

    await ticket.save();

    // Notify customer/resident if updated by admin/association
    if ((user.role === 'admin' || user.role === 'association') && ticket.customer) {
      await notificationService.createNotification(
        ticket.customer,
        `New Message on Ticket #${ticket.ticketId}`,
        `Society support posted an update on your complaint: "${ticket.subject}"`,
        'ticket_reply'
      ).catch(() => {});
    }

    const populated = await SupportTicket.findById(ticket._id)
      .populate('apartmentId', 'name address')
      .populate('assignedStaff', 'name mobileNumber phone')
      .populate('messages.sender', 'name role');

    return res.json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

/**
 * Update ticket workflow status (Admin / Association)
 * New → Acknowledged → Assigned → In Progress → Resolved → Closed
 */
async function updateTicketStatus(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const { id } = req.params;
    const { status, reason } = req.body;

    const validStatuses = ['New', 'Acknowledged', 'Assigned', 'In Progress', 'Resolved', 'Closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (user.role === 'association' && ticket.apartmentId?.toString() !== user.apartmentId?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    ticket.status = status;
    if (status === 'Resolved') ticket.resolvedAt = new Date();
    if (status === 'Closed') ticket.closedAt = new Date();

    ticket.statusHistory.push({
      status,
      changedBy: user._id,
      changedByName: user.name || 'Admin',
      reason: reason?.trim() || `Status updated to ${status}`,
      timestamp: new Date(),
    });

    await ticket.save();

    // Notify resident
    if (ticket.customer) {
      await notificationService.createNotification(
        ticket.customer,
        `Ticket #${ticket.ticketId} is now ${status}`,
        `Your complaint regarding "${ticket.subject}" has been marked as ${status}.`,
        'ticket_status'
      ).catch(() => {});
    }

    return res.json({ success: true, message: `Ticket status updated to ${status}`, data: ticket });
  } catch (err) {
    next(err);
  }
}

/**
 * Assign maintenance staff to ticket (Admin / Association)
 */
async function assignStaff(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const { id } = req.params;
    const { staffId, staffName, staffPhone, notes } = req.body;

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (user.role === 'association' && ticket.apartmentId?.toString() !== user.apartmentId?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    let staffDoc = null;
    if (staffId) {
      staffDoc = await User.findById(staffId);
      if (!staffDoc) {
        return res.status(404).json({ success: false, message: 'Maintenance staff not found' });
      }
    }

    if (staffDoc) {
      ticket.assignedStaff = staffDoc._id;
      ticket.assignedStaffName = staffDoc.name;
      ticket.assignedStaffPhone = staffDoc.mobileNumber || staffDoc.phone || '';
    } else if (staffName) {
      ticket.assignedStaff = undefined;
      ticket.assignedStaffName = staffName.trim();
      ticket.assignedStaffPhone = (staffPhone || '').trim();
    } else {
      return res.status(400).json({ success: false, message: 'Either staffId or staffName must be provided' });
    }

    ticket.assignedAt = new Date();

    if (ticket.status === 'New' || ticket.status === 'Acknowledged') {
      ticket.status = 'Assigned';
    }

    const assignedName = staffDoc ? staffDoc.name : staffName.trim();
    ticket.statusHistory.push({
      status: ticket.status,
      changedBy: user._id,
      changedByName: user.name || 'Admin',
      reason: `Assigned to maintenance technician ${assignedName}${notes ? ` (${notes})` : ''}`,
      timestamp: new Date(),
    });

    await ticket.save();

    // Notify resident
    if (ticket.customer) {
      await notificationService.createNotification(
        ticket.customer,
        `Technician Assigned to #${ticket.ticketId}`,
        `Technician ${assignedName} has been assigned to inspect and resolve your complaint.`,
        'ticket_assigned'
      ).catch(() => {});
    }

    // Notify technician if registered user
    if (staffDoc) {
      await notificationService.createNotification(
        staffDoc._id,
        `New Maintenance Task: #${ticket.ticketId}`,
        `You have been assigned to resolve a ${ticket.category} complaint at ${ticket.apartmentName}, Flat ${ticket.flatNumber}.`,
        'job_assigned'
      ).catch(() => {});
    }

    return res.json({ success: true, message: `Ticket assigned to ${assignedName}`, data: ticket });
  } catch (err) {
    next(err);
  }
}

/**
 * Add internal note to ticket (Admin / Association only)
 */
async function addInternalNote(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const { id } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Note text is required' });
    }

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (user.role === 'association' && ticket.apartmentId?.toString() !== user.apartmentId?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    ticket.internalNotes.push({
      text: text.trim(),
      addedBy: user._id,
      addedByName: user.name || 'Staff',
      createdAt: new Date(),
    });

    await ticket.save();

    return res.json({ success: true, message: 'Internal note recorded', data: ticket.internalNotes });
  } catch (err) {
    next(err);
  }
}

/**
 * Mark ticket as Resolved with resolution notes and completion photos
 */
async function resolveTicket(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const { id } = req.params;
    const { resolutionNotes, resolutionPhotos } = req.body;

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (user.role === 'association' && ticket.apartmentId?.toString() !== user.apartmentId?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    ticket.status = 'Resolved';
    ticket.resolutionNotes = resolutionNotes?.trim() || '';
    if (Array.isArray(resolutionPhotos)) {
      ticket.resolutionPhotos = resolutionPhotos;
    }
    ticket.resolvedAt = new Date();

    ticket.statusHistory.push({
      status: 'Resolved',
      changedBy: user._id,
      changedByName: user.name || 'Admin',
      reason: resolutionNotes ? `Resolved: ${resolutionNotes}` : 'Complaint marked as resolved',
      timestamp: new Date(),
    });

    await ticket.save();

    // Notify resident
    if (ticket.customer) {
      await notificationService.createNotification(
        ticket.customer,
        `Complaint Resolved: Ticket #${ticket.ticketId}`,
        `Your maintenance ticket for ${ticket.category} has been marked as Resolved. Please inspect and confirm.`,
        'ticket_resolved'
      ).catch(() => {});
    }

    return res.json({ success: true, message: 'Ticket resolved successfully', data: ticket });
  } catch (err) {
    next(err);
  }
}

/**
 * Reopen a resolved/closed complaint with reason (Resident or Admin)
 */
async function reopenTicket(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason for reopening the complaint is required' });
    }

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Role-based IDOR checks
    if (user.role === 'resident') {
      if (
        ticket.apartmentId?.toString() !== user.apartmentId?.toString() ||
        ticket.flatNumber !== user.flatNumber
      ) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } else if (user.role === 'association') {
      if (ticket.apartmentId?.toString() !== user.apartmentId?.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (!['Resolved', 'Closed'].includes(ticket.status)) {
      return res.status(400).json({ success: false, message: 'Only resolved or closed complaints can be reopened' });
    }

    ticket.status = 'Reopened';
    ticket.isReopened = true;
    ticket.reopenReason = reason.trim();
    ticket.reopenedAt = new Date();
    ticket.reopenedBy = user._id;

    ticket.statusHistory.push({
      status: 'Reopened',
      changedBy: user._id,
      changedByName: user.name || 'User',
      reason: `Reopened: ${reason.trim()}`,
      timestamp: new Date(),
    });

    await ticket.save();

    // Notify apartment committee members and admin
    if (ticket.apartmentId) {
      const apt = await Apartment.findById(ticket.apartmentId);
      if (apt && Array.isArray(apt.associationUsers)) {
        for (const assocUserId of apt.associationUsers) {
          await notificationService.createNotification(
            assocUserId,
            `Ticket #${ticket.ticketId} Reopened (Flat ${ticket.flatNumber})`,
            `Complaint reopened by resident: "${reason.trim()}"`,
            'ticket_reopened'
          ).catch(() => {});
        }
      }
    }

    return res.json({ success: true, message: 'Complaint has been reopened', data: ticket });
  } catch (err) {
    next(err);
  }
}

/**
 * Get logged-in resident's apartment & flat details
 */
async function getResidentProfile(req, res, next) {
  try {
    const user = req.authUser || (await User.findById(req.user.id));
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    let apartment = null;
    let residentRecord = null;
    if (user.apartmentId) {
      apartment = await Apartment.findById(user.apartmentId)
        .populate('associationUsers', 'name mobileNumber email role')
        .lean();

      if (apartment && Array.isArray(apartment.residents)) {
        residentRecord = apartment.residents.find(
          r => (r.userId && r.userId.toString() === user._id.toString()) ||
               (r.phone === user.mobileNumber) ||
               (r.flatNumber === user.flatNumber)
        );
      }
    }

    const data = {
      user: user.toSafeObject ? user.toSafeObject() : user,
      apartment: apartment ? {
        _id: apartment._id,
        name: apartment.name,
        address: apartment.address,
        locality: apartment.locality,
        city: apartment.city,
        state: apartment.state,
        pincode: apartment.pincode,
        contactPerson: apartment.contactPerson,
        contactPhone: apartment.contactPhone,
        contactEmail: apartment.contactEmail,
        totalFlats: apartment.totalFlats,
        blocks: apartment.blocks || [],
        associationUsers: (apartment.associationUsers || []).map(u => ({
          name: u.name,
          mobileNumber: u.mobileNumber,
          email: u.email,
        })),
      } : null,
      resident: residentRecord || {
        flatNumber: user.flatNumber || '',
        block: user.block || '',
        name: user.name || '',
        phone: user.mobileNumber || '',
        residentType: 'owner',
        status: 'active',
      },
    };

    return res.json({ success: true, data });
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
  updateResident,
  removeResident,
  inviteResident,
  activateResident,
  getResidentProfile,
  createTicket,
  getTickets,
  getTicketById,
  replyToTicket,
  updateTicketStatus,
  assignStaff,
  addInternalNote,
  resolveTicket,
  reopenTicket,
};
