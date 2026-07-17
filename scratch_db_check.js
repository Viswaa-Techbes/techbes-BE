const mongoose = require('mongoose');
const SubCategory = require('./models/SubCategory');
const Category = require('./models/Category');

async function check() {
  try {
    require('dotenv').config();
    const connectDB = require('./config/db');
    await connectDB();

    console.log('--- Categories ---');
    const categories = await Category.find();
    categories.forEach(c => {
      console.log(`ID: ${c._id}, Name: ${c.name}, Slug: ${c.slug}`);
    });

    console.log('\n--- CCTV Subcategories ---');
    const cctvCat = await Category.findOne({ slug: 'cctv' });
    if (cctvCat) {
      const subs = await SubCategory.find({ categoryId: cctvCat._id });
      subs.forEach(s => {
        console.log(`ID: ${s._id}, Name: ${s.name}, Slug: ${s.slug}, CategoryId: ${s.categoryId}`);
      });
    } else {
      console.log('No CCTV category found!');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

check();
