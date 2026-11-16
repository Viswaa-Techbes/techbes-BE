const Material = require('../models/Material');
const PricingConfig = require('../models/PricingConfig');
const inventoryService = require('./inventoryService');
const { ensureInventorySeeded } = require('../utils/inventoryBootstrap');

/**
 * Natural language dictionaries for English, Tamil, and Kannada scripts & conversational transliteration.
 */
const PROPERTY_KEYWORDS = {
  home: [
    // Tamil & Tanglish
    'veedu', 'veetuku', 'veetukku', 'veettuku', 'veetula', 'veetla', 'veedu-ku',
    'வீடு', 'வீட்டுக்கு', 'இல்லம்',
    // Kannada & Kanglish
    'mane', 'manege', 'maney', 'maneli', 'maneyalli', 'ಮನೆ', 'ಮನೆಗೆ', 'ಮನೆಯ', 'ಮನೆಯಲ್ಲಿ', 'ವಿಲ್ಲಾ',
    // English
    'house', 'home', 'residence', 'residential', 'villa'
  ],
  apartment: [
    'apartment', 'flat', 'flats', 'complex', 'ಅಪಾರ್ಟ್ಮೆಂಟ್', 'ಫ್ಲಾಟ್', 'பிளாட்', 'அபார்ட்மெண்ட்'
  ],
  shop: [
    // Tamil & Tanglish
    'kadai', 'kadaiku', 'kadai-ku', 'kadaikku', 'கடை', 'கடைக்கு',
    // Kannada & Kanglish
    'angadi', 'angadige', 'angadiya', 'ಅಂಗಡಿ', 'ಅಂಗಡಿಗೆ', 'ಅಂಗಡಿಯ', 'ಶೋರೂಮ್',
    // English
    'store', 'shop', 'showroom', 'retail'
  ],
  office: [
    // Tamil & Kannada
    'office', 'office-ku', 'officeku', 'office-ge', 'officege', 'workplace', 'company',
    'அலுவலகம்', 'ಕಚೇರಿ', 'ಕಚೇರಿಗೆ', 'ಆಫೀಸ್'
  ],
  warehouse: [
    'godown', 'godown-ku', 'godownku', 'godown-ge', 'godownge', 'warehouse', 'factory', 'shed',
    'கிடங்கு', 'ಗೋದಾಮು', 'ಗೋದಾಮಿಗೆ'
  ],
};

/**
 * Extract camera count from text (numeric digits or English/Tamil/Kannada words).
 */
function extractCameraCount(text = '') {
  const lower = String(text).toLowerCase();

  // Explicit number before or after "camera" / "cam" / "ಕ್ಯಾಮೆರಾ"
  const numCamRegex = /(\d+)\s*(?:camera|cameras|cam|cams|cctv|point|points|ಕ್ಯಾಮೆರಾ|ಕ್ಯಾಮರಾ|ಕ್ಯಾಮೆರಾಗಳು|கேமரா)/i;
  const matchNum = lower.match(numCamRegex);
  if (matchNum && matchNum[1]) {
    const n = parseInt(matchNum[1], 10);
    if (n > 0 && n <= 64) return n;
  }

  // Cam before number: "camera 4", "cameras 8", "ಕ್ಯಾಮೆರಾ 4"
  const camNumRegex = /(?:camera|cameras|cam|cams|cctv|ಕ್ಯಾಮೆರಾ|ಕ್ಯಾಮರಾ|ಕ್ಯಾಮೆರಾಗಳು|கேமரா)\s*(\d+)/i;
  const matchCamNum = lower.match(camNumRegex);
  if (matchCamNum && matchCamNum[1]) {
    const n = parseInt(matchCamNum[1], 10);
    if (n > 0 && n <= 64) return n;
  }

  // Word-based numbers across English, Tamil, and Kannada
  const wordMap = {
    // English
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8,
    'nine': 9, 'ten': 10, 'twelve': 12, 'sixteen': 16,
    // Tamil & Tanglish
    'oru': 1, 'rendu': 2, 'moonu': 3, 'naalu': 4, 'anju': 5, 'aaru': 6, 'yelu': 7, 'yettu': 8, 'onbathu': 9, 'pathu': 10,
    'ஒன்று': 1, 'இரண்டு': 2, 'மூன்று': 3, 'நான்கு': 4, 'ஐந்து': 5, 'ஆறு': 6, 'எட்டு': 8, 'பத்து': 10,
    // Kannada & Kanglish
    'ondu': 1, 'eradu': 2, 'mooru': 3, 'naalku': 4, 'nalku': 4, 'aidu': 5, 'entu': 8, 'ombattu': 9, 'hattu': 10, 'hadinaaru': 16,
    'ಒಂದು': 1, 'ಎರಡು': 2, 'ಮೂರು': 3, 'ನಾಲ್ಕು': 4, 'ಐದು': 5, 'ಆರು': 6, 'ಏಳು': 7, 'ಎಂಟು': 8, 'ಒಂಬತ್ತು': 9, 'ಹತ್ತು': 10, 'ಹನ್ನೆರಡು': 12, 'ಹದಿನಾರು': 16,
  };

  for (const [word, val] of Object.entries(wordMap)) {
    const rx = new RegExp(`(?:^|\\s)${word}(?:\\s|$)(?:camera|cameras|cam|cams|point|ಕ್ಯಾಮೆರಾ|ಕ್ಯಾಮರಾ|ಕ್ಯಾಮೆರಾಗಳು)?`, 'i');
    if (rx.test(lower)) {
      return val;
    }
  }

  // Standalone digits up to 32 if in context of camera request
  const standalone = lower.match(/\b([1-9]|[12]\d|32)\b/);
  if (standalone && (lower.includes('camera') || lower.includes('cam') || lower.includes('cctv') || lower.includes('point') || lower.includes('ಕ್ಯಾಮೆರಾ') || lower.includes('கேமரா'))) {
    return parseInt(standalone[1], 10);
  }

  return null;
}

/**
 * Extract floors from user message.
 */
function extractFloors(text = '') {
  const lower = String(text).toLowerCase();
  const floorMatch = lower.match(/(\d+)\s*(?:floor|floors|nilam|maadi|nilangal|ಮಹಡಿ|ಅಂತಸ್ತು)/i);
  if (floorMatch && floorMatch[1]) {
    return parseInt(floorMatch[1], 10);
  }
  if (lower.includes('duplex') || lower.includes('2 floor') || lower.includes('rendu maadi') || lower.includes('eradu mahadi') || lower.includes('ಎರಡು ಮಹಡಿ')) return 2;
  if (lower.includes('3 floor') || lower.includes('moonu maadi') || lower.includes('mooru mahadi') || lower.includes('ಮೂರು ಮಹಡಿ')) return 3;
  if (lower.includes('single floor') || lower.includes('ground floor') || lower.includes('oru maadi') || lower.includes('ಒಂದು ಮಹಡಿ')) return 1;
  return null;
}

/**
 * Identify service category and subcategory from user utterance and history.
 */
function detectServiceCategory(text = '', currentCategory = null) {
  const lower = String(text).toLowerCase();

  // 1. CCTV
  if (
    lower.match(/\b(cctv|camera|cameras|cam|surveillance|dvr|nvr|dome|bullet|ip camera|night vision|security cam)\b/) ||
    lower.includes('கேமரா') || lower.includes('கண்காணிப்பு') ||
    lower.includes('ಕ್ಯಾಮೆರಾ') || lower.includes('ಕ್ಯಾಮರಾ') || lower.includes('ಸಿಸಿಟಿವಿ') || lower.includes('ಕಣ್ಗಾವಲು')
  ) {
    let subcategory = 'Install New CCTV';
    if (lower.match(/\b(repair|fix|broken|not working|service|blur|offline|troubleshoot)\b/) || lower.includes('ರಿಪೇರಿ') || lower.includes('ಹಾಳಾಗಿದೆ') || lower.includes('ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲ')) {
      subcategory = 'Repair Existing CCTV';
    } else if (lower.match(/\b(amc|maintenance|annual|yearly contract)\b/) || lower.includes('ವಾರ್ಷಿಕ ನಿರ್ವಹಣೆ') || lower.includes('ಎಎಂಸಿ')) {
      subcategory = 'Maintenance / AMC';
    } else if (lower.match(/\b(upgrade|replace old|analog to ip)\b/) || lower.includes('ಅಪ್‌ಗ್ರೇಡ್')) {
      subcategory = 'Upgrade Existing CCTV';
    } else if (lower.match(/\b(survey|site visit|audit)\b/) || lower.includes('ಪರಿಶೀಲನೆ') || lower.includes('ಸರ್ವೇ')) {
      subcategory = 'Free Site Survey';
    }
    return { category: 'CCTV', subcategory };
  }

  // 2. Networking
  if (
    lower.match(/\b(wifi|wi-fi|router|lan|network|networking|cabling|cat6|access point|ap|switch|bandwidth|ethernet|patch panel)\b/) ||
    lower.includes('இணையம்') || lower.includes('வைஃபை') ||
    lower.includes('ವೈಫೈ') || lower.includes('ಇಂಟರ್ನೆಟ್') || lower.includes('ನೆಟ್‌ವರ್ಕ್') || lower.includes('ರೂಟರ್')
  ) {
    let subcategory = 'Wi-Fi & Internet Speed Optimization';
    if (lower.match(/\b(cabling|structured|cat6|fiber|pulling|drops|lan points)\b/) || lower.includes('ಕೇಬಲಿಂಗ್')) {
      subcategory = 'Structured Cat6 / Fiber Cabling';
    } else if (lower.match(/\b(server|nas|storage|firewall)\b/)) {
      subcategory = 'Server & NAS Storage Integration';
    }
    return { category: 'Networking', subcategory };
  }

  // 3. Web Designing / Software
  if (
    lower.match(/\b(website|web design|web page|ecommerce|e-commerce|web development|portal|landing page)\b/) ||
    lower.includes('வலைத்தளம்') || lower.includes('ವೆಬ್‌ಸೈಟ್')
  ) {
    return { category: 'Web Designing', subcategory: 'Business Website' };
  }

  // 4. Digital Marketing
  if (
    lower.match(/\b(digital marketing|seo|google ads|meta ads|facebook ads|instagram ads|podcast|social media)\b/) ||
    lower.includes('ಮಾರ್ಕೆಟಿಂಗ್')
  ) {
    return { category: 'Digital Marketing', subcategory: 'Digital Marketing' };
  }

  // Default fallback to CCTV or previous category
  return {
    category: currentCategory || 'CCTV',
    subcategory: 'Install New CCTV',
  };
}

/**
 * Identify property type from text.
 */
function detectPropertyType(text = '') {
  const lower = String(text).toLowerCase();

  for (const [propKey, keywords] of Object.entries(PROPERTY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        if (propKey === 'home') return 'Home / Villa';
        if (propKey === 'apartment') return 'Apartment / Flat';
        if (propKey === 'shop') return 'Retail Shop';
        if (propKey === 'office') return 'Commercial Office';
        if (propKey === 'warehouse') return 'Warehouse / Godown';
      }
    }
  }

  return 'Home / Villa';
}

/**
 * Detect language nuances (Kannada, Tamil, Tanglish, English).
 */
function detectLanguageStyle(text = '', customerLocale = 'en-IN') {
  if (customerLocale === 'kn-IN' || customerLocale === 'kn') return 'kannada';
  if (customerLocale === 'ta-IN' || customerLocale === 'ta') return 'tamil';

  const hasKannadaScript = /[\u0C80-\u0CFF]/.test(text);
  if (hasKannadaScript) return 'kannada';

  const hasTamilScript = /[\u0B80-\u0BFF]/.test(text);
  if (hasTamilScript) return 'tamil';

  const lower = String(text).toLowerCase();

  // Kanglish keywords
  const hasKanglish = [
    'beku', 'haakisabeku', 'madabeku', 'kharchu', 'manege', 'maneli', 'angadige',
    'gottilla', 'kodi', 'nange', 'namage', 'eshtu', 'tilisi'
  ].some(k => lower.includes(k));
  if (hasKanglish) return 'kanglish';

  // Tanglish keywords
  const hasTanglish = [
    'veetuku', 'veetukku', 'veetla', 'kadai', 'kadaiku', 'venum', 'vendum', 'theva',
    'thevai', 'evvalo', 'yevlo', 'irukku', 'irukka', 'solunga', 'sonna', 'nalladhu'
  ].some(k => lower.includes(k));
  if (hasTanglish) return 'tanglish';

  return 'english';
}

/**
 * Estimate camera count based on property type, floors, and monitoring points if customer is unsure.
 */
function estimateCameraCount({ propertyType, floors, text = '' }) {
  const explicitCount = extractCameraCount(text);
  if (explicitCount) return { count: explicitCount, isEstimated: false };

  const parsedFloors = floors || extractFloors(text) || 1;
  const prop = propertyType || detectPropertyType(text);

  let estimated = 4;
  if (prop === 'Home / Villa') {
    if (parsedFloors === 1) estimated = 3; // Front gate, Backyard/corridor, Hall
    else if (parsedFloors === 2) estimated = 4; // Gate, Parking, 1st floor balcony, Staircase
    else estimated = 6; // 3+ floors
  } else if (prop === 'Apartment / Flat') {
    estimated = 2; // Main entrance door + Living/Balcony
  } else if (prop === 'Retail Shop') {
    estimated = 4; // Cash counter, Entrance/Front, Billing desk, Stock/Aisle
  } else if (prop === 'Commercial Office') {
    estimated = Math.max(4, parsedFloors * 3); // Reception, Workstation floor, Server room, Exit
  } else if (prop === 'Warehouse / Godown') {
    estimated = 8; // Loading dock, Entry gate, Storage racks, Office room
  }

  return { count: estimated, isEstimated: true };
}

/**
 * Main service recommendation generation engine grounded in actual DB records.
 * Supports Kannada, Tamil, and English package descriptions while preserving inventory item IDs & SKUs.
 */
async function generateRecommendations({
  category = 'CCTV',
  subcategory = 'Install New CCTV',
  propertyType = 'Home / Villa',
  cameraCount = 4,
  visionPreference = 'Color Night Vision',
  audioPreference = false,
  cableEstimatePerCam = 25,
  langStyle = 'english',
}) {
  if (process.env.ENABLE_INVENTORY_SEEDING === 'true') {
    await ensureInventorySeeded();
  }

  const isKannada = langStyle === 'kannada' || langStyle === 'kanglish';
  const count = Math.max(1, Math.min(cameraCount || 4, 32));
  const cablePerCam = Math.max(10, Math.min(cableEstimatePerCam || 25, 100));
  const totalCableMeters = count * cablePerCam;

  // Fetch actual products from MongoDB Material collection
  const allMaterials = await Material.find({
    status: 'active',
    isArchived: { $ne: true },
  }).lean();

  const allPricing = await PricingConfig.find({
    status: 'active',
  }).lean();

  // Helper to find genuine material by SKU or keyword
  const findMat = (skuRegex, fallbackName) => {
    const found = allMaterials.find(m =>
      (m.sku && m.sku.match(skuRegex)) ||
      (m.name && m.name.match(skuRegex))
    );
    if (found) return found;
    return allMaterials.find(m => m.name.toLowerCase().includes(fallbackName.toLowerCase())) || null;
  };

  const findPricingRule = (codeRegex) => {
    return allPricing.find(p => p.code && p.code.match(codeRegex)) || null;
  };

  const packages = [];

  if (category === 'CCTV') {
    // ────────── TIER 1: BASIC / ESSENTIAL HD PACKAGE ──────────
    const basicCam = findMat(/CP-PLUS-2MP-DOME/i, 'CP Plus 2MP');
    const basicDvr = count > 4 ? findMat(/CP-PLUS-DVR-8CH/i, 'DVR') : findMat(/CP-PLUS-DVR-4CH/i, 'DVR');
    const basicHdd = findMat(/HDD-SURV-1TB/i, '1TB');
    const basicCable = findMat(/CABLE-3PLUS1-MTR/i, '3+1');
    const junctionBox = findMat(/ACC-JUNCTION-BOX/i, 'Junction Box');
    const smps = count > 4 ? findMat(/SMPS-12V-10A/i, 'Power Supply') : findMat(/SMPS-12V-5A/i, 'Power Supply');

    const installRule = findPricingRule(/SRV-CAM-FITTING/i);
    const dvrSetupRule = findPricingRule(/SRV-RECORDER-SETUP/i);

    const basicItems = [];
    if (basicCam) basicItems.push({ item: basicCam, quantity: count, role: 'camera' });
    if (basicDvr) basicItems.push({ item: basicDvr, quantity: 1, role: 'recorder' });
    if (basicHdd) basicItems.push({ item: basicHdd, quantity: 1, role: 'storage' });
    if (basicCable) basicItems.push({ item: basicCable, quantity: totalCableMeters, role: 'cabling' });
    if (junctionBox) basicItems.push({ item: junctionBox, quantity: count, role: 'accessory' });
    if (smps) basicItems.push({ item: smps, quantity: 1, role: 'power' });

    let basicCalc = null;
    try {
      basicCalc = await inventoryService.calculateDynamicQuotePricing({
        serviceCategory: 'CCTV',
        items: basicItems.map(b => ({
          productId: b.item._id,
          productName: b.item.name,
          quantity: b.quantity,
          sku: b.item.sku,
        })),
        appliedRules: [
          ...(installRule ? [{ ruleId: installRule._id, quantity: count }] : []),
          ...(dvrSetupRule ? [{ ruleId: dvrSetupRule._id, quantity: 1 }] : []),
        ],
      });
    } catch (e) {
      console.warn('[AI Recommendation] Basic pricing calculation error:', e.message);
    }

    packages.push({
      id: 'basic-hd',
      tier: 'Basic',
      badge: isKannada ? 'ಎಸೆನ್ಷಿಯಲ್ ಭದ್ರತೆ (Basic)' : 'Essential Security',
      title: isKannada
        ? `${count}-ಕ್ಯಾಮೆರಾ ಎಸೆನ್ಷಿಯಲ್ HD ಸಿಸ್ಟಮ್`
        : `${count}-Camera Essential HD System`,
      tagline: isKannada
        ? 'ಮನೆ ಮತ್ತು ಸಣ್ಣ ಅಂಗಡಿಗಳಿಗೆ ಸೂಕ್ತವಾದ ಬಜೆಟ್-ಸ್ನೇಹಿ 1080p HD ಭದ್ರತೆ.'
        : 'Budget-friendly, high-definition 1080p surveillance for everyday home & shop security.',
      cameraCount: count,
      cameraType: isKannada
        ? 'CP Plus 2MP Full HD ಡೋಮ್ / ಬುಲೆಟ್'
        : 'CP Plus 2MP Full HD Dome / Bullet',
      brand: 'CP Plus',
      recorder: count > 4 ? 'CP Plus 8-Channel HD DVR' : 'CP Plus 4-Channel HD DVR',
      storage: isKannada
        ? '1TB SkyHawk ಕಣ್ಗಾವಲು ಹಾರ್ಡ್ ಡಿಸ್ಕ್ (~12-15 ದಿನಗಳ ರೆಕಾರ್ಡಿಂಗ್)'
        : '1TB SkyHawk Surveillance Hard Drive (~12-15 Days Recording)',
      isPopular: false,
      items: basicItems.map(b => ({
        productId: b.item._id,
        productName: b.item.name,
        brand: b.item.brand,
        sku: b.item.sku,
        variant: b.item.variant,
        unit: b.item.unit,
        unitPrice: b.item.basePrice || b.item.price,
        quantity: b.quantity,
        gstRate: b.item.gstRate || 18,
        availableStock: b.item.stock,
        inStock: b.item.stock >= b.quantity,
      })),
      pricing: basicCalc ? {
        itemsSubtotal: basicCalc.pricingBreakdown.itemsSubtotal,
        labourCharge: basicCalc.pricingBreakdown.labourCharge,
        serviceCharge: basicCalc.pricingBreakdown.serviceCharge,
        subtotal: basicCalc.subtotal,
        gstRate: basicCalc.gstRate,
        gstAmount: basicCalc.gstAmount,
        finalAmount: basicCalc.finalAmount,
        priceDisplay: `₹${basicCalc.finalAmount.toLocaleString('en-IN')}`,
        hasAuthoritativePricing: true,
      } : {
        finalAmount: null,
        priceDisplay: isKannada ? 'ಕೊಟೇಶನ್ ಅಗತ್ಯವಿದೆ' : 'Quotation required',
        hasAuthoritativePricing: false,
      },
      features: isKannada ? [
        '1080P Full HD ಸ್ಪಷ್ಟ ವೀಡಿಯೊ ರೆಕಾರ್ಡಿಂಗ್',
        '20 ಮೀಟರ್ ಸ್ಮಾರ್ಟ್ ಇನ್‌ಫ್ರಾರೆಡ್ ನೈಟ್ ವಿಷನ್',
        'ಮೊಬೈಲ್ ಲೈವ್ ವೀಕ್ಷಣೆ (CP Plus gCMOB App - Android & iOS)',
        'ಚಲನೆ ಪತ್ತೆ (Motion Detection) ಮತ್ತು ಮೊಬೈಲ್ ಎಚ್ಚರಿಕೆಗಳು',
        'IP66 ಜಲನಿರೋಧಕ (Weatherproof) ಬಾಹ್ಯ ಕವಚ',
      ] : [
        '1080P Full HD Video Clarity',
        '20-meter Smart Infrared Night Vision',
        'Mobile Live Viewing via CP Plus gCMOB App (iOS & Android)',
        'Motion Detection Alerts & Playback Search',
        'Sealed IP66 Weatherproof Outdoor Casing',
      ],
      assumptions: isKannada ? [
        `ಪ್ರತಿ ಕ್ಯಾಮೆರಾ ಪಾಯಿಂಟ್‌ಗೆ ${cablePerCam} ಮೀಟರ್‌ವರೆಗೆ 3+1 ಕೇಬಲ್ ಒಳಗೊಂಡಿದೆ (ಅಂದಾಜು ${totalCableMeters} ಮೀಟರ್).`,
        'ಅಂತಿಮ ಕೇಬಲ್ ಉದ್ದವನ್ನು ಸೈಟ್ ಭೇಟಿಯ ಸಮಯದಲ್ಲಿ ದೃಢೀಕರಿಸಲಾಗುತ್ತದೆ.',
        'ಕ್ಯಾಮೆರಾ ಫಿಟ್ಟಿಂಗ್, ಗೋಡೆ ಡ್ರಿಲ್ಲಿಂಗ್ ಮತ್ತು ಸ್ಮಾರ್ಟ್‌ಫೋನ್ ಸೆಟಪ್ ಒಳಗೊಂಡಿದೆ.',
      ] : [
        `Includes up to ${cablePerCam}m 3+1 cabling per camera point (${totalCableMeters}m total estimate).`,
        'Exact cabling meters will be measured and finalized during on-site visit.',
        'Includes professional camera fitting, wall drilling, and smartphone setup.',
      ],
      warranty: isKannada
        ? 'ಕ್ಯಾಮೆರಾಗಳು ಮತ್ತು ಹಾರ್ಡ್ ಡಿಸ್ಕ್‌ಗೆ 2 ವರ್ಷಗಳ ಮ್ಯಾನುಫ್ಯಾಕ್ಚರರ್ ವಾರಂಟಿ + 30 ದಿನಗಳ TechBes ಸೇವಾ ಖಾತರಿ.'
        : '2 Years Manufacturer Warranty on Cameras & Hard Drive + 30 Days TechBes Installation Service Warranty.',
    });

    // ────────── TIER 2: RECOMMENDED / SMART COLOR PRO ──────────
    const proCam = findMat(/HIK-2MP-COLORVU/i, 'ColorVu') || findMat(/HIK-4MP-COLORVU-IP/i, 'Hikvision');
    const proDvr = count > 4 ? findMat(/CP-PLUS-DVR-8CH/i, 'DVR') : findMat(/CP-PLUS-DVR-4CH/i, 'DVR');
    const proHdd = findMat(/HDD-SURV-2TB/i, '2TB') || findMat(/HDD-SURV-1TB/i, '1TB');
    const proCable = findMat(/CABLE-3PLUS1-MTR/i, '3+1');
    const proRack = findMat(/RACK-4U-WALL/i, 'Rack');

    const proItems = [];
    if (proCam) proItems.push({ item: proCam, quantity: count, role: 'camera' });
    if (proDvr) proItems.push({ item: proDvr, quantity: 1, role: 'recorder' });
    if (proHdd) proItems.push({ item: proHdd, quantity: 1, role: 'storage' });
    if (proCable) proItems.push({ item: proCable, quantity: totalCableMeters, role: 'cabling' });
    if (junctionBox) proItems.push({ item: junctionBox, quantity: count, role: 'accessory' });
    if (smps) proItems.push({ item: smps, quantity: 1, role: 'power' });
    if (proRack) proItems.push({ item: proRack, quantity: 1, role: 'rack' });

    let proCalc = null;
    try {
      proCalc = await inventoryService.calculateDynamicQuotePricing({
        serviceCategory: 'CCTV',
        items: proItems.map(b => ({
          productId: b.item._id,
          productName: b.item.name,
          quantity: b.quantity,
          sku: b.item.sku,
        })),
        appliedRules: [
          ...(installRule ? [{ ruleId: installRule._id, quantity: count }] : []),
          ...(dvrSetupRule ? [{ ruleId: dvrSetupRule._id, quantity: 1 }] : []),
          ...(findPricingRule(/SRV-RACK-MOUNT/i) ? [{ ruleId: findPricingRule(/SRV-RACK-MOUNT/i)._id, quantity: 1 }] : []),
        ],
      });
    } catch (e) {
      console.warn('[AI Recommendation] Pro pricing calculation error:', e.message);
    }

    packages.push({
      id: 'recommended-smart-color',
      tier: 'Recommended',
      badge: isKannada ? '★ ಜನಪ್ರಿಯ ಮತ್ತು ಅತ್ಯುತ್ತಮ ಆಯ್ಕೆ (Recommended)' : '★ Most Popular & Best Value',
      title: isKannada
        ? `${count}-ಕ್ಯಾಮೆರಾ 24/7 ಸ್ಮಾರ್ಟ್ ಕಲರ್ ಪ್ರೊ ಸಿಸ್ಟಮ್`
        : `${count}-Camera 24/7 Smart Color Pro System`,
      tagline: isKannada
        ? 'ಹಗಲು-ರಾತ್ರಿ ಪೂರ್ಣ ಬಣ್ಣದ ಸ್ಪಷ್ಟ ವೀಡಿಯೊ, 2TB ಸ್ಟೋರೇಜ್ ಮತ್ತು ಲಾಕ್ ಮಾಡಲಾದ ವಾಲ್ ರ್‍ಯಾಕ್.'
        : 'Crystal-clear full-color video day & night, 2TB storage, with locked rack enclosure.',
      cameraCount: count,
      cameraType: isKannada
        ? 'Hikvision ColorVu ಪೂರ್ಣ-ಸಮಯದ ಬಣ್ಣದ ನೈಟ್ ವಿಷನ್'
        : 'Hikvision ColorVu Full-Time Color Night Vision',
      brand: 'Hikvision',
      recorder: count > 4 ? '8-Channel Digital Surveillance Hub' : '4-Channel Digital Surveillance Hub',
      storage: isKannada
        ? '2TB WD Purple 24/7 ಕಣ್ಗಾವಲು ಹಾರ್ಡ್ ಡಿಸ್ಕ್ (~25-30 ದಿನಗಳ ರೆಕಾರ್ಡಿಂಗ್)'
        : '2TB WD Purple 24/7 Surveillance Hard Drive (~25-30 Days Recording)',
      isPopular: true,
      items: proItems.map(b => ({
        productId: b.item._id,
        productName: b.item.name,
        brand: b.item.brand,
        sku: b.item.sku,
        variant: b.item.variant,
        unit: b.item.unit,
        unitPrice: b.item.basePrice || b.item.price,
        quantity: b.quantity,
        gstRate: b.item.gstRate || 18,
        availableStock: b.item.stock,
        inStock: b.item.stock >= b.quantity,
      })),
      pricing: proCalc ? {
        itemsSubtotal: proCalc.pricingBreakdown.itemsSubtotal,
        labourCharge: proCalc.pricingBreakdown.labourCharge,
        serviceCharge: proCalc.pricingBreakdown.serviceCharge,
        subtotal: proCalc.subtotal,
        gstRate: proCalc.gstRate,
        gstAmount: proCalc.gstAmount,
        finalAmount: proCalc.finalAmount,
        priceDisplay: `₹${proCalc.finalAmount.toLocaleString('en-IN')}`,
        hasAuthoritativePricing: true,
      } : {
        finalAmount: null,
        priceDisplay: isKannada ? 'ಕೊಟೇಶನ್ ಅಗತ್ಯವಿದೆ' : 'Quotation required',
        hasAuthoritativePricing: false,
      },
      features: isKannada ? [
        '24/7 ಪೂರ್ಣ ಬಣ್ಣದ ದಿನ ಮತ್ತು ರಾತ್ರಿಯ ವೀಡಿಯೊ (ಕತ್ತಲಲ್ಲೂ ಬಣ್ಣದ ದೃಶ್ಯ)',
        'F1.0 ಸೂಪರ್ ಅಪರ್ಚರ್ ಲೆನ್ಸ್ ಮತ್ತು ವಾರ್ಮ್ ವೈಟ್ ಲೈಟ್',
        '2TB ವಿಸ್ತೃತ ರೆಕಾರ್ಡಿಂಗ್ ಸಂಗ್ರಹ (25 ರಿಂದ 30 ನಿರಂತರ ದಿನಗಳು)',
        '4U ಲಾಕ್ ಮಾಡಲಾದ ಗೋಡೆ ರ್‍ಯಾಕ್ (DVR ಮತ್ತು ರೂಟರ್ ರಕ್ಷಣೆ)',
        'ಚಲನೆ ಪತ್ತೆ ಮತ್ತು ತ್ವರಿತ ಮೊಬೈಲ್ ಲೈವ್ ವೀಕ್ಷಣೆ',
      ] : [
        '24/7 Full Color Day & Night Imaging (No black & white darkness)',
        'F1.0 Super Aperture Lens with Warm White Assist Light',
        '2TB Extended Archive (25 to 30 continuous recording days)',
        '4U Locked Wall Rack protects DVR & Router from tampering',
        'Instant Motion Alerts & WhatsApp Alert Integration Support',
      ],
      assumptions: isKannada ? [
        `ಪ್ರತಿ ಕ್ಯಾಮೆರಾಗೆ ${cablePerCam} ಮೀಟರ್‌ವರೆಗೆ ಉತ್ತಮ ಗುಣಮಟ್ಟದ 3+1 ತಾಮ್ರದ ಕೇಬಲ್ ಒಳಗೊಂಡಿದೆ.`,
        '4U ವಾಲ್ ರ್‍ಯಾಕ್ ಜೋಡಣೆ, ವೈರಿಂಗ್ ಡ್ರೆಸ್ಸಿಂಗ್ ಮತ್ತು ಫಿನಿಶಿಂಗ್ ಒಳಗೊಂಡಿದೆ.',
        'ಅಂತಿಮ ಕೇಬಲ್ ಉದ್ದವನ್ನು ಸೈಟ್ ಪರಿಶೀಲನೆಯಲ್ಲಿ ದೃಢೀಕರಿಸಲಾಗುತ್ತದೆ.',
      ] : [
        `Includes up to ${cablePerCam}m high-grade 3+1 solid copper cabling per camera.`,
        'Includes 4U wall rack mounting, dressing, and clean conduit termination.',
        'Final cable length finalized on site survey.',
      ],
      warranty: isKannada
        ? 'ಕ್ಯಾಮೆರಾಗಳಿಗೆ 2 ವರ್ಷಗಳ ವಾರಂಟಿ + 3 ವರ್ಷಗಳ HDD ವಾರಂಟಿ + 30 ದಿನಗಳ TechBes ಸೇವಾ ಗ್ಯಾರಂಟಿ.'
        : '2 Years Manufacturer Warranty + 3 Years HDD Warranty + 30 Days TechBes Workmanship Guarantee.',
    });

    // ────────── TIER 3: PREMIUM / 4K AI POE ENTERPRISE ──────────
    const premCam = findMat(/HIK-4MP-COLORVU-IP/i, '4MP IP') || findMat(/SEC-5MP-AUDIO-IP/i, 'Secureye');
    const premNvr = count > 4 ? findMat(/HIK-NVR-8CH-POE/i, 'NVR') : findMat(/HIK-NVR-4CH-POE/i, 'NVR');
    const premHdd = findMat(/HDD-SURV-2TB/i, '2TB') || findMat(/HDD-SURV-4TB/i, '4TB');
    const premCable = findMat(/CABLE-CAT6-MTR/i, 'Cat6');

    const premItems = [];
    if (premCam) premItems.push({ item: premCam, quantity: count, role: 'camera' });
    if (premNvr) premItems.push({ item: premNvr, quantity: 1, role: 'recorder' });
    if (premHdd) premItems.push({ item: premHdd, quantity: 1, role: 'storage' });
    if (premCable) premItems.push({ item: premCable, quantity: totalCableMeters, role: 'cabling' });
    if (junctionBox) premItems.push({ item: junctionBox, quantity: count, role: 'accessory' });
    if (proRack) premItems.push({ item: proRack, quantity: 1, role: 'rack' });

    let premCalc = null;
    try {
      premCalc = await inventoryService.calculateDynamicQuotePricing({
        serviceCategory: 'CCTV',
        items: premItems.map(b => ({
          productId: b.item._id,
          productName: b.item.name,
          quantity: b.quantity,
          sku: b.item.sku,
        })),
        appliedRules: [
          ...(installRule ? [{ ruleId: installRule._id, quantity: count }] : []),
          ...(dvrSetupRule ? [{ ruleId: dvrSetupRule._id, quantity: 1 }] : []),
          ...(findPricingRule(/SRV-RACK-MOUNT/i) ? [{ ruleId: findPricingRule(/SRV-RACK-MOUNT/i)._id, quantity: 1 }] : []),
        ],
      });
    } catch (e) {
      console.warn('[AI Recommendation] Premium pricing calculation error:', e.message);
    }

    packages.push({
      id: 'premium-4k-poe',
      tier: 'Premium',
      badge: isKannada ? '4K ಅಲ್ಟ್ರಾ HD & AI ಡಿಟೆಕ್ಷನ್ (Premium)' : '4K Ultra HD & AI Detection',
      title: isKannada
        ? `${count}-ಕ್ಯಾಮೆರಾ 4K PoE AI ನೆಟ್‌ವರ್ಕ್ ಸಿಸ್ಟಮ್`
        : `${count}-Camera 4K PoE AI Network System`,
      tagline: isKannada
        ? '4K ರೆಸಲ್ಯೂಶನ್, ಆಡಿಯೋ ರೆಕಾರ್ಡಿಂಗ್ ಮತ್ತು AI ಡಿಟೆಕ್ಷನ್ ಹೊಂದಿರುವ ಅತ್ಯುತ್ತಮ IP ಭದ್ರತೆ.'
        : 'Top-of-the-line IP surveillance with 4K resolution, audio recording, and PoE simplicity.',
      cameraCount: count,
      cameraType: isKannada
        ? 'Hikvision / Secureye 4MP / 5MP AI ನೆಟ್‌ವರ್ಕ್ IP ಕ್ಯಾಮೆರಾಗಳು'
        : 'Hikvision / Secureye 4MP / 5MP AI Network IP Cameras',
      brand: 'Hikvision',
      recorder: count > 4 ? 'Hikvision 8-Channel 4K PoE NVR' : 'Hikvision 4-Channel 4K PoE NVR',
      storage: isKannada
        ? '2TB / 4TB ಅಲ್ಟ್ರಾ ಕಣ್ಗಾವಲು ಸ್ಟೋರೇಜ್ ಮತ್ತು ಸ್ಮಾರ್ಟ್ ಸರ್ಚ್'
        : '2TB / 4TB Surveillance Storage with Smart Search',
      isPopular: false,
      items: premItems.map(b => ({
        productId: b.item._id,
        productName: b.item.name,
        brand: b.item.brand,
        sku: b.item.sku,
        variant: b.item.variant,
        unit: b.item.unit,
        unitPrice: b.item.basePrice || b.item.price,
        quantity: b.quantity,
        gstRate: b.item.gstRate || 18,
        availableStock: b.item.stock,
        inStock: b.item.stock >= b.quantity,
      })),
      pricing: premCalc ? {
        itemsSubtotal: premCalc.pricingBreakdown.itemsSubtotal,
        labourCharge: premCalc.pricingBreakdown.labourCharge,
        serviceCharge: premCalc.pricingBreakdown.serviceCharge,
        subtotal: premCalc.subtotal,
        gstRate: premCalc.gstRate,
        gstAmount: premCalc.gstAmount,
        finalAmount: premCalc.finalAmount,
        priceDisplay: `₹${premCalc.finalAmount.toLocaleString('en-IN')}`,
        hasAuthoritativePricing: true,
      } : {
        finalAmount: null,
        priceDisplay: isKannada ? 'ಕೊಟೇಶನ್ ಅಗತ್ಯವಿದೆ' : 'Quotation required',
        hasAuthoritativePricing: false,
      },
      features: isKannada ? [
        '4MP 2K+ / 4K ಅಲ್ಟ್ರಾ ಹೈ-ಡೆಫಿನಿಷನ್ ವೀಡಿಯೊ ಸ್ಪಷ್ಟತೆ',
        'ಸಿಂಗಲ್-ಕೇಬಲ್ PoE ಸೆಟಪ್ (Cat6 ಕೇಬಲ್ ಮೂಲಕವೇ ಪವರ್ ಮತ್ತು ಡೇಟಾ)',
        'ಸಿಂಕ್ರೊನೈಸ್ ಮಾಡಿದ ಆಡಿಯೋ ರೆಕಾರ್ಡಿಂಗ್‌ಗಾಗಿ ಇನ್‌ಬಿಲ್ಟ್ ಮೈಕ್ರೊಫೋನ್',
        'AI ಮಾನವ ಮತ್ತು ವಾಹನ ಗುರುತಿಸುವಿಕೆ (ಮಳೆ/ಎಲೆಗಳಿಂದ ತಪ್ಪು ಅಲಾರಾಂ ತಪ್ಪಿಸುತ್ತದೆ)',
        'ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಲಾದ ಕ್ಲೌಡ್ ರಿಮೋಟ್ ಆಕ್ಸೆಸ್',
      ] : [
        '4MP 2K+ / 4K Ultra High Definition Optical Clarity',
        'Single-Cable PoE Setup (Power and Gigabit Data over Cat6 cable)',
        'Built-in Microphone for Synchronized Audio Recording',
        'AI Human and Vehicle Motion Classification (Filters out rain/leaves)',
        'Encrypted Cloud Remote Access with Multi-User Permissions',
      ],
      assumptions: isKannada ? [
        `ಪ್ರತಿ IP ಕ್ಯಾಮೆರಾ ಪಾಯಿಂಟ್‌ಗೆ ${cablePerCam} ಮೀಟರ್‌ವರೆಗೆ ಸಾಲಿಡ್ ಕಾಪರ್ Cat6 ಕೇಬಲ್ ಒಳಗೊಂಡಿದೆ.`,
        'ಪ್ಲಗ್ & ಪ್ಲೇ PoE - ಪ್ರತ್ಯೇಕ ಪವರ್ ಅಡಾಪ್ಟರ್‌ಗಳ ಅವಶ್ಯಕತೆಯಿಲ್ಲ.',
        '4U ಲಾಕ್ ಮಾಡಬಹುದಾದ ಕ್ಯಾಬಿನೆಟ್ ಮತ್ತು ನೆಟ್‌ವರ್ಕ್ ಸ್ವಿಚ್ ಇಂಟಿಗ್ರೇಷನ್ ಒಳಗೊಂಡಿದೆ.',
      ] : [
        `Includes up to ${cablePerCam}m solid copper Cat6 UTP cabling per IP camera point.`,
        'Plug & Play PoE eliminates messy individual power adapters.',
        'Includes 4U lockable equipment cabinet & network switch integration.',
      ],
      warranty: isKannada
        ? 'ಕ್ಯಾಮೆರಾಗಳಿಗೆ 2 ವರ್ಷಗಳ ವಾರಂಟಿ + 3 ವರ್ಷಗಳ HDD ವಾರಂಟಿ + 30 ದಿನಗಳ TechBes ಸೇವಾ ಖಾತರಿ.'
        : '2 Years Manufacturer Warranty + 3 Years HDD Warranty + 30 Days TechBes Workmanship Guarantee.',
    });
  } else if (category === 'Networking') {
    // ────────── NETWORKING PACKAGES ──────────
    const ap = findMat(/NET-AP-WIFI6/i, 'Access Point');
    const sw8 = findMat(/NET-SW-8PORT-GIGA/i, 'Switch');
    const netCable = findMat(/CABLE-CAT6-MTR/i, 'Cat6');
    const lanRule = findPricingRule(/SRV-LAN-POINT/i);

    const netItems1 = [];
    if (ap) netItems1.push({ item: ap, quantity: 2, role: 'ap' });
    if (sw8) netItems1.push({ item: sw8, quantity: 1, role: 'switch' });
    if (netCable) netItems1.push({ item: netCable, quantity: 100, role: 'cabling' });

    let netCalc1 = null;
    try {
      netCalc1 = await inventoryService.calculateDynamicQuotePricing({
        serviceCategory: 'Networking',
        items: netItems1.map(b => ({
          productId: b.item._id,
          productName: b.item.name,
          quantity: b.quantity,
          sku: b.item.sku,
        })),
        appliedRules: lanRule ? [{ ruleId: lanRule._id, quantity: 4 }] : [],
      });
    } catch (e) {
      console.warn('[AI Recommendation] Networking pricing error:', e.message);
    }

    packages.push({
      id: 'net-dual-wifi6',
      tier: 'Recommended',
      badge: isKannada ? '★ ತಡೆರಹಿತ Wi-Fi 6 ಮೆಶ್' : '★ Seamless Wi-Fi 6 Mesh',
      title: isKannada
        ? 'ಹೈ-ಸ್ಪೀಡ್ ಡ್ಯುಯಲ್-ಬ್ಯಾಂಡ್ Wi-Fi 6 ಸೆಟಪ್'
        : 'High-Speed Dual-Band Wi-Fi 6 Setup',
      tagline: isKannada
        ? 'ಬಹುಮಹಡಿ ಮನೆ ಅಥವಾ ಆಫೀಸ್‌ಗಳಲ್ಲಿ ಡೆಡ್ ಝೋನ್ ಇಲ್ಲದೆ ಗಿಗಾಬಿಟ್ ಮೆಶ್ ರೋಮಿಂಗ್.'
        : 'Eliminate dead zones across multi-floor villas or offices with gigabit mesh roaming.',
      cameraCount: 2,
      cameraType: isKannada
        ? '2 x ಸೀಲಿಂಗ್ / ವಾಲ್ ಮೌಂಟ್ Wi-Fi 6 ಆಕ್ಸೆಸ್ ಪಾಯಿಂಟ್‌ಗಳು'
        : '2 x Ceiling / Wall Mount Wi-Fi 6 Access Points',
      brand: 'TP-Link Omada',
      recorder: isKannada ? '8-Port ಗಿಗಾಬಿಟ್ ಸ್ವಿಚ್ + ರೂಟರ್ ಇಂಟಿಗ್ರೇಷನ್' : '8-Port Gigabit Switch + Router Integration',
      storage: 'Gigabit Bandwidth QoS Optimization',
      isPopular: true,
      items: netItems1.map(b => ({
        productId: b.item._id,
        productName: b.item.name,
        brand: b.item.brand,
        sku: b.item.sku,
        variant: b.item.variant,
        unit: b.item.unit,
        unitPrice: b.item.basePrice || b.item.price,
        quantity: b.quantity,
        gstRate: b.item.gstRate || 18,
        availableStock: b.item.stock,
        inStock: b.item.stock >= b.quantity,
      })),
      pricing: netCalc1 ? {
        itemsSubtotal: netCalc1.pricingBreakdown.itemsSubtotal,
        labourCharge: netCalc1.pricingBreakdown.labourCharge,
        serviceCharge: netCalc1.pricingBreakdown.serviceCharge,
        subtotal: netCalc1.subtotal,
        gstRate: netCalc1.gstRate,
        gstAmount: netCalc1.gstAmount,
        finalAmount: netCalc1.finalAmount,
        priceDisplay: `₹${netCalc1.finalAmount.toLocaleString('en-IN')}`,
        hasAuthoritativePricing: true,
      } : {
        finalAmount: null,
        priceDisplay: isKannada ? 'ಕೊಟೇಶನ್ ಅಗತ್ಯವಿದೆ' : 'Quotation required',
        hasAuthoritativePricing: false,
      },
      features: isKannada ? [
        'AX1800 ಡ್ಯುಯಲ್-ಬ್ಯಾಂಡ್ Wi-Fi 6 ವೇಗ (1.8 Gbps ವರೆಗೆ)',
        'ಮಹಡಿಗಳ ನಡುವೆ ಸಿಗ್ನಲ್ ಕಡಿತವಿಲ್ಲದೆ ತಡೆರಹಿತ ರೋಮಿಂಗ್',
        'ಸುರಕ್ಷತೆಗಾಗಿ ಪ್ರತ್ಯೇಕ ಅತಿಥಿ (Guest) ನೆಟ್‌ವರ್ಕ್',
        'PoE ಪವರ್ಡ್ (ಸೀಲಿಂಗ್ ಬಳಿ ಪ್ರತ್ಯೇಕ ಅಡಾಪ್ಟರ್ ಅಗತ್ಯವಿಲ್ಲ)',
      ] : [
        'AX1800 Dual-Band Wi-Fi 6 Speeds (up to 1.8 Gbps combined)',
        'Seamless Roaming between floors without signal drop',
        'Multi-SSID with isolated Guest Network for security',
        'PoE Powered (no clumsy power adapter near ceilings)',
      ],
      assumptions: isKannada ? [
        '100 ಮೀಟರ್‌ವರೆಗೆ Cat6 ತಾಮ್ರದ ಕೇಬಲ್ & 4 ಟರ್ಮಿನೇಷನ್ ಪಾಯಿಂಟ್‌ಗಳು ಒಳಗೊಂಡಿದೆ.',
        'ಎಲ್ಲಾ ISPಗಳೊಂದಿಗೆ ಹೊಂದಿಕೊಳ್ಳುತ್ತದೆ (Airtel, ACT, JioFiber, Tata Play).',
      ] : [
        'Includes up to 100m Cat6 solid copper cabling & 4 termination points.',
        'Compatible with all ISPs (Airtel Xstream, ACT Fibernet, JioFiber, Tata Play).',
      ],
      warranty: isKannada
        ? '3 ವರ್ಷಗಳ ಮ್ಯಾನುಫ್ಯಾಕ್ಚರರ್ ವಾರಂಟಿ + 30 ದಿನಗಳ ಸೇವಾ ಖಾತರಿ.'
        : '3 Years Manufacturer Warranty + 30 Days Service Guarantee.',
    });
  }

  return packages;
}

/**
 * Generate clarifying interactive quick-reply chips with multi-language support (English, Tamil, Kannada).
 */
function generateClarificationQuestions(parsed, langStyle = 'english') {
  const isKannada = langStyle === 'kannada' || langStyle === 'kanglish';
  const isTamil = langStyle === 'tamil' || langStyle === 'tanglish';

  if (isKannada) {
    return [
      {
        id: 'property_type',
        title: 'ಆವರಣದ ಪ್ರಕಾರ (Premises)',
        question: 'ಅನುಸ್ಥಾಪನೆ ಎಲ್ಲಿ ಮಾಡಬೇಕು?',
        options: [
          { label: '🏠 ಸ್ವಂತ ಮನೆ / ವಿಲ್ಲಾ (Home)', value: 'Home / Villa' },
          { label: '🏢 ಅಪಾರ್ಟ್‌ಮೆಂಟ್ / ಫ್ಲಾಟ್ (Flat)', value: 'Apartment / Flat' },
          { label: '🛍️ ಚಿಲ್ಲರೆ ಅಂಗಡಿ / ಶೋರೂಮ್ (Shop)', value: 'Retail Shop' },
          { label: '💼 ಆಫೀಸ್ / ಕಚೇರಿ (Office)', value: 'Commercial Office' },
          { label: '🏭 ಗೋದಾಮು (Warehouse)', value: 'Warehouse / Godown' },
        ],
      },
      {
        id: 'camera_count',
        title: 'ಕ್ಯಾಮೆರಾ ಅಗತ್ಯತೆ',
        question: 'ನಿಮಗೆ ಎಷ್ಟು ಕ್ಯಾಮೆರಾಗಳು ಬೇಕಾಗಬಹುದು?',
        options: [
          { label: '2 ಕ್ಯಾಮೆರಾಗಳು (ಮುಖ್ಯ ಗೇಟ್ + ಪ್ರವೇಶ ದ್ವಾರ)', value: '2 Cameras' },
          { label: '4 ಕ್ಯಾಮೆರಾಗಳು (ಮನೆಯ ಸಾಮಾನ್ಯ ಕವರೇಜ್)', value: '4 Cameras' },
          { label: '6 - 8 ಕ್ಯಾಮೆರಾಗಳು (ಬಹುಮಹಡಿ ಮನೆ / ಆಫೀಸ್)', value: '8 Cameras' },
          { label: '❓ ಖಚಿತವಿಲ್ಲ - ಅಂದಾಜು ಮಾಡಲು ಸಹಾಯ ಮಾಡಿ', value: 'Help me estimate' },
        ],
      },
      {
        id: 'vision_type',
        title: 'ನೈಟ್ ವಿಷನ್ ತಂತ್ರಜ್ಞಾನ',
        question: 'ನಿಮಗೆ ಯಾವ ರೀತಿಯ ನೈಟ್ ರೆಕಾರ್ಡಿಂಗ್ ಬೇಕು?',
        options: [
          { label: '🌟 24/7 ಕಲರ್ ನೈಟ್ ವಿಷನ್ (ಶಿಫಾರಸು ಮಾಡಲಾಗಿದೆ)', value: 'Color Night Vision' },
          { label: '🌑 ಸಾಮಾನ್ಯ ಇನ್‌ಫ್ರಾರೆಡ್ (ಕಪ್ಪು-ಬಿಳುಪು ನೈಟ್ ವಿಷನ್)', value: 'Standard IR' },
          { label: '🎙️ 4K ಅಲ್ಟ್ರಾ HD + ಆಡಿಯೋ', value: '4K AI Audio' },
        ],
      },
    ];
  }

  if (isTamil) {
    return [
      {
        id: 'property_type',
        title: 'Premises Type',
        question: 'எந்த இடத்திற்கு CCTV தேவை?',
        options: [
          { label: '🏠 சொந்த வீடு / வில்லா (Home)', value: 'Home / Villa' },
          { label: '🏢 அபார்ட்மெண்ட் (Flat)', value: 'Apartment / Flat' },
          { label: '🛍️ கடை / ஷோரூம் (Shop)', value: 'Retail Shop' },
          { label: '💼 அலுவலகம் / ஆபிஸ் (Office)', value: 'Commercial Office' },
          { label: '🏭 குடோன் (Warehouse)', value: 'Warehouse / Godown' },
        ],
      },
      {
        id: 'camera_count',
        title: 'கேமரா எண்ணிக்கை',
        question: 'எத்தனை கேமராக்கள் தேவைப்படலாம்?',
        options: [
          { label: '2 கேமராக்கள் (மெயின் கேட் + வாசல்)', value: '2 Cameras' },
          { label: '4 கேமராக்கள் (வீட்டின் முழு பாதுகாப்பு)', value: '4 Cameras' },
          { label: '6 - 8 கேமராக்கள் (பெரிய வீடு / ஆபிஸ்)', value: '8 Cameras' },
          { label: '❓ தெரியாது - நீங்களே கணக்கிடுங்கள்', value: 'Help me estimate' },
        ],
      },
      {
        id: 'vision_type',
        title: 'நைட் விஷன் வசதி',
        question: 'எந்த வகை நைட் விஷன் தேவை?',
        options: [
          { label: '🌟 24/7 கலர் நைட் விஷன் (பரிந்துரைக்கப்படுவது)', value: 'Color Night Vision' },
          { label: '🌑 சாதாரண அகச்சிவப்பு (B&W)', value: 'Standard IR' },
          { label: '🎙️ 4K அல்ட்ரா HD + ஆடியோ', value: '4K AI Audio' },
        ],
      },
    ];
  }

  return [
    {
      id: 'property_type',
      title: 'Premises Type',
      question: 'Where will this installation take place?',
      options: [
        { label: '🏠 Independent Home / Villa', value: 'Home / Villa' },
        { label: '🏢 Apartment / Flat', value: 'Apartment / Flat' },
        { label: '🛍️ Retail Shop / Showroom', value: 'Retail Shop' },
        { label: '💼 Commercial Office', value: 'Commercial Office' },
        { label: '🏭 Warehouse / Godown', value: 'Warehouse / Godown' },
      ],
    },
    {
      id: 'camera_count',
      title: 'Camera Requirement',
      question: 'How many cameras do you estimate needing?',
      options: [
        { label: '2 Cameras (Front Gate + Main Door)', value: '2 Cameras' },
        { label: '4 Cameras (Standard Home / Shop Coverage)', value: '4 Cameras' },
        { label: '6 - 8 Cameras (Multi-Floor Villa / Office)', value: '8 Cameras' },
        { label: '❓ Not sure - Help me estimate based on site', value: 'Help me estimate' },
      ],
    },
    {
      id: 'vision_type',
      title: 'Night Vision Technology',
      question: 'What type of night recording do you prefer?',
      options: [
        { label: '🌟 24/7 Color Night Vision (Recommended)', value: 'Color Night Vision' },
        { label: '🌑 Standard Infrared (B&W Night)', value: 'Standard IR' },
        { label: '🎙️ 4K Ultra HD + Audio Talkback', value: '4K AI Audio' },
      ],
    },
  ];
}

/**
 * Generate natural language assistant reply in Kannada, Tamil, or English.
 */
function generateAssistantReply({
  langStyle = 'english',
  category = 'CCTV',
  propertyType = 'Home / Villa',
  cameraCount = 4,
  isEstimated = false,
  recommendations = [],
}) {
  const bestPackage = recommendations.find(r => r.isPopular) || recommendations[0];

  // Kannada & Kanglish
  if (langStyle === 'kannada' || langStyle === 'kanglish') {
    const countStr = `${cameraCount} ಕ್ಯಾಮೆರಾ${cameraCount > 1 ? 'ಗಳು' : ''}`;
    const priceSnippet = bestPackage && bestPackage.pricing?.priceDisplay
      ? `ಅಂದಾಜು **${bestPackage.pricing.priceDisplay}** ನಿಂದ ಪ್ರಾರಂಭ`
      : 'ವಿವರವಾದ ಕೊಟೇಶನ್ ಜೊತೆಗೆ';

    const propLabel =
      propertyType === 'Home / Villa' ? 'ಮನೆ' :
      propertyType === 'Retail Shop' ? 'ಅಂಗಡಿ' :
      propertyType === 'Commercial Office' ? 'ಆಫೀಸ್' :
      propertyType === 'Apartment / Flat' ? 'ಅಪಾರ್ಟ್‌ಮೆಂಟ್' : propertyType;

    return (
      `ನಮಸ್ಕಾರ! ನಿಮ್ಮ **${propLabel}**-ಗೆ ಸೂಕ್ತವಾದ **${countStr}** CCTV ಸಿಸ್ಟಮ್‌ಗಾಗಿ ನಾನು 2–3 ಪ್ಯಾಕೇಜ್ ಆಯ್ಕೆಗಳನ್ನು ಸಿದ್ಧಪಡಿಸಿದ್ದೇನೆ.\n\n` +
      `💡 **ಶಿಫಾರಸು ಮಾಡಲಾದ ಅತ್ಯುತ್ತಮ ಆಯ್ಕೆ**: **${bestPackage?.title || 'Smart Color Pro'}** (${priceSnippet}). ಇದರಲ್ಲಿ 24/7 ಕಲರ್ ನೈಟ್ ವಿಷನ್, ಮೊಬೈಲ್ ಲೈವ್ ವೀಕ್ಷಣೆ, ಅಧಿಕೃತ CP Plus / Hikvision ಹಾರ್ಡ್‌ವೇರ್ ಮತ್ತು 2 ವರ್ಷಗಳ ವಾರಂಟಿ ಒಳಗೊಂಡಿರುತ್ತದೆ.\n\n` +
      `📌 *ಗಮನಿಸಿ*: ಅಂತಿಮ ಕೇಬಲ್ ಉದ್ದ ಮತ್ತು ಕ್ಯಾಮೆರಾ ಸ್ಥಾನಗಳನ್ನು ನಮ್ಮ ಉಚಿತ ಸೈಟ್ ಭೇಟಿಯ ಸಮಯದಲ್ಲಿ ಅಂತಿಮಗೊಳಿಸಲಾಗುತ್ತದೆ. ನೀವು ಕೆಳಗಿನ ಪ್ಯಾಕೇಜ್ ಆರಿಸಿ ನೇರವಾಗಿ ಕೊಟೇಶನ್ ವಿನಂತಿಯನ್ನು ಸಲ್ಲಿಸಬಹುದು!`
    );
  }

  // Tamil & Tanglish
  if (langStyle === 'tanglish' || langStyle === 'tamil') {
    const countStr = `${cameraCount} camera${cameraCount > 1 ? 's' : ''}`;
    const priceSnippet = bestPackage && bestPackage.pricing?.priceDisplay
      ? `starting from **${bestPackage.pricing.priceDisplay}**`
      : 'with itemized quotation';

    return (
      `Vanakkam! Ungaloda **${propertyType}**-ku thevayana **${countStr}** CCTV setup-ku naan 2–3 suitable configurations ready pannirken.\n\n` +
      `💡 **Recommended Choice**: **${bestPackage?.title || 'Smart Color Pro'}** (${priceSnippet}). Idhula 24/7 Color Night Vision, mobile live viewing, genuine CP Plus / Hikvision hardware, and 2-year warranty include aagum.\n\n` +
      `📌 *Note*: Final cable length and exact camera positions will be confirmed during our free on-site survey. Nee-nga package choose panni direct-ah quotation request submit pannalam!`
    );
  }

  // English
  const countStr = `${cameraCount} camera${cameraCount > 1 ? 's' : ''}`;
  const priceSnippet = bestPackage && bestPackage.pricing?.priceDisplay
    ? `starting from **${bestPackage.pricing.priceDisplay}**`
    : 'with itemized quotation';

  return (
    `Hello! Based on your requirement for **${propertyType}**, I have configured **${countStr}** with 2–3 tailored package tiers below.\n\n` +
    `⭐ **Most Popular Option**: **${bestPackage?.title || 'Smart Color Pro'}** (${priceSnippet}). It includes 24/7 color night vision, mobile app streaming, hard drive storage, and complete professional installation.\n\n` +
    `🔍 *Next Steps*: Select a package below to inspect the genuine item breakdown, customize cameras or storage, or request an official quotation with one click!`
  );
}

/**
 * Controller handler for POST /api/v2/ai/recommend-services
 */
async function processServiceRecommendation(req, res, next) {
  try {
    const { messages = [], customerLocale = 'en-IN', serviceCategory = null } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Messages array is required.',
      });
    }

    const latestUserMsg = messages[messages.length - 1]?.content || '';
    const fullTranscript = messages.map(m => m.content).join(' ');

    const langStyle = detectLanguageStyle(latestUserMsg, customerLocale);
    const { category, subcategory } = detectServiceCategory(fullTranscript, serviceCategory);
    const propertyType = detectPropertyType(fullTranscript);
    const floors = extractFloors(fullTranscript);
    const { count: cameraCount, isEstimated } = estimateCameraCount({
      propertyType,
      floors,
      text: fullTranscript,
    });

    const visionPreference = fullTranscript.toLowerCase().includes('color') || fullTranscript.includes('ಬಣ್ಣ')
      ? 'Color Night Vision'
      : fullTranscript.toLowerCase().includes('ir') || fullTranscript.includes('ಇನ್‌ಫ್ರಾರೆಡ್')
      ? 'Standard IR'
      : 'Color Night Vision';

    const audioPreference = fullTranscript.toLowerCase().includes('audio') || fullTranscript.includes('ಆಡಿಯೋ') || fullTranscript.toLowerCase().includes('sound');

    // Generate grounded packages with Kannada / Tamil / English text
    const recommendations = await generateRecommendations({
      category,
      subcategory,
      propertyType,
      cameraCount,
      visionPreference,
      audioPreference,
      cableEstimatePerCam: 25,
      langStyle,
    });

    const clarificationQuestions = generateClarificationQuestions(
      {
        category,
        propertyType,
        cameraCount,
      },
      langStyle
    );

    const reply = generateAssistantReply({
      langStyle,
      category,
      propertyType,
      cameraCount,
      isEstimated,
      recommendations,
    });

    return res.status(200).json({
      success: true,
      data: {
        reply,
        languageStyle: langStyle,
        detectedCategory: category,
        detectedSubcategory: subcategory,
        detectedPropertyType: propertyType,
        estimatedCameraCount: cameraCount,
        isEstimatedCount: isEstimated,
        clarificationQuestions,
        recommendations,
      },
    });
  } catch (err) {
    console.error('❌ [AI Recommendation Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate recommendations.',
      error: err.message,
    });
  }
}

module.exports = {
  detectLanguageStyle,
  detectServiceCategory,
  detectPropertyType,
  extractCameraCount,
  extractFloors,
  estimateCameraCount,
  generateRecommendations,
  generateClarificationQuestions,
  generateAssistantReply,
  processServiceRecommendation,
};
