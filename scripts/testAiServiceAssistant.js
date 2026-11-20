const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  detectLanguageStyle,
  detectServiceCategory,
  detectPropertyType,
  detectPropertyTypeExplicit,
  extractCameraCount,
  extractFloors,
  extractBudgetMax,
  estimateCameraCount,
  extractUserPreferences,
  isVagueRequest,
  generateRecommendations,
  applyBudgetFilter,
  generateClarificationQuestions,
  generateGatheringReply,
  generateAssistantReply,
  processServiceRecommendation,
} = require('../services/aiRecommendationService');

async function runTests() {
  console.log('🚀 Running AI Service Assistant Backend Tests (with Kannada Support)...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. Language Detection Tests (English, Tamil, Tanglish, Kannada, Kanglish)
  assert(detectLanguageStyle('I need CCTV for my office') === 'english', 'Detect English');
  assert(detectLanguageStyle('En veetuku camera venum') === 'tanglish', 'Detect Tanglish (veetuku / venum)');
  assert(detectLanguageStyle('என் கடைக்கு கேமரா வேண்டும்') === 'tamil', 'Detect Tamil script');
  assert(detectLanguageStyle('ನನಗೆ ಮನೆಯ CCTV ಬೇಕು') === 'kannada', 'Detect Kannada script (ನನಗೆ ಮನೆಯ CCTV ಬೇಕು)');
  assert(detectLanguageStyle('manege 4 camera beku') === 'kanglish', 'Detect Kanglish (manege / beku)');
  assert(detectLanguageStyle('any text', 'kn-IN') === 'kannada', 'Detect Kannada from customerLocale=kn-IN');

  // 2. Kannada User Requirement Examples (Requirement 10)
  // Example A: "ನನಗೆ ಮನೆಯ CCTV ಬೇಕು"
  const exA_cat = detectServiceCategory('ನನಗೆ ಮನೆಯ CCTV ಬೇಕು');
  const exA_prop = detectPropertyType('ನನಗೆ ಮನೆಯ CCTV ಬೇಕು');
  assert(exA_cat.category === 'CCTV', 'Example A: Detects category CCTV ("ನನಗೆ ಮನೆಯ CCTV ಬೇಕು")');
  assert(exA_prop === 'Home / Villa', 'Example A: Detects property Home / Villa ("ಮನೆಯ")');

  // Example B: "ನನ್ನ ಮನೆಗೆ ಕ್ಯಾಮೆರಾ ಹಾಕಿಸಬೇಕು"
  const exB_cat = detectServiceCategory('ನನ್ನ ಮನೆಗೆ ಕ್ಯಾಮೆರಾ ಹಾಕಿಸಬೇಕು');
  const exB_prop = detectPropertyType('ನನ್ನ ಮನೆಗೆ ಕ್ಯಾಮೆರಾ ಹಾಕಿಸಬೇಕು');
  assert(exB_cat.category === 'CCTV', 'Example B: Detects category CCTV ("ಕ್ಯಾಮೆರಾ ಹಾಕಿಸಬೇಕು")');
  assert(exB_prop === 'Home / Villa', 'Example B: Detects property Home / Villa ("ಮನೆಗೆ")');

  // Example C: "ನನಗೆ WiFi ಬೇಕು"
  const exC_cat = detectServiceCategory('ನನಗೆ WiFi ಬೇಕು');
  assert(exC_cat.category === 'Networking', 'Example C: Detects category Networking ("ನನಗೆ WiFi ಬೇಕು")');

  // Example D: "ನಾಲ್ಕು ಕ್ಯಾಮೆರಾ ಬೇಕು"
  const exD_count = extractCameraCount('ನಾಲ್ಕು ಕ್ಯಾಮೆರಾ ಬೇಕು');
  assert(exD_count === 4, 'Example D: Extracts camera count 4 from Kannada word ("ನಾಲ್ಕು")');
  assert(extractCameraCount('ನನ್ನ ಮನೆಗೆ ಕ್ಯಾಮೆರಾ ಹಾಕಿಸಬೇಕು, ನಾಲ್ಕು ಕ್ಯಾಮೆರಾ ಬೇಕು') === 4, 'Extracts camera count 4 from sentence with "ನಾಲ್ಕು"');
  assert(extractCameraCount('ನನಗೆ ೪ ಕ್ಯಾಮೆರಾ ಬೇಕು') === 4, 'Extracts camera count 4 from Kannada numeral ("೪")');
  assert(extractCameraCount('೪') === 4, 'Extracts camera count 4 from standalone Kannada numeral ("೪")');
  assert(extractCameraCount('ನಾಲಕ್ಕು ಕ್ಯಾಮೆರಾ') === 4, 'Extracts camera count 4 from spoken Kannada ("ನಾಲಕ್ಕು")');
  assert(extractCameraCount('ನಾಕು ಕ್ಯಾಮೆರಾ ಬೇಕು') === 4, 'Extracts camera count 4 from spoken Kannada ("ನಾಕು")');

  const exE_count = extractCameraCount('ಎರಡು ಕ್ಯಾಮೆರಾ ಬೇಕು');
  assert(exE_count === 2, 'Extracts camera count 2 from Kannada word ("ಎರಡು")');

  const exF_count = extractCameraCount('ಎಂಟು ಕ್ಯಾಮೆರಾ ಬೇಕು');
  assert(exF_count === 8, 'Extracts camera count 8 from Kannada word ("ಎಂಟು")');

  // 3. Category and Property detection in English and Tamil
  const cat1 = detectServiceCategory('Office-ku WiFi coverage venum');
  assert(cat1.category === 'Networking', 'Detect Networking category from "WiFi coverage"');

  const cat2 = detectServiceCategory('Need cctv installation for home');
  assert(cat2.category === 'CCTV', 'Detect CCTV category');

  assert(detectPropertyType('En veetuku camera venum') === 'Home / Villa', 'Detect Home property from "veetuku"');
  assert(detectPropertyType('Kadai-ku 4 camera theva') === 'Retail Shop', 'Detect Shop from "kadai"');
  assert(detectPropertyType('Godown setup for 8 cameras') === 'Warehouse / Godown', 'Detect Warehouse from "godown"');

  // 4. Estimation when count unknown and floor parsing verification
  assert(extractFloors('2-floor house needing CCTV') === 2, 'Extracts floors: 2 from "2-floor house needing CCTV"');
  assert(extractCameraCount('2-floor house needing CCTV') === null, 'Does NOT misidentify "2-floor" as 2 cameras');
  const est2Floor = estimateCameraCount({ propertyType: 'Home / Villa', text: '2-floor house needing CCTV' });
  assert(est2Floor.isEstimated === true && est2Floor.count === 4, 'Correctly estimates 4 cameras for 2-floor home');

  assert(extractFloors('G+1 independent house') === 2, 'Extracts 2 floors from "G+1"');
  assert(extractFloors('3 floors commercial building') === 3, 'Extracts 3 floors from "3 floors"');
  assert(extractCameraCount('4 cameras for 2-floor villa') === 4, 'Explicit camera count 4 is extracted even with floors mentioned');

  // 4b. User preferences extraction
  const prefHik = extractUserPreferences('I need Hikvision cameras only');
  assert(prefHik.brand === 'Hikvision', 'Extracts brand Hikvision from user message');
  assert(prefHik.componentFocus === 'camera_only', 'Extracts componentFocus "camera_only" from "cameras only"');

  const prefBudget = extractUserPreferences('Need 4 CCTV cameras under 25k');
  assert(prefBudget.budgetCap === 25000, 'Extracts budgetCap 25000 from "under 25k"');

  const est1 = estimateCameraCount({ propertyType: 'Home / Villa', floors: 2, text: "I don't know how many cameras" });
  assert(est1.isEstimated === true && est1.count >= 4, 'Estimate count for 2-floor villa');

  // 5. Clarification Questions in Kannada
  const knQuestions = generateClarificationQuestions({}, 'kannada');
  assert(knQuestions.length === 3, 'Generates 3 clarification questions in Kannada');
  assert(knQuestions[0].question.includes('ಅನುಸ್ಥಾಪನೆ'), 'Kannada question 1 text is in Kannada');
  assert(knQuestions[1].question.includes('ಕ್ಯಾಮೆರಾಗಳು'), 'Kannada question 2 text is in Kannada');

  // 6. Assistant Reply in Kannada
  const knReply = generateAssistantReply({
    langStyle: 'kannada',
    category: 'CCTV',
    propertyType: 'Home / Villa',
    cameraCount: 4,
    recommendations: [{ title: '4-ಕ್ಯಾಮೆರಾ 24/7 ಸ್ಮಾರ್ಟ್ ಕಲರ್ ಪ್ರೊ ಸಿಸ್ಟಮ್', isPopular: true, pricing: { priceDisplay: '₹30,420' } }],
  });
  assert(knReply.includes('ನಮಸ್ಕಾರ'), 'Kannada reply begins with polite Kannada greeting "ನಮಸ್ಕಾರ"');
  assert(knReply.includes('ಮನೆ'), 'Kannada reply references property');

  // 7. Grounded Recommendations with Kannada Language Support
  console.log('\nConnecting to MongoDB to verify Kannada package translations and inventory grounding...');
  await mongoose.connect(process.env.MONGODB_URI);

  const recsKn = await generateRecommendations({
    category: 'CCTV',
    propertyType: 'Home / Villa',
    cameraCount: 4,
    visionPreference: 'Color Night Vision',
    langStyle: 'kannada',
  });

  assert(Array.isArray(recsKn) && recsKn.length === 3, 'Generates 3 recommendation tiers in Kannada (Basic, Recommended, Premium)');

  const popularKn = recsKn.find(r => r.isPopular);
  assert(popularKn && popularKn.tier === 'Recommended', 'Recommended tier is marked as popular');
  assert(popularKn.title.includes('ಕ್ಯಾಮೆರಾ'), 'Recommended title is translated into Kannada');
  assert(popularKn.tagline.includes('ಬಣ್ಣದ'), 'Recommended tagline is in Kannada');
  assert(popularKn.features[0].includes('ವೀಡಿಯೊ') || popularKn.features[0].includes('ಬಣ್ಣದ'), 'Recommended features are in Kannada');

  // Verify Rule 7: Inventory items, SKUs, and prices remain genuine and unchanged
  for (const pkg of recsKn) {
    assert(pkg.items.length > 0, `${pkg.tier} package contains genuine material items`);
    assert(pkg.pricing && pkg.pricing.hasAuthoritativePricing, `${pkg.tier} has authoritative pricing calculation`);
    assert(pkg.pricing.finalAmount > 0, `${pkg.tier} finalAmount is a positive number (₹${pkg.pricing.finalAmount})`);

    for (const item of pkg.items) {
      assert(mongoose.Types.ObjectId.isValid(item.productId), `Item "${item.productName}" preserves valid productId`);
      assert(typeof item.sku === 'string' && item.sku.length > 0, `Item "${item.productName}" preserves SKU: ${item.sku}`);
      assert(item.unitPrice > 0, `Item "${item.productName}" preserves unitPrice: ₹${item.unitPrice}`);
    }
    // Verify rounding
    assert(Number.isInteger(pkg.pricing.finalAmount), `${pkg.tier} finalAmount is rounded to integer (no decimals): ₹${pkg.pricing.finalAmount}`);
  }

  // 8. Brand-Specific Recommendation Grounding (Hikvision)
  console.log('\nTesting Brand-Specific Grounding (Hikvision)...');
  const recsHik = await generateRecommendations({
    category: 'CCTV',
    propertyType: 'Home / Villa',
    cameraCount: 4,
    userPreferences: { brand: 'Hikvision', componentFocus: 'full_system' },
  });
  assert(recsHik.length > 0, 'Generates packages for brand-specific request (Hikvision)');
  const hikBasic = recsHik[0];
  assert(hikBasic.brand === 'Hikvision', 'Basic package reflects requested brand (Hikvision)');

  // 9. Component-Only Recommendation Grounding ("camera_only")
  console.log('\nTesting Component-Only Expansion Grounding (camera_only)...');
  const recsCamOnly = await generateRecommendations({
    category: 'CCTV',
    propertyType: 'Home / Villa',
    cameraCount: 2,
    userPreferences: { componentFocus: 'camera_only' },
  });
  assert(recsCamOnly.length === 2, 'Generates 2 tailored expansion packages for camera_only');
  assert(recsCamOnly[0].id.includes('addon-cameras'), 'Package ID indicates camera add-on kit');
  assert(recsCamOnly[0].pricing.hasAuthoritativePricing, 'Camera add-on has authoritative dynamic pricing');
  assert(Number.isInteger(recsCamOnly[0].pricing.finalAmount), `Camera add-on amount is clean integer: ₹${recsCamOnly[0].pricing.finalAmount}`);

  // 10. NEW: extractBudgetMax — Multilingual Budget Parser
  console.log('\nTesting Multilingual Budget Parser (extractBudgetMax)...');
  assert(extractBudgetMax('20k ku ulla kudu') === 20000, 'Budget: "20k ku ulla kudu" → ₹20,000');
  assert(extractBudgetMax('20k ku ulla') === 20000, 'Budget: "20k ku ulla" → ₹20,000');
  assert(extractBudgetMax('under 20k') === 20000, 'Budget: "under 20k" → ₹20,000');
  assert(extractBudgetMax('below 20000') === 20000, 'Budget: "below 20000" → ₹20,000');
  assert(extractBudgetMax('budget 15000') === 15000, 'Budget: "budget 15000" → ₹15,000');
  assert(extractBudgetMax('max 25k') === 25000, 'Budget: "max 25k" → ₹25,000');
  assert(extractBudgetMax('within 30000') === 30000, 'Budget: "within 30000" → ₹30,000');
  assert(extractBudgetMax('I need CCTV') === null, 'Budget: no budget in "I need CCTV" → null');
  assert(extractBudgetMax('20 ಸಾವಿರ ಒಳಗೆ') === 20000, 'Budget: Kannada "20 ಸಾವಿರ ಒಳಗೆ" → ₹20,000');

  // 11. NEW: detectPropertyTypeExplicit — no default fallback
  console.log('\nTesting detectPropertyTypeExplicit (no default fallback)...');
  assert(detectPropertyTypeExplicit('CCTV venum') === null, 'No explicit property in "CCTV venum" → null');
  assert(detectPropertyTypeExplicit('home ku 4 camera') === 'Home / Villa', 'Explicit Home from "home ku"');
  assert(detectPropertyTypeExplicit('shop camera') === 'Retail Shop', 'Explicit Shop detected');
  assert(detectPropertyTypeExplicit('office CCTV') === 'Commercial Office', 'Explicit Office detected');

  // 12. NEW: isVagueRequest — Phase A vs Phase B detection
  console.log('\nTesting isVagueRequest (Phase A vs Phase B)...');
  assert(isVagueRequest('CCTV venum', {}) === true, 'Phase A: "CCTV venum" with empty context is vague');
  assert(isVagueRequest('camera setup', {}) === true, 'Phase A: "camera setup" with no context is vague');
  assert(isVagueRequest('I need CCTV', {}) === true, 'Phase A: "I need CCTV" with no context is vague');
  assert(isVagueRequest('4 cameras for my home', {}) === false, 'Phase B: "4 cameras for my home" has count+prop → not vague');
  assert(isVagueRequest('4 cameras', { propertyType: 'Home / Villa' }) === false, 'Phase B: count in msg + prop in context → not vague');
  assert(isVagueRequest('home ku', { cameraCount: 4 }) === false, 'Phase B: prop in msg + count in context → not vague');
  assert(isVagueRequest('4 cameras for my shop', {}) === false, 'Phase B: "4 cameras for my shop" → not vague');
  assert(isVagueRequest('show me packages', {}) === false, 'Phase B: "show me packages" → not vague (explicit intent)');
  assert(isVagueRequest('help me plan', {}) === true, 'Phase A: "help me plan" → vague');

  // 13. NEW: Budget filter + multi-turn test (requires MongoDB)
  console.log('\nTesting Budget Filter + Multi-turn via applyBudgetFilter...');

  // Generate base 4-camera packages then apply ₹20,000 budget filter
  const base4Packages = await generateRecommendations({
    category: 'CCTV',
    propertyType: 'Home / Villa',
    cameraCount: 4,
    langStyle: 'english',
    userPreferences: {},
  });
  assert(base4Packages.length > 0, 'Base 4-cam packages generated');

  const generateForCount = async (count) => generateRecommendations({
    category: 'CCTV',
    propertyType: 'Home / Villa',
    cameraCount: count,
    langStyle: 'english',
    userPreferences: {},
  });

  const budgetResult = await applyBudgetFilter({
    packages: base4Packages,
    budgetMax: 20000,
    cameraCount: 4,
    langStyle: 'english',
    generateRecsCallback: generateForCount,
  });

  // All returned packages must be <= ₹20,000
  const allUnderBudget = budgetResult.filteredPackages.every(
    pkg => !pkg.pricing?.finalAmount || pkg.pricing.finalAmount <= 20000
  );
  assert(allUnderBudget, 'Budget filter: ALL returned packages ≤ ₹20,000 when budgetMax=20000');
  assert(budgetResult.filteredPackages.length >= 1, 'Budget filter: At least 1 package returned');

  // If 4-cam exceeds ₹20k, should have a budgetNote explaining the reduction
  const cheapest4 = base4Packages.reduce((min, p) =>
    (p.pricing?.finalAmount || Infinity) < (min.pricing?.finalAmount || Infinity) ? p : min
  , base4Packages[0]);

  if (cheapest4.pricing?.finalAmount > 20000) {
    assert(budgetResult.budgetNote !== null, 'Budget filter: budgetNote is set when 4-cam exceeds ₹20k');
    assert(budgetResult.adjustedCameraCount < 4, 'Budget filter: adjustedCameraCount reduced below 4');
    console.log(`  → Reduced to ${budgetResult.adjustedCameraCount} cameras with note: "${budgetResult.budgetNote?.substring(0, 80)}..."`);
  } else {
    console.log('  → 4-camera fits in ₹20k (no reduction needed)');
  }

  // 14. NEW: generateGatheringReply
  console.log('\nTesting generateGatheringReply...');
  const gatherEn = generateGatheringReply({ langStyle: 'english', sessionContext: {} });
  assert(gatherEn.includes('TechBes'), 'Gathering reply (en) contains TechBes');
  assert(gatherEn.includes('details'), 'Gathering reply (en) asks for details');

  const gatherKn = generateGatheringReply({ langStyle: 'kannada', sessionContext: {} });
  assert(gatherKn.includes('TechBes'), 'Gathering reply (kn) contains TechBes');
  assert(gatherKn.includes('ಪ್ರಶ್ನೆ'), 'Gathering reply (kn) mentions questions');

  const gatherTa = generateGatheringReply({ langStyle: 'tanglish', sessionContext: {} });
  assert(gatherTa.includes('TechBes'), 'Gathering reply (ta) contains TechBes');

  // 15. NEW: End-to-End Multi-Turn Simulation & Question-First Discovery
  console.log('\nTesting End-to-End Multi-Turn Flow & Question-First Discovery...');

  const createMockRes = () => ({
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  });

  // Case 1: Initial vague prompt "CCTV venum" → Must ask questions FIRST, packages: []
  const resTurn1 = createMockRes();
  await processServiceRecommendation({
    body: {
      messages: [{ role: 'user', content: 'CCTV venum' }],
      customerLocale: 'ta-IN',
      sessionContext: {},
    },
  }, resTurn1);

  assert(resTurn1.body?.success === true, 'Turn 1: Request succeeded');
  assert(resTurn1.body?.data?.stage === 'gathering_requirements', 'Turn 1 ("CCTV venum"): Stage is gathering_requirements');
  assert(Array.isArray(resTurn1.body?.data?.recommendations) && resTurn1.body?.data?.recommendations.length === 0, 'Turn 1: packages is EMPTY (no premature quotation dump)');
  assert(Array.isArray(resTurn1.body?.data?.clarificationQuestions) && resTurn1.body?.data?.clarificationQuestions.length > 0, 'Turn 1: Returns clarification questions');

  // Case 2: Vague initial budget without property/camera count "20k ku ulla kudu" → Questions FIRST!
  const resVagueBudget = createMockRes();
  await processServiceRecommendation({
    body: {
      messages: [{ role: 'user', content: '20k ku ulla kudu' }],
      customerLocale: 'ta-IN',
      sessionContext: {},
    },
  }, resVagueBudget);

  assert(resVagueBudget.body?.data?.stage === 'gathering_requirements', 'Vague budget ("20k ku ulla kudu"): Asks questions FIRST');
  assert(resVagueBudget.body?.data?.recommendations.length === 0, 'Vague budget: Packages array is empty');
  assert(resVagueBudget.body?.data?.sessionContext?.budgetMax === 20000, 'Vague budget: Captures budgetMax: 20000 in sessionContext');

  // Case 3: Turn 2 — User answers with property & camera count "home ku 4 camera"
  const turn1Context = resTurn1.body.data.sessionContext;
  const resTurn2 = createMockRes();
  await processServiceRecommendation({
    body: {
      messages: [
        { role: 'user', content: 'CCTV venum' },
        { role: 'assistant', content: resTurn1.body.data.reply },
        { role: 'user', content: 'home ku 4 camera' },
      ],
      customerLocale: 'ta-IN',
      sessionContext: turn1Context,
    },
  }, resTurn2);

  assert(resTurn2.body?.data?.stage === 'recommendations', 'Turn 2 ("home ku 4 camera"): Transitions to recommendations');
  assert(resTurn2.body?.data?.sessionContext?.propertyType === 'Home / Villa', 'Turn 2: Property detected as Home / Villa');
  assert(resTurn2.body?.data?.sessionContext?.cameraCount === 4, 'Turn 2: Camera count resolved to 4');
  assert(resTurn2.body?.data?.recommendations?.length > 0, 'Turn 2: Recommendations generated');

  // Case 4: Turn 3 — User constrains with budget: "20k ku ulla kudu"
  const turn2Context = resTurn2.body.data.sessionContext;
  const resTurn3 = createMockRes();
  await processServiceRecommendation({
    body: {
      messages: [
        { role: 'user', content: 'CCTV venum' },
        { role: 'assistant', content: resTurn1.body.data.reply },
        { role: 'user', content: 'home ku 4 camera' },
        { role: 'assistant', content: resTurn2.body.data.reply },
        { role: 'user', content: '20k ku ulla kudu' },
      ],
      customerLocale: 'ta-IN',
      sessionContext: turn2Context,
    },
  }, resTurn3);

  assert(resTurn3.body?.data?.stage === 'recommendations', 'Turn 3 ("20k ku ulla kudu"): Stage is recommendations');
  assert(resTurn3.body?.data?.sessionContext?.budgetMax === 20000, 'Turn 3: sessionContext has budgetMax: 20000');
  const t3Recs = resTurn3.body?.data?.recommendations || [];
  assert(t3Recs.length > 0, 'Turn 3: Has filtered recommendation packages');
  const allT3UnderBudget = t3Recs.every(p => !p.pricing?.finalAmount || p.pricing.finalAmount <= 20000);
  assert(allT3UnderBudget, 'Turn 3: STRICT BUDGET FILTER — ALL packages are ≤ ₹20,000');

  await mongoose.disconnect();

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
