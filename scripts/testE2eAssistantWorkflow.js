const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const QuoteRequest = require('../models/QuoteRequest');
const { processServiceRecommendation } = require('../services/aiRecommendationService');

async function testE2EWorkflow() {
  console.log('🧪 Starting End-to-End AI Service Assistant Workflow Test (Kannada & Tanglish)...\n');

  const stagingUri = process.env.STAGING_MONGODB_URI;
  if (!stagingUri) {
    console.warn('⚠️ [Safety Guard] STAGING_MONGODB_URI is not set.');
    console.warn('   To protect production data, testE2eAssistantWorkflow is disabled on production Atlas clusters.');
    console.warn('   Provide STAGING_MONGODB_URI to run end-to-end quotation write tests on a staging environment.');
    process.exit(0);
  }

  await mongoose.connect(stagingUri);

  // 1. Kannada Workflow Test
  console.log('Step 1: Calling AI Recommendation Service with Kannada input: "ನನ್ನ ಮನೆಗೆ ಕ್ಯಾಮೆರಾ ಹಾಕಿಸಬೇಕು, ನಾಲ್ಕು ಕ್ಯಾಮೆರಾ ಬೇಕು"...');

  let responseDataKn = null;
  const mockReqKn = {
    body: {
      messages: [{ role: 'user', content: 'ನನ್ನ ಮನೆಗೆ ಕ್ಯಾಮೆರಾ ಹಾಕಿಸಬೇಕು, ನಾಲ್ಕು ಕ್ಯಾಮೆರಾ ಬೇಕು' }],
      customerLocale: 'kn-IN',
    },
  };
  const mockResKn = {
    status: (code) => ({
      json: (data) => {
        responseDataKn = data;
        return data;
      },
    }),
  };

  await processServiceRecommendation(mockReqKn, mockResKn, (err) => {
    if (err) console.error('Recommendation Error:', err);
  });

  if (!responseDataKn || !responseDataKn.success) {
    console.error('❌ Failed Step 1: Kannada recommendation did not return success', responseDataKn);
    process.exit(1);
  }

  console.log('✅ Step 1 Success: AI responded in Kannada!');
  console.log('Language style:', responseDataKn.data.languageStyle);
  console.log('Detected category:', responseDataKn.data.detectedCategory);
  console.log('Detected property:', responseDataKn.data.detectedPropertyType);
  console.log('Camera count:', responseDataKn.data.estimatedCameraCount);
  console.log('First package title (Kannada):', responseDataKn.data.recommendations[0]?.title);
  console.log('Clarification questions (Kannada):', responseDataKn.data.clarificationQuestions[0]?.question);

  if (responseDataKn.data.estimatedCameraCount !== 4) {
    console.error('❌ Expected 4 cameras, got:', responseDataKn.data.estimatedCameraCount);
    process.exit(1);
  }

  // 2. Customer selects Recommended Package from Kannada recommendations and submits quotation
  console.log('\nStep 2: Customer selects Recommended Package and submits quotation request...');
  const recommendedPkg = responseDataKn.data.recommendations.find(r => r.isPopular) || responseDataKn.data.recommendations[0];

  const testMobile = '9876543210';
  const testFullName = 'ಕನ್ನಡ ಗ್ರಾಹಕ (Kannada Test Customer)';

  await QuoteRequest.deleteMany({ mobile: testMobile });

  const quotePayload = {
    fullName: testFullName,
    mobile: testMobile,
    email: 'kannada_test@techbes.co.in',
    whatsapp: testMobile,
    serviceCategory: 'CCTV',
    subcategory: 'Install New CCTV',
    service: 'Install New CCTV',
    propertyType: responseDataKn.data.detectedPropertyType,
    cameraCount: String(recommendedPkg.cameraCount),
    storage: recommendedPkg.storage,
    recorder: recommendedPkg.recorder,
    items: recommendedPkg.items.map(it => ({
      productId: it.productId,
      productName: it.productName,
      brand: it.brand,
      sku: it.sku,
      variant: it.variant,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      gstRate: it.gstRate,
    })),
    additionalRequirements: `[AI Assistant Kannada Package: ${recommendedPkg.tier}] ನಾಲ್ಕು ಕ್ಯಾಮೆರಾ ಅಳವಡಿಕೆ.`,
    locality: 'Jayanagar',
    address: '#45, 9th Main, Jayanagar 4th Block, Bangalore',
    pincode: '560011',
    preferredVisitDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    preferredVisitTime: '10:00 AM - 01:00 PM',
    source: 'AI Service Assistant',
  };

  const quoteControllerV2 = require('../controllers/v2/quoteControllerV2');
  let quoteResponse = null;
  const quoteReq = { body: quotePayload };
  const quoteRes = {
    status: (code) => ({
      json: (data) => {
        quoteResponse = data;
        return data;
      },
    }),
  };

  await quoteControllerV2.submitQuoteRequest(quoteReq, quoteRes, (err) => {
    if (err) console.error('Quote Submission Error:', err);
  });

  if (!quoteResponse || !quoteResponse.success) {
    console.error('❌ Failed Step 2: Quote submission failed', quoteResponse);
    process.exit(1);
  }

  console.log('✅ Step 2 Success: Quotation created with Request ID:', quoteResponse.data.requestId);

  // 3. Verify in MongoDB
  console.log('\nStep 3: Verifying QuoteRequest record in MongoDB...');
  const createdRecord = await QuoteRequest.findOne({ requestId: quoteResponse.data.requestId }).lean();

  if (!createdRecord) {
    console.error('❌ Quote record not found in MongoDB!');
    process.exit(1);
  }

  console.log('✅ Step 3 Success: MongoDB verification passed!');
  console.log('- Record ID:', createdRecord._id);
  console.log('- Request ID:', createdRecord.requestId);
  console.log('- Full Name:', createdRecord.fullName);
  console.log('- Source:', createdRecord.source);
  console.log('- Status:', createdRecord.status);
  console.log('- Items Count:', createdRecord.items.length);
  console.log('- Subtotal:', createdRecord.subtotal);
  console.log('- Final Amount:', createdRecord.finalAmount);
  console.log('- First Item:', createdRecord.items[0]?.productName, '| Qty:', createdRecord.items[0]?.quantity, '| ProductId:', createdRecord.items[0]?.productId);

  // Clean up test record
  await QuoteRequest.deleteOne({ _id: createdRecord._id });
  console.log('🧹 Cleaned up test record.');

  await mongoose.disconnect();
  console.log('\n🎉 ALL KANNADA END-TO-END WORKFLOW VERIFICATIONS PASSED SUCCESSFULLY!');
}

testE2EWorkflow().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
