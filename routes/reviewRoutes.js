const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authenticate } = require('../middlewares/auth');

router.get('/', reviewController.listReviews);
router.post('/', authenticate, reviewController.createReview);

module.exports = router;
