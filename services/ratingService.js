const Review = require('../models/Review');
const User = require('../models/User');

async function updateTechnicianRating(technicianId) {
  try {
    const reviews = await Review.find({ technicianId });
    const totalReviews = reviews.length;
    
    let averageRating = 5.0;
    if (totalReviews > 0) {
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      averageRating = parseFloat((sum / totalReviews).toFixed(2));
    }

    const tech = await User.findById(technicianId);
    if (!tech) return;

    const penaltyPoints = tech.penaltyPoints || 0;
    
    // Performance score: average rating * 20 (scales 0-5 to 0-100) minus 10% penalty per point
    let performanceScore = Math.round((averageRating * 20) - (penaltyPoints * 10));
    performanceScore = Math.max(0, Math.min(100, performanceScore));

    await User.findByIdAndUpdate(technicianId, {
      rating: averageRating,
      totalReviews,
      performanceScore,
    });

    console.log(`[RatingService] Updated technician ${technicianId}: Rating=${averageRating}, TotalReviews=${totalReviews}, PerformanceScore=${performanceScore}`);
  } catch (err) {
    console.error('[RatingService] Error updating technician rating:', err.message);
  }
}

module.exports = {
  updateTechnicianRating,
};
