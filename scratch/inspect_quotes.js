const mongoose = require('mongoose');

async function inspectQuotes() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb+srv://promoadmin:PromoAdmin@cluster0.vcubuna.mongodb.net/promoDB';
    await mongoose.connect(uri);
    const quotes = await mongoose.connection.collection('quoterequests').find({}).sort({ createdAt: -1 }).limit(5).toArray();
    console.log('Found quotes:', quotes.length);
    for (const q of quotes) {
      console.log({
        _id: q._id,
        requestId: q.requestId,
        fullName: q.fullName,
        mobile: q.mobile,
        serviceCategory: q.serviceCategory,
        finalAmount: q.finalAmount,
        status: q.status,
        itemsCount: q.items?.length,
        hasPhone: Boolean(q.mobile),
        phoneType: typeof q.mobile
      });
    }
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

inspectQuotes();
