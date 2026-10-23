require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function testWorkflow() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const Category = require('../models/Category');
  const SubCategory = require('../models/SubCategory');
  const QuoteRequest = require('../models/QuoteRequest');
  const { validateCategory, validateSubcategory } = require('../utils/serviceQuotationConfig');

  console.log('\n--- TEST 1: Category & Subcategory DB Integrity ---');
  const dmCat = await Category.findOne({ slug: 'digital-marketing' });
  console.log('1.1 Digital Marketing Category found:', !!dmCat, dmCat ? { name: dmCat.name, slug: dmCat.slug, _id: dmCat._id } : null);
  if (!dmCat) throw new Error('Digital Marketing Category not found in DB');

  const subs = await SubCategory.find({ categoryId: dmCat._id });
  console.log(`1.2 Found ${subs.length} subcategories under Digital Marketing:`);
  subs.forEach(s => console.log(`   - ${s.name} (slug: ${s.slug}, packages: ${s.packages?.length || 0}, questions: ${s.bookingQuestions?.length || 0})`));

  const podcastSub = subs.find(s => s.slug === 'podcasting');
  if (!podcastSub) throw new Error('Podcasting subcategory not found under Digital Marketing');
  console.log('1.3 Podcasting subcategory verified successfully.');

  console.log('\n--- TEST 2: Service Quotation Validation Logic ---');
  const catVal = validateCategory('Digital Marketing');
  console.log('2.1 validateCategory("Digital Marketing"):', catVal.valid, 'Canonical:', catVal.canonicalName);
  if (!catVal.valid) throw new Error('validateCategory failed for Digital Marketing');

  const subValPodcast = validateSubcategory(catVal.categoryConfig, 'Podcasting');
  console.log('2.2 validateSubcategory("Podcasting"):', subValPodcast.valid, 'Canonical:', subValPodcast.canonicalName);
  if (!subValPodcast.valid) throw new Error('validateSubcategory failed for Podcasting');

  const subValStudio = validateSubcategory(catVal.categoryConfig, 'podcast-studio-recording');
  console.log('2.3 validateSubcategory("podcast-studio-recording"):', subValStudio.valid, 'Canonical:', subValStudio.canonicalName);
  if (!subValStudio.valid) throw new Error('validateSubcategory failed for podcast-studio-recording');

  const subValMarketing = validateSubcategory(catVal.categoryConfig, 'Digital Marketing');
  console.log('2.4 validateSubcategory("Digital Marketing"):', subValMarketing.valid, 'Canonical:', subValMarketing.canonicalName);
  if (!subValMarketing.valid) throw new Error('validateSubcategory failed for Digital Marketing');

  console.log('\n--- TEST 3: Mock Quote Request Submission for Podcasting ---');
  const testQuoteData = {
    requestId: `QT-TEST-${Date.now().toString().slice(-5)}`,
    fullName: 'Test Podcaster',
    mobile: '9876543210',
    email: 'podcast.test@techbes.co.in',
    serviceCategory: 'Digital Marketing',
    subcategory: 'Podcasting',
    service: 'Podcasting Studio & Production',
    serviceSlug: 'podcasting',
    address: 'TechBes Soundproof Studio, Indiranagar, Bangalore',
    locality: 'Indiranagar, Bangalore',
    status: 'quotation_requested',
    items: [
      { productName: 'Podcasting Production: 4 Episodes (Monthly Pack) (Host + 1 In-Studio Guest)', quantity: 1, unitPrice: null, lineTotal: null },
      { productName: 'Services Included: Multi-Mic Studio Audio; 4K Multi-Cam Video Filming; Post-Production Editing & Color; Spotify & YouTube Distribution; Reels / Shorts Vertical Clips', quantity: 1 },
      { productName: 'Studio / Location: TechBes Soundproof Studio (Bangalore)', quantity: 1 },
      { productName: 'Podcast Topic / Name: Tech Leadership Conversations', quantity: 1 }
    ],
    additionalRequirements: 'Need 4K multi-cam with Shure SM7B mics and 12 vertical reels.',
    source: 'Website Quotation Modal (Automated Verification)'
  };

  const createdQuote = await QuoteRequest.create(testQuoteData);
  console.log('3.1 Created Podcasting Quote Request in DB:', createdQuote.requestId, 'Category:', createdQuote.serviceCategory, 'Subcategory:', createdQuote.subcategory);

  const fetchedQuote = await QuoteRequest.findById(createdQuote._id);
  console.log('3.2 Fetched quote matches subcategory:', fetchedQuote.subcategory === 'Podcasting');
  console.log('3.3 Quote items count:', fetchedQuote.items.length);

  // Clean up test quote
  await QuoteRequest.findByIdAndDelete(createdQuote._id);
  console.log('3.4 Cleaned up test quote:', createdQuote.requestId);

  console.log('\n--- TEST 4: Existing CCTV, Networking, and Web Designing Integrity ---');
  const cctvCat = await Category.findOne({ slug: 'cctv' });
  const cctvSubs = await SubCategory.countDocuments({ categoryId: cctvCat._id });
  console.log('4.1 CCTV Category:', cctvCat?.name, 'Subcategories count:', cctvSubs);

  const netCat = await Category.findOne({ slug: 'networking' });
  const netSubs = await SubCategory.countDocuments({ categoryId: netCat._id });
  console.log('4.2 Networking Category:', netCat?.name, 'Subcategories count:', netSubs);

  const webCat = await Category.findOne({ slug: 'website-development' });
  const webSubs = await SubCategory.countDocuments({ categoryId: webCat._id });
  console.log('4.3 Website Development Category:', webCat?.name, 'Subcategories count:', webSubs);

  if (cctvSubs === 0 || netSubs === 0 || webSubs === 0) {
    throw new Error('Existing category subcategories were compromised!');
  }
  console.log('✅ ALL TESTS PASSED SUCCESSFULLY! No regressions detected.');

  await mongoose.disconnect();
}

testWorkflow().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
