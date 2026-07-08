const express = require('express');
const cartControllerV2 = require('../../controllers/v2/cartControllerV2');
const { authenticate } = require('../../middlewares/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', cartControllerV2.getCart);
router.post('/add', cartControllerV2.addCartItem);
router.delete('/item/:id', cartControllerV2.removeCartItem);
router.delete('/clear', cartControllerV2.clearCart);

module.exports = router;
