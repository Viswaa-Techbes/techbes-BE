const Career = require('../../models/Career');

async function applyForJob(req, res, next) {
  try {
    const { name, email, phone, roleApplied, experience } = req.body;
    const resumeUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!resumeUrl) {
      return res.status(400).json({ success: false, message: 'Resume is required' });
    }

    const application = await Career.create({
      name,
      email,
      phone,
      roleApplied,
      experience,
      resumeUrl,
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      data: application,
    });
  } catch (err) {
    next(err);
  }
}

async function getApplications(req, res, next) {
  try {
    const applications = await Career.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: applications,
    });
  } catch (err) {
    next(err);
  }
}

async function updateApplicationStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const application = await Career.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    res.json({
      success: true,
      message: `Application status updated to ${status}`,
      data: application,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  applyForJob,
  getApplications,
  updateApplicationStatus,
};
