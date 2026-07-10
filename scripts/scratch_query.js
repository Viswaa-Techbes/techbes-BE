require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const CctvProduct = require('../models/CctvProduct');

async function run() {
  await connectDB();
  const products = await CctvProduct.find({}).lean();
  console.log("CURRENT PRODUCTS IN DB:");
  console.log(JSON.stringify(products, null, 2));
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
