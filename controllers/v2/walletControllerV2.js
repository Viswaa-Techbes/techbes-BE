const Razorpay = require('razorpay');
const crypto = require('crypto');
const Wallet = require('../../models/Wallet');
const WalletTransaction = require('../../models/WalletTransaction');

let razorpayInstance = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// Helper to ensure Razorpay is configured
function checkRazorpay() {
  if (!razorpayInstance) {
    throw new Error("Razorpay keys are not configured on the server.");
  }
}

async function createOrder(req, res) {
  try {
    checkRazorpay();
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const options = {
      amount: Math.round(amount * 100), // amount in the smallest currency unit (paise)
      currency: "INR",
      receipt: `receipt_${req.user.id}_${Date.now()}`
    };

    const order = await razorpayInstance.orders.create(options);

    res.json({
      success: true,
      data: {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function verifyPayment(req, res) {
  try {
    checkRazorpay();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, description } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification details' });
    }

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid signature. Payment verification failed.' });
    }

    // Payment is verified, credit wallet
    let wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) wallet = await Wallet.create({ user: req.user.id });

    const actualAmount = amount || 0; // The frontend should send the added amount
    
    if (actualAmount > 0) {
      wallet.balance += actualAmount;
      await wallet.save();

      const transaction = await WalletTransaction.create({
        wallet: wallet._id,
        amount: actualAmount,
        type: 'credit',
        category: 'topup',
        description: description || 'Wallet Top-up via Razorpay',
        referenceId: razorpay_payment_id,
        referenceModel: 'Razorpay'
      });

      // Optionally, add to Ledger here if there's a Ledger model

      return res.json({ success: true, data: { wallet, transaction } });
    }

    res.status(400).json({ success: false, message: 'Invalid amount for verified payment' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getWallet(req, res) {
  try {
    let wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) {
      wallet = await Wallet.create({ user: req.user.id });
    }
    res.json({ success: true, data: wallet });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getTransactions(req, res) {
  try {
    let wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) {
      wallet = await Wallet.create({ user: req.user.id });
    }
    const transactions = await WalletTransaction.find({ wallet: wallet._id })
      .sort({ createdAt: -1 })
      .limit(50);
      
    res.json({ success: true, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function payBooking(req, res) {
  try {
    const { jobId, amount } = req.body;
    if (!jobId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid job or amount' });
    }

    const Job = require('../../models/Job');
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    let wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) {
      wallet = await Wallet.create({ user: req.user.id });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    }

    // Debit wallet
    wallet.balance -= amount;
    await wallet.save();

    // Create Transaction
    const transaction = await WalletTransaction.create({
      wallet: wallet._id,
      amount: amount,
      type: 'debit',
      category: 'payment',
      description: `Payment for booking #${jobId}`,
      referenceId: jobId,
      referenceModel: 'Job'
    });

    // Update job payment status
    if (job.status === 'completed' || job.status === 'payment_pending') {
      job.paymentStatus = 'paid';
      job.remainingAmount = 0;
    } else {
      job.paymentStatus = 'paid';
      job.advancePaid = true;
      job.status = 'pending';
      job.dispatchStatus = 'pending_dispatch';
    }
    await job.save();

    // Trigger auto-dispatch in background if it was pending
    if (job.status === 'pending') {
      setImmediate(async () => {
        try {
          const dispatchService = require('../../services/dispatchService');
          const io = req.app.get('io') || global._socketIo || null;
          await dispatchService.autoAssignTechnician(job._id, io);
        } catch (dispatchErr) {
          console.error('[Wallet Pay Dispatch Error]', dispatchErr.message);
        }
      });
    }

    res.json({ success: true, data: { wallet, transaction, job } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  createOrder,
  verifyPayment,
  getWallet,
  getTransactions,
  payBooking
};
