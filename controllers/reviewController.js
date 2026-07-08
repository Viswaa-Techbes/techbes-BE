const Review = require('../models/Review');
const Job = require('../models/Job');
const ratingService = require('../services/ratingService');

/**
 * GET /reviews
 * List all reviews
 */
async function listReviews(req, res, next) {
  try {
    const reviews = await Review.find()
      .sort({ createdAt: -1 })
      .populate('technicianId', 'name email specialty')
      .populate('jobId', 'title customerName')
      .lean();

    return res.json({
      success: true,
      data: reviews,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /reviews
 * Create a review (Admin/Manager/Technician? Usually customer, but let's allow it for demo)
 */
async function createReview(req, res, next) {
  try {
    const { rating, comment, technicianId, jobId, clientName } = req.body;

    if (!rating || !technicianId) {
      return res.status(400).json({ success: false, message: 'Rating and technicianId are required' });
    }

    // Customer cannot rate twice: check if review for this jobId already exists
    if (jobId) {
      const existingReview = await Review.findOne({ jobId });
      if (existingReview) {
        return res.status(400).json({ success: false, message: 'You have already rated the service for this job.' });
      }
    }

    const review = await Review.create({
      rating,
      comment,
      technicianId,
      jobId,
      clientName: clientName || req.user?.name || 'Customer',
    });

    // Update technician rating and performance score
    setImmediate(() => {
      ratingService.updateTechnicianRating(technicianId);
    });

    return res.status(201).json({
      success: true,
      message: 'Review posted successfully',
      data: review,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listReviews,
  createReview,
};
