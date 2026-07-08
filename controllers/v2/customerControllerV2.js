const User = require('../../models/User');
const Wallet = require('../../models/Wallet');
const WalletTransaction = require('../../models/WalletTransaction');
const SupportTicket = require('../../models/SupportTicket');
const Review = require('../../models/Review');
const Job = require('../../models/Job');

// --- WALLET ---
async function getWallet(req, res) {
  try {
    let wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) {
      wallet = await Wallet.create({ user: req.user.id });
    }
    const transactions = await WalletTransaction.find({ wallet: wallet._id })
      .sort({ createdAt: -1 })
      .limit(50);
      
    res.json({ success: true, data: { wallet, transactions } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function addFunds(req, res) {
  try {
    const { amount, description } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

    let wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) wallet = await Wallet.create({ user: req.user.id });

    wallet.balance += amount;
    await wallet.save();

    const transaction = await WalletTransaction.create({
      wallet: wallet._id,
      amount,
      type: 'credit',
      category: 'topup',
      description: description || 'Added funds to wallet',
    });

    res.json({ success: true, data: { wallet, transaction } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// --- TICKETS ---
async function createTicket(req, res) {
  try {
    const { subject, category, priority, bookingId, messageText, images } = req.body;
    const ticket = await SupportTicket.create({
      customer: req.user.id,
      subject,
      category,
      priority,
      bookingId,
      messages: [{ sender: req.user.id, text: messageText, images: images || [] }]
    });
    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getTickets(req, res) {
  try {
    const tickets = await SupportTicket.find({ customer: req.user.id }).sort({ updatedAt: -1 });
    res.json({ success: true, data: tickets });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function replyTicket(req, res) {
  try {
    const { text, images } = req.body;
    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, customer: req.user.id },
      { $push: { messages: { sender: req.user.id, text, images: images || [] } }, status: 'Open' },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    res.json({ success: true, data: ticket });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// --- BOOKINGS & DASHBOARD ---
async function getDashboardStats(req, res) {
  try {
    const userId = req.user.id;
    
    // Fallback if Booking model isn't fully robust in this project iteration, just catch and return 0s
    let totalBookings = 0;
    let completedBookings = 0;
    let upcomingBookings = [];
    
    try {
      totalBookings = await Job.countDocuments({ customer: userId });
      completedBookings = await Job.countDocuments({ customer: userId, status: 'Completed' });
      upcomingBookings = await Job.find({ customer: userId, status: { $in: ['Pending', 'Assigned', 'In Progress'] } }).sort({ createdAt: -1 }).limit(3);
    } catch(e) {
      console.error("Dashboard stats error:", e);
    }

    let wallet = await Wallet.findOne({ user: userId });
    
    res.json({
      success: true,
      data: {
        totalBookings,
        completedBookings,
        upcomingBookings,
        walletBalance: wallet ? wallet.balance : 0,
        loyaltyPoints: wallet ? wallet.loyaltyPoints : 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getWallet,
  addFunds,
  createTicket,
  getTickets,
  replyTicket,
  getDashboardStats
};
