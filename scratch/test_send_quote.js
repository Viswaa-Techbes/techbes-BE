const mongoose = require('mongoose');

async function testSend() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb+srv://promoadmin:PromoAdmin@cluster0.vcubuna.mongodb.net/promoDB';
    await mongoose.connect(uri);
    const QuoteRequest = require('../models/QuoteRequest');
    const { sendWhatsApp } = require('../services/channelNotificationService');
    const notificationService = require('../services/notificationService');

    const quote = await QuoteRequest.findOne({ requestId: 'QT-2026-00008' });
    console.log('Quote found:', quote.requestId, quote.fullName, quote.mobile, quote.finalAmount);

    const customerPhone = quote.mobile;
    const formattedAmount = `₹${quote.finalAmount.toLocaleString('en-IN')}`;
    const validity = quote.validityDays || 15;
    const portalUrl = `${process.env.FRONTEND_URL || 'https://techbes.co.in'}/dashboard/quotes`;

    const whatsappMessage =
      `Your quotation has been prepared by TechBes.\n\n` +
      `Quotation No: ${quote.requestId}\n` +
      `Total Amount: ${formattedAmount} (incl. GST)\n` +
      `Valid For: ${validity} days\n\n` +
      `Please login to your TechBes account to view the quotation and proceed with booking/payment:\n` +
      `${portalUrl}`;

    console.log('Testing sendWhatsApp...');
    let waResult = { success: false };
    try {
      waResult = await sendWhatsApp({
        to: customerPhone,
        body: whatsappMessage,
      });
      console.log('waResult:', waResult);
    } catch (waErr) {
      console.error('[WhatsApp Error]', waErr);
    }

    // Now test line 826:
    console.log('Testing phone clean & clickToChatUrl...');
    const cleanPhone = (customerPhone || '').replace(/[^\d]/g, '');
    const clickToChatUrl = `https://wa.me/91${cleanPhone.slice(-10)}?text=${encodeURIComponent(whatsappMessage)}`;
    console.log('clickToChatUrl:', clickToChatUrl);

    // Now test in-app notification:
    if (quote.customerId) {
      console.log('Testing notificationService for customerId:', quote.customerId);
      await notificationService.createNotification(
        quote.customerId,
        'Quotation Ready – TechBes',
        `Your quotation ${quote.requestId} for ${quote.serviceCategory} is ready. Total: ${formattedAmount}. Login to review and pay now to book.`,
        'quotation_sent',
        null,
        { quoteId: quote._id, requestId: quote.requestId }
      );
    }

    console.log('TEST COMPLETED SUCCESSFULLY WITHOUT THROWING!');
    process.exit(0);
  } catch (err) {
    console.error('CAUGHT EXCEPTION:', err);
    process.exit(1);
  }
}

testSend();
