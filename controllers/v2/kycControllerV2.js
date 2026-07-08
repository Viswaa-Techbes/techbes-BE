const User = require('../../models/User');

/**
 * @desc    Get current user's KYC details
 * @route   GET /api/v2/kyc/me
 * @access  Private (Technician/Manager/Admin)
 */
exports.getMyKyc = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('kycStatus kycDetails kycDocuments kycRejectionReason skills employeeStatus');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Submit KYC details
 * @route   PUT /api/v2/kyc/submit
 * @access  Private (Technician)
 */
exports.submitKyc = async (req, res) => {
  try {
    const {
      aadhaarNumber,
      aadhaarImageFront,
      aadhaarImageBack,
      panNumber,
      panImage,
      bankDetails,
      signatureImage,
      skills,
      kycDocuments
    } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.kycStatus === 'Approved') {
      return res.status(400).json({ success: false, message: 'KYC is already approved.' });
    }

    // Merge document structure
    const mergedDocs = {
      ...(user.kycDocuments || {})
    };

    if (kycDocuments) {
      for (const [key, value] of Object.entries(kycDocuments)) {
        if (value && value.url) {
          mergedDocs[key] = {
            url: value.url,
            publicId: value.publicId || '',
            type: value.type || 'image',
            uploadedAt: value.uploadedAt ? new Date(value.uploadedAt) : new Date()
          };
        }
      }
    }

    // Legacy fields fallback mapping
    if (aadhaarImageFront) {
      mergedDocs.aadhaarFront = { url: aadhaarImageFront, publicId: '', type: 'image', uploadedAt: new Date() };
    }
    if (aadhaarImageBack) {
      mergedDocs.aadhaarBack = { url: aadhaarImageBack, publicId: '', type: 'image', uploadedAt: new Date() };
    }
    if (panImage) {
      mergedDocs.panCard = { url: panImage, publicId: '', type: 'image', uploadedAt: new Date() };
    }
    if (signatureImage) {
      mergedDocs.signature = { url: signatureImage, publicId: '', type: 'image', uploadedAt: new Date() };
    }
    if (req.body.bankProofUrl) {
      mergedDocs.bankProof = { url: req.body.bankProofUrl, publicId: '', type: 'image', uploadedAt: new Date() };
    }
    if (req.body.selfieUrl) {
      mergedDocs.selfie = { url: req.body.selfieUrl, publicId: '', type: 'image', uploadedAt: new Date() };
    }

    // Enforce validation for all 6 required documents
    const requiredDocs = ['aadhaarFront', 'aadhaarBack', 'panCard', 'signature', 'bankProof', 'selfie'];
    for (const docKey of requiredDocs) {
      if (!mergedDocs[docKey] || !mergedDocs[docKey].url) {
        return res.status(400).json({ success: false, message: `Missing required KYC document: ${docKey}` });
      }
    }

    // Save back to user
    user.kycDocuments = mergedDocs;

    // Maintain backward-compatible kycDetails
    user.kycDetails = {
      aadhaarNumber: aadhaarNumber || user.kycDetails?.aadhaarNumber,
      aadhaarImageFront: mergedDocs.aadhaarFront.url,
      aadhaarImageBack: mergedDocs.aadhaarBack.url,
      panNumber: panNumber || user.kycDetails?.panNumber,
      panImage: mergedDocs.panCard.url,
      bankDetails: {
        accountName: bankDetails?.accountName || user.kycDetails?.bankDetails?.accountName,
        accountNumber: bankDetails?.accountNumber || user.kycDetails?.bankDetails?.accountNumber,
        ifscCode: bankDetails?.ifscCode || user.kycDetails?.bankDetails?.ifscCode,
        bankName: bankDetails?.bankName || user.kycDetails?.bankDetails?.bankName,
      },
      signatureImage: mergedDocs.signature.url,
    };

    if (skills && Array.isArray(skills)) {
      user.skills = skills;
    }

    user.kycStatus = 'Submitted';
    user.kycRejectionReason = ''; // Clear rejection reason on new submission

    await user.save();

    res.status(200).json({
      success: true,
      message: 'KYC submitted successfully and is under review.',
      data: user.toSafeObject(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all technicians pending KYC approval
 * @route   GET /api/v2/kyc/admin/pending
 * @access  Private (Admin/Manager)
 */
exports.getPendingKyc = async (req, res) => {
  try {
    const technicians = await User.find({ role: 'technician', kycStatus: 'Submitted' })
      .select('name email mobileNumber kycStatus kycDetails kycDocuments createdAt skills employeeCode profilePhoto')
      .sort({ updatedAt: 1 });

    res.status(200).json({ success: true, count: technicians.length, data: technicians });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Approve technician KYC
 * @route   PUT /api/v2/kyc/admin/:id/approve
 * @access  Private (Admin/Manager)
 */
exports.approveKyc = async (req, res) => {
  try {
    const technician = await User.findById(req.params.id);
    if (!technician) {
      return res.status(404).json({ success: false, message: 'Technician not found' });
    }

    technician.kycStatus = 'Approved';
    technician.kycRejectionReason = '';
    technician.employeeStatus = 'Active';

    await technician.save();

    res.status(200).json({
      success: true,
      message: 'Technician KYC approved successfully.',
      data: technician.toSafeObject(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Reject technician KYC
 * @route   PUT /api/v2/kyc/admin/:id/reject
 * @access  Private (Admin/Manager)
 */
exports.rejectKyc = async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    const technician = await User.findById(req.params.id);
    if (!technician) {
      return res.status(404).json({ success: false, message: 'Technician not found' });
    }

    technician.kycStatus = 'Rejected';
    technician.kycRejectionReason = reason;

    await technician.save();

    res.status(200).json({
      success: true,
      message: 'Technician KYC rejected.',
      data: technician.toSafeObject(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
