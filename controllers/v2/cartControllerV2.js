const Cart = require('../../models/Cart');

async function getCart(req, res, next) {
  try {
    const userId = req.user.id;
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = await Cart.create({ userId, items: [], totalAmount: 0 });
    }
    res.json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
}

async function addCartItem(req, res, next) {
  try {
    const userId = req.user.id;
    const { item, replaceExisting } = req.body;
    
    if (!item) {
      return res.status(400).json({ success: false, message: 'Item payload is required' });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [], totalAmount: 0 });
    }

    if (replaceExisting) {
      cart.items = [];
    }

    // Check if item already exists to update it, or add as new
    const existingIndex = cart.items.findIndex(i => i.id === item.id);
    if (existingIndex > -1) {
      cart.items[existingIndex] = item;
    } else {
      cart.items.push(item);
    }

    // Recalculate totalAmount
    cart.totalAmount = cart.items.reduce((sum, i) => {
      const grandTotal = i.price?.priceBreakdown?.grandTotal || 0;
      return sum + grandTotal;
    }, 0);

    await cart.save();
    res.json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
}

async function removeCartItem(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.items = cart.items.filter(item => item.id !== id);

    // Recalculate total
    cart.totalAmount = cart.items.reduce((sum, i) => {
      const grandTotal = i.price?.priceBreakdown?.grandTotal || 0;
      return sum + grandTotal;
    }, 0);

    await cart.save();
    res.json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
}

async function clearCart(req, res, next) {
  try {
    const userId = req.user.id;
    
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [], totalAmount: 0 });
    } else {
      cart.items = [];
      cart.totalAmount = 0;
    }

    await cart.save();
    res.json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCart,
  addCartItem,
  removeCartItem,
  clearCart,
};
