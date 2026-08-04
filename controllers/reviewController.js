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
    const { rating, comment, technicianId, jobId, clientName, serviceRating, technicianRating, images, videos } = req.body;

    const finalTechnicianId = technicianId || req.body.technician;
    const finalJobId = jobId || req.body.booking;

    if (!rating && !serviceRating && !technicianRating) {
      return res.status(400).json({ success: false, message: 'Rating is required' });
    }
    if (!finalTechnicianId) {
      return res.status(400).json({ success: false, message: 'technicianId is required' });
    }

    // Customer cannot rate twice: check if review for this jobId already exists
    if (finalJobId) {
      const existingReview = await Review.findOne({ $or: [{ jobId: finalJobId }, { booking: finalJobId }] });
      if (existingReview) {
        return res.status(400).json({ success: false, message: 'You have already rated the service for this job.' });
      }
    }

    const overall = rating || Math.round(((Number(serviceRating) || 5) + (Number(technicianRating) || 5)) / 2);

    const review = await Review.create({
      customer: req.user?.id,
      technician: finalTechnicianId,
      booking: finalJobId,
      serviceRating: serviceRating || rating || 5,
      technicianRating: technicianRating || rating || 5,
      overallRating: overall,
      rating: overall,
      technicianId: finalTechnicianId,
      jobId: finalJobId,
      clientName: clientName || req.user?.name || 'Customer',
      comment,
      images: images || [],
      videos: videos || [],
    });

    // Update technician rating and performance score
    setImmediate(() => {
      ratingService.updateTechnicianRating(finalTechnicianId);
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
