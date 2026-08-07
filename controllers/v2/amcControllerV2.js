const AmcContract = require('../../models/AmcContract');
const User = require('../../models/User');
const notificationService = require('../../services/notificationService');

// Helper to pre-calculate visit dates
function calculateVisitDates(startDate, plan, totalVisits) {
  const visits = [];
  const start = new Date(startDate || Date.now());
  
  // Calculate interval in months based on visits count
  // 12 visits -> monthly, 6 visits -> every 2 months, 4 visits -> every 3 months
  let intervalMonths = 3;
  if (totalVisits === 12) intervalMonths = 1;
  else if (totalVisits === 6) intervalMonths = 2;
  
  for (let i = 1; i <= totalVisits; i++) {
    const visitDate = new Date(start);
    visitDate.setMonth(start.getMonth() + (i * intervalMonths));
    visits.push({
      visitDate,
      status: 'Scheduled',
      remarks: `Scheduled preventative maintenance checkup #${i}`,
    });
  }
  return visits;
}

// Purchase AMC
exports.purchaseAmc = async (req, res, next) => {
  try {
    const { amcPlan, startDate, customerName, customerPhone, address } = req.body;
    
    if (!amcPlan) {
      return res.status(400).json({ success: false, message: 'AMC Plan is required' });
    }

    let totalVisits = 4; // Silver
    if (amcPlan === 'Gold') totalVisits = 6;
    else if (amcPlan === 'Diamond') totalVisits = 12;

    const start = new Date(startDate || Date.now());
    const expiryDate = new Date(start);
    expiryDate.setFullYear(start.getFullYear() + 1); // 1 Year validity

    const visits = calculateVisitDates(start, amcPlan, totalVisits);

    const contract = await AmcContract.create({
      customerId: req.user.id,
      customerName: customerName || req.authUser?.name || 'Customer',
      customerPhone: customerPhone || req.authUser?.mobileNumber || 'N/A',
      address: address || req.authUser?.address || 'N/A',
      amcPlan,
      startDate: start,
      expiryDate,
      totalVisits,
      remainingVisits: totalVisits,
      visits,
      status: 'Active',
    });

    // Notify customer
    await notificationService.createNotification(
      req.user.id,
      'AMC Plan Activated',
      `Your TechBes ${amcPlan} AMC plan is active! ID: ${contract.contractId}. Checkups are scheduled.`,
      'amc_activated',
      req.app.get('io'),
      { contractId: contract._id }
    );

    res.status(201).json({ success: true, data: contract });
  } catch (err) {
    next(err);
  }
};

// Renew AMC
exports.renewContract = async (req, res, next) => {
  try {
    const contract = await AmcContract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    const { amcPlan } = req.body;
    const plan = amcPlan || contract.amcPlan;
    
    let newVisits = 4;
    if (plan === 'Gold') newVisits = 6;
    else if (plan === 'Diamond') newVisits = 12;

    const currentExpiry = new Date(contract.expiryDate);
    const newExpiry = new Date(currentExpiry > new Date() ? currentExpiry : new Date());
    newExpiry.setFullYear(newExpiry.getFullYear() + 1);

    const extraVisits = calculateVisitDates(currentExpiry > new Date() ? currentExpiry : new Date(), plan, newVisits);

    contract.amcPlan = plan;
    contract.expiryDate = newExpiry;
    contract.totalVisits += newVisits;
    contract.remainingVisits += newVisits;
    contract.status = 'Active';
    contract.visits.push(...extraVisits);

    await contract.save();

    await notificationService.createNotification(
      contract.customerId,
      'AMC Plan Renewed',
      `Your TechBes AMC plan (${plan}) has been successfully renewed. Thank you!`,
      'amc_renewed',
      req.app.get('io'),
      { contractId: contract._id }
    );

    res.json({ success: true, data: contract });
  } catch (err) {
    next(err);
  }
};

// Admin Dashboard stats
exports.getDashboardStats = async (req, res, next) => {
  try {
    const contracts = await AmcContract.find().lean();
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    let activeCount = 0;
    let expiringThisMonth = 0;
    let expiredCount = 0;
    let upcomingVisits = 0;
    let completedVisits = 0;
    let missedVisits = 0;
    let renewalPending = 0;
    let renewalCompleted = 0;

    for (const c of contracts) {
      if (c.status === 'Active') {
        activeCount++;
        if (c.expiryDate >= startOfMonth && c.expiryDate <= endOfMonth) {
          expiringThisMonth++;
        }
        
        // check renewal pending
        const daysToExpiry = (c.expiryDate - now) / (1000 * 60 * 60 * 24);
        if (daysToExpiry <= 30 && daysToExpiry >= 0) {
          renewalPending++;
        }
      } else if (c.status === 'Expired') {
        expiredCount++;
        renewalPending++;
      }

      // Check visits
      if (c.visits) {
        for (const v of c.visits) {
          if (v.status === 'Scheduled') {
            if (v.visitDate > now) {
              upcomingVisits++;
            } else {
              // Missed if date is in past and still Scheduled
              missedVisits++;
            }
          } else if (v.status === 'Completed') {
            completedVisits++;
          } else if (v.status === 'Missed') {
            missedVisits++;
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        activeCustomers: activeCount,
        expiringThisMonth,
        expiredCount,
        upcomingVisits,
        completedVisits,
        missedVisits,
        renewalPending,
        renewalCompleted,
      }
    });
  } catch (err) {
    next(err);
  }
};

// Get Contracts
exports.getContracts = async (req, res, next) => {
  try {
    const { status, amcPlan, assignedEngineer, search } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (amcPlan) query.amcPlan = amcPlan;
    if (assignedEngineer) query.assignedEngineer = assignedEngineer;
    
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { contractId: { $regex: search, $options: 'i' } },
      ];
    }

    const list = await AmcContract.find(query)
      .populate('customerId', 'name mobileNumber email customerId')
      .populate('assignedEngineer', 'name mobileNumber specialty email')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
};

// Get Single Contract Details
exports.getContractById = async (req, res, next) => {
  try {
    const contract = await AmcContract.findById(req.params.id)
      .populate('customerId', 'name mobileNumber email customerId')
      .populate('assignedEngineer', 'name mobileNumber specialty email rating');
      
    if (!contract) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }
    res.json({ success: true, data: contract });
  } catch (err) {
    next(err);
  }
};

// Update Contract (Assign Engineer, edit details)
exports.updateContract = async (req, res, next) => {
  try {
    const { customerName, customerPhone, address, amcPlan, status, assignedEngineer } = req.body;
    
    const contract = await AmcContract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    const previousEngineer = contract.assignedEngineer?.toString();

    if (customerName !== undefined) contract.customerName = customerName;
    if (customerPhone !== undefined) contract.customerPhone = customerPhone;
    if (address !== undefined) contract.address = address;
    if (amcPlan !== undefined) contract.amcPlan = amcPlan;
    if (status !== undefined) contract.status = status;
    
    if (assignedEngineer !== undefined) {
      contract.assignedEngineer = assignedEngineer || null;
      
      // Notify technician and customer if changed
      if (assignedEngineer && assignedEngineer.toString() !== previousEngineer) {
        const engineerUser = await User.findById(assignedEngineer);
        if (engineerUser) {
          // Notify Tech
          await notificationService.createNotification(
            assignedEngineer,
            'New AMC Assignment',
            `You have been assigned as the Dedicated Engineer for ${contract.customerName} (${contract.amcPlan} Plan).`,
            'amc_assigned_tech',
            req.app.get('io'),
            { contractId: contract._id }
          );
          
          // Notify Customer
          await notificationService.createNotification(
            contract.customerId,
            'Dedicated Engineer Assigned',
            `Engineer ${engineerUser.name} has been assigned to your AMC contract.`,
            'amc_assigned_customer',
            req.app.get('io'),
            { contractId: contract._id }
          );
        }
      }
    }

    await contract.save();
    
    const populated = await AmcContract.findById(contract._id)
      .populate('customerId', 'name mobileNumber email customerId')
      .populate('assignedEngineer', 'name mobileNumber specialty email');

    res.json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

// Delete Contract
exports.deleteContract = async (req, res, next) => {
  try {
    const contract = await AmcContract.findByIdAndDelete(req.params.id);
    if (!contract) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }
    res.json({ success: true, message: 'Contract deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// Schedule manual visit
exports.scheduleVisit = async (req, res, next) => {
  try {
    const { visitDate, remarks } = req.body;
    if (!visitDate) {
      return res.status(400).json({ success: false, message: 'Visit date is required' });
    }

    const contract = await AmcContract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    contract.visits.push({
      visitDate: new Date(visitDate),
      status: 'Scheduled',
      remarks: remarks || 'Additional maintenance visit',
    });

    contract.totalVisits += 1;
    contract.remainingVisits += 1;

    await contract.save();

    await notificationService.createNotification(
      contract.customerId,
      'AMC Visit Scheduled',
      `An AMC visit is scheduled for ${new Date(visitDate).toDateString()}.`,
      'amc_visit_scheduled',
      req.app.get('io')
    );

    res.json({ success: true, data: contract });
  } catch (err) {
    next(err);
  }
};

// Reschedule visit
exports.rescheduleVisit = async (req, res, next) => {
  try {
    const { visitId, newDate, remarks } = req.body;
    if (!visitId || !newDate) {
      return res.status(400).json({ success: false, message: 'visitId and newDate are required' });
    }

    const contract = await AmcContract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    const visit = contract.visits.id(visitId);
    if (!visit) {
      return res.status(404).json({ success: false, message: 'Visit not found' });
    }

    visit.visitDate = new Date(newDate);
    if (remarks) visit.remarks = remarks;
    visit.status = 'Scheduled';

    await contract.save();

    // Notify customer
    await notificationService.createNotification(
      contract.customerId,
      'AMC Visit Rescheduled',
      `Your AMC checkup has been rescheduled to ${new Date(newDate).toDateString()}.`,
      'amc_visit_rescheduled',
      req.app.get('io')
    );

    // Notify engineer
    if (contract.assignedEngineer) {
      await notificationService.createNotification(
        contract.assignedEngineer,
        'AMC Visit Rescheduled',
        `AMC visit for ${contract.customerName} has been rescheduled to ${new Date(newDate).toDateString()}.`,
        'amc_visit_rescheduled_tech',
        req.app.get('io')
      );
    }

    res.json({ success: true, data: contract });
  } catch (err) {
    next(err);
  }
};

// Cancel visit / Skip visit
exports.cancelVisit = async (req, res, next) => {
  try {
    const { visitId, status, remarks } = req.body; // status: 'Cancelled' or 'Skipped'
    if (!visitId) {
      return res.status(400).json({ success: false, message: 'visitId is required' });
    }

    const targetStatus = status || 'Cancelled';
    const contract = await AmcContract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    const visit = contract.visits.id(visitId);
    if (!visit) {
      return res.status(404).json({ success: false, message: 'Visit not found' });
    }

    const prevStatus = visit.status;
    visit.status = targetStatus;
    if (remarks) visit.remarks = remarks;

    // Adjust counts
    if (prevStatus === 'Scheduled') {
      contract.remainingVisits = Math.max(0, contract.remainingVisits - 1);
    }

    await contract.save();

    res.json({ success: true, data: contract });
  } catch (err) {
    next(err);
  }
};

// Complete Visit
exports.completeVisit = async (req, res, next) => {
  try {
    const { visitId, notes, images, partsUsed, recommendations, customerSignature, technicianSignature } = req.body;
    
    if (!visitId) {
      return res.status(400).json({ success: false, message: 'visitId is required' });
    }

    const contract = await AmcContract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    const visit = contract.visits.id(visitId);
    if (!visit) {
      return res.status(404).json({ success: false, message: 'Visit not found' });
    }

    if (visit.status === 'Completed') {
      return res.status(400).json({ success: false, message: 'Visit already completed' });
    }

    visit.status = 'Completed';
    visit.completionDetails = {
      completedAt: new Date(),
      notes: notes || '',
      images: images || [],
      partsUsed: partsUsed || [],
      recommendations: recommendations || '',
      customerSignature: customerSignature || '',
      technicianSignature: technicianSignature || '',
    };

    contract.completedVisits += 1;
    contract.remainingVisits = Math.max(0, contract.remainingVisits - 1);

    await contract.save();

    // Notify customer
    await notificationService.createNotification(
      contract.customerId,
      'AMC Visit Completed',
      `Your preventative maintenance checkup is complete. Report is available on your dashboard.`,
      'amc_visit_completed',
      req.app.get('io'),
      { contractId: contract._id }
    );

    res.json({ success: true, data: contract });
  } catch (err) {
    next(err);
  }
};

// List technician visits
exports.getTechnicianVisits = async (req, res, next) => {
  try {
    const contracts = await AmcContract.find({
      assignedEngineer: req.user.id,
      status: 'Active',
    }).populate('customerId', 'name mobileNumber email customerId');

    const visits = [];
    for (const c of contracts) {
      for (const v of c.visits) {
        visits.push({
          contractId: c._id,
          contractCode: c.contractId,
          amcPlan: c.amcPlan,
          customerName: c.customerName,
          customerPhone: c.customerPhone,
          address: c.address,
          visitId: v._id,
          visitDate: v.visitDate,
          status: v.status,
          remarks: v.remarks,
          completionDetails: v.completionDetails,
        });
      }
    }

    // Sort visits: Scheduled first, then date-wise
    visits.sort((a, b) => {
      if (a.status === 'Scheduled' && b.status !== 'Scheduled') return -1;
      if (a.status !== 'Scheduled' && b.status === 'Scheduled') return 1;
      return new Date(a.visitDate) - new Date(b.visitDate);
    });

    res.json({ success: true, data: visits });
  } catch (err) {
    next(err);
  }
};

// List customer contracts
exports.getCustomerContracts = async (req, res, next) => {
  try {
    const list = await AmcContract.find({ customerId: req.user.id })
      .populate('assignedEngineer', 'name mobileNumber specialty email rating')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
};
