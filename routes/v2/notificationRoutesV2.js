const notificationController = require('../../controllers/notificationController');
const { authenticate } = require('../../middlewares/auth');
const express = require('express');

const router = express.Router();

router.use(authenticate);

// V2 could have specialized notification logic later
router.get('/', notificationController.getNotifications);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
