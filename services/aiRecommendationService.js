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

function normalizeKannadaDigits(text = '') {
  const kannadaDigits = { '೦': '0', '೧': '1', '೨': '2', '೩': '3', '೪': '4', '೫': '5', '೬': '6', '೭': '7', '೮': '8', '೯': '9' };
  return String(text).replace(/[೦-೯]/g, d => kannadaDigits[d] || d);
}

/**
 * Strip property scale / modifiers (floors, BHK, area, currency, time) so they are
 * never misidentified as camera counts.
 */
function sanitizeForCameraCount(text = '') {
  let s = String(text).toLowerCase();
  // Remove floor references: "2-floor", "2 floors", "g+1", "2nd floor", etc.
  s = s.replace(/\bg\s*\+\s*\d+\b/gi, ' ');
  s = s.replace(/(\d+)\s*(?:-|st|nd|rd|th)?\s*(?:floor|floors|storey|storeys|story|stories|maadi|mahadi|nilam|nilangal|ಮಹಡಿ|ಅಂತಸ್ತು)\b/gi, ' ');
  // Remove BHK / bedrooms / rooms
  s = s.replace(/(\d+)\s*(?:-|)?\s*(?:bhk|bed|bedroom|bedrooms|room|rooms|kothadi)\b/gi, ' ');
  // Remove area / sqft / dimensions
  s = s.replace(/(\d+)\s*(?:-|)?\s*(?:sqft|sq\.ft|square\s*feet|sqm|sq\s*meters|acre|acres|cent|cents)\b/gi, ' ');
  // Remove currency: ₹ 15000, 15k, 20000 rs, inr 25000
  s = s.replace(/(?:rs\.?|inr|₹)\s*\d+/gi, ' ');
  s = s.replace(/\d+\s*(?:k|lac|lakh|lakhs|crore|crores|rs|inr|rupees)\b/gi, ' ');
  // Remove time: 10am, 2 hours, 30 days
  s = s.replace(/\d+\s*(?:am|pm|year|years|yr|yrs|month|months|day|days|hour|hours|hr|hrs|min|mins|minute|minutes)\b/gi, ' ');
  return s;
}

/**
 * Extract floors from user message (supports hyphenated 2-floor, G+1, duplex, Kannada, Tamil).
 */
function extractFloors(text = '') {
  if (!text) return null;
  const lower = normalizeKannadaDigits(String(text)).toLowerCase();

  // G+1 -> 2 floors, G+2 -> 3 floors
  const gPlusMatch = lower.match(/\bg\s*\+\s*(\d+)\b/);
  if (gPlusMatch && gPlusMatch[1]) {
    return parseInt(gPlusMatch[1], 10) + 1;
  }
  if (/\b(?:ground\s*\+\s*1|ground\s*plus\s*one)\b/.test(lower)) return 2;
  if (/\b(?:ground\s*\+\s*2|ground\s*plus\s*two)\b/.test(lower)) return 3;

  // Hyphenated or spaced floor: 2-floor, 2 floors, 2nd floor, 3 storeys, etc.
  const floorMatch = lower.match(/(\d+)\s*(?:-|st|nd|rd|th)?\s*(?:floor|floors|storey|storeys|story|stories|nilam|nilangal|maadi|mahadi|ಮಹಡಿ|ಅಂತಸ್ತು)\b/i);
  if (floorMatch && floorMatch[1]) {
    return parseInt(floorMatch[1], 10);
  }

  if (lower.includes('duplex') || lower.includes('rendu maadi') || lower.includes('eradu mahadi') || lower.includes('ಎರಡು ಮಹಡಿ')) return 2;
  if (lower.includes('triplex') || lower.includes('moonu maadi') || lower.includes('mooru mahadi') || lower.includes('ಮೂರು ಮಹಡಿ')) return 3;
  if (lower.includes('single floor') || lower.includes('ground floor') || lower.includes('oru maadi') || lower.includes('ಒಂದು ಮಹಡಿ')) return 1;
  return null;
}

/**
 * Extract camera count from text (numeric digits, Kannada numerals, or English/Tamil/Kannada words).
 */
function extractCameraCount(rawText = '') {
  if (!rawText) return null;
  const normalized = normalizeKannadaDigits(rawText);
  const lower = normalized.toLowerCase();

  // 1. Explicit number before "camera" / "cam" / "ಕ್ಯಾಮೆರಾ"
  const numCamRegex = /(\d+)\s*(?:camera|cameras|cam|cams|point|points|ಕ್ಯಾಮೆರಾ|ಕ್ಯಾಮರಾ|ಕ್ಯಾಮೆರಾಗಳು|கேமರಾ|கேமராக்கள்|கேமரா)\b/i;
  const matchNum = lower.match(numCamRegex);
  if (matchNum && matchNum[1]) {
    const n = parseInt(matchNum[1], 10);
    if (n > 0 && n <= 64) return n;
  }

  // 2. Cam before number: "camera 4", "cameras 8", "ಕ್ಯಾಮೆರಾ 4"
  const camNumRegex = /(?:camera|cameras|cam|cams|ಕ್ಯಾಮೆರಾ|ಕ್ಯಾಮರಾ|ಕ್ಯಾಮೆರಾಗಳು|கேமರಾ|கேಮರಾ)\s*(\d+)\b/i;
  const matchCamNum = lower.match(camNumRegex);
  if (matchCamNum && matchCamNum[1]) {
    const n = parseInt(matchCamNum[1], 10);
    if (n > 0 && n <= 64) return n;
  }

  // 3. Direct standalone digit only if message starts with digit and is not a floor/sqft
  const directMatch = lower.trim().match(/^([1-9]|[1-5]\d|64)\b/);
  if (directMatch) {
    const after = lower.trim().substring(directMatch[0].length).trim();
    if (!after.match(/^(?:-|st|nd|rd|th)?\s*(?:floor|floors|storey|storeys|bhk|bed|bedroom|sqft|sq\.ft|rs|inr|meter|mtr)\b/i)) {
      return parseInt(directMatch[1], 10);
    }
  }

  // 4. Word-based numbers across English, Tamil, and Kannada
  const wordMap = {
    // 4 - Kannada & Kanglish (naalku, nalakku, naaku, naalkoo)
    'ನಾಲ್ಕು': 4, 'ನಾಲಕ್ಕು': 4, 'ನಾಕು': 4, 'ನಾಲ್ಕೂ': 4, 'ನಾಲ್ಕ': 4,
    'naalku': 4, 'nalku': 4, 'nalakku': 4, 'naaku': 4,
    // 4 - Tamil & Tanglish
    'நான்கு': 4, 'naalu': 4, 'naalgu': 4,
    // 4 - English
    'four': 4,

    // 1
    'one': 1, 'oru': 1, 'ondu': 1, 'ಒಂದು': 1, 'ஒன்று': 1,
    // 2
    'two': 2, 'rendu': 2, 'eradu': 2, 'ಎರಡು': 2, 'ಎರ್ಡು': 2, 'இரண்டு': 2, 'erdu': 2,
    // 3
    'three': 3, 'moonu': 3, 'mooru': 3, 'ಮೂರು': 3, 'ಮೂರ್': 3, 'மூன்று': 3, 'moor': 3,
    // 5
    'five': 5, 'anju': 5, 'aidu': 5, 'ಐದು': 5, 'ಐದ್': 5, 'ஐந்து': 5, 'aid': 5,
    // 6
    'six': 6, 'aaru': 6, 'ಆರು': 6, 'ஆறு': 6,
    // 7
    'seven': 7, 'yelu': 7, 'ಏಳು': 7, 'elu': 7,
    // 8
    'eight': 8, 'yettu': 8, 'ettu': 8, 'entu': 8, 'ಎಂಟು': 8, 'ಎಟ್ಟು': 8,
    // 9
    'nine': 9, 'onbathu': 9, 'ombattu': 9, 'ಒಂಬತ್ತು': 9,
    // 10
    'ten': 10, 'pathu': 10, 'hattu': 10, 'ಹತ್ತು': 10, 'பத்து': 10,
    // 12
    'twelve': 12, 'panirendu': 12, 'hanneradu': 12, 'ಹನ್ನೆರಡು': 12,
    // 16
    'sixteen': 16, 'hadinaaru': 16, 'ಹದಿನಾರು': 16,
    // 32
    'thirty two': 32, 'thirty-two': 32, 'eppattheradu': 32,
  };

  const sanitized = sanitizeForCameraCount(lower);

  for (const [word, val] of Object.entries(wordMap)) {
    const rx = new RegExp(`(?:^|[\\s,.;!?])${word}(?:[\\s,.;!?]|$)(?:camera|cameras|cam|cams|point|cctv|ಕ್ಯಾಮೆರಾ|ಕ್ಯಾಮರಾ|ಕ್ಯಾಮೆರಾಗಳು)?`, 'i');
    if (rx.test(sanitized)) {
      return val;
    }
  }

  // 5. Standalone digits in sanitized text if in context of camera / security request
  const standalone = sanitized.match(/\b([1-9]|[12]\d|32)\b/);
  if (standalone && (lower.includes('camera') || lower.includes('cam') || lower.includes('cctv') || lower.includes('point') || lower.includes('ಕ್ಯಾಮೆರಾ') || lower.includes('கேமரா') || lower.includes('ಬೇಕಾಗ') || lower.includes('ಬೇಕು'))) {
    const floorNum = extractFloors(rawText);
    const candidate = parseInt(standalone[1], 10);
    if (floorNum && floorNum === candidate) {
      const hasOtherMention = new RegExp(`(?:camera|cam|point|cctv)\\s*${candidate}|${candidate}\\s*(?:camera|cam|point)`, 'i').test(lower);
      if (!hasOtherMention) return null;
    }
    return candidate;
  }

  return null;
}

/**
 * Parse multilingual budget expressions into a numeric cap (₹).
 * Supports English, Tamil/Tanglish, Kannada/Kanglish.
 * Examples: "20k ku ulla", "under 20k", "below 20000", "20,000 budget",
 *           "max 15k", "around 25k", "20 ಸಾವಿರ ಒಳಗೆ", "₹20000 ku ulla kudu"
 */
function extractBudgetMax(text = '') {
  if (!text) return null;
  const lower = normalizeKannadaDigits(String(text)).toLowerCase();

  // Normalise commas in numbers: "20,000" → "20000"
  const cleaned = lower.replace(/(\d),(\d{3})/g, '$1$2');

  // Pattern set — ordered most specific to least specific
  const patterns = [
    // Tamil/Tanglish: "20k ku ulla", "20k ulla", "20,000 ku ulla kudu", "15k ku kudu", "budget 20k"
    /(?:₹|rs\.?|inr)?\s*(\d[\d,]*)\s*(?:k|thousand)?\s*(?:ku\s+)?(?:ulla|ullaye|ulladhu|ku\s*ulla|ku\s*kudu|matten|mela\s*kuda|kulla)\b/i,
    // Kannada/Kanglish: "20 ಸಾವಿರ ಒಳಗೆ", "20k alli", "20000 alli"
    /(\d[\d,]*)\s*(?:k|thousand|ಸಾವಿರ|saavira|savira)?\s*(?:ಒಳಗೆ|olagè|olage|alli\b|alli\s)/i,
    // English: "under 20k", "below ₹20000", "max 15k", "within 25000", "budget of 20k"
    /(?:under|below|max|maximum|within|upto|up\s*to|budget(?:\s*of)?|not\s*more\s*than|less\s*than)\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*)\s*(?:k|thousand|lac|lakh|lakhs)?/i,
    // "around 25k" / "approximately 20k" / "roughly 20k" — treat as soft upper bound
    /(?:around|approx(?:imately)?|roughly|about)\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*)\s*(?:k|thousand|lac|lakh|lakhs)?/i,
    // Bare: "20k budget", "25000 budget", "budget 20000"
    /(?:₹|rs\.?|inr)?\s*(\d[\d,]*)\s*(?:k|thousand|lac|lakh|lakhs)?\s*(?:budget|only|matra|ku)/i,
    /(?:budget)\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*)\s*(?:k|thousand|lac|lakh|lakhs)?/i,
  ];

  for (const pattern of patterns) {
    const m = cleaned.match(pattern);
    if (m) {
      const rawNum = m[1].replace(/,/g, '');
      let amt = parseInt(rawNum, 10);
      if (isNaN(amt) || amt <= 0) continue;

      // Detect multiplier from full match context
      const fullMatch = m[0].toLowerCase();
      if (/\b(k|thousand)\b/.test(fullMatch) || (amt < 500 && !fullMatch.includes('lakh') && !fullMatch.includes('lac'))) {
        // If the number itself is small (< 500) and no lakh keyword → treat as "k"
        if (amt < 500) amt *= 1000;
      } else if (/\b(lac|lakh|lakhs)\b/.test(fullMatch)) {
        amt *= 100000;
      }
      // Sanity: ignore if < ₹2,000 or > ₹50,00,000
      if (amt >= 2000 && amt <= 5000000) return amt;
    }
  }
  return null;
}

/**
 * Identify user preferences (brand, component focus, vision, IP/PoE, 4K, audio, budget cap).
 */
function extractUserPreferences(text = '') {
  const lower = String(text).toLowerCase();

  // 1. Brand preference
  let brand = null;
  if (lower.match(/\b(hikvision|hik|hik-vision)\b/)) {
    brand = 'Hikvision';
  } else if (lower.match(/\b(cp\s*plus|cp-plus|cpplus)\b/)) {
    brand = 'CP Plus';
  } else if (lower.match(/\b(dahua)\b/)) {
    brand = 'Dahua';
  } else if (lower.match(/\b(secureye)\b/)) {
    brand = 'Secureye';
  } else if (lower.match(/\b(d-link|dlink|tp-link|tplink)\b/)) {
    brand = 'TP-Link';
  }

  // 2. Component focus
  let componentFocus = 'full_system'; // 'full_system' | 'camera_only' | 'recorder_only' | 'storage_only'
  if (
    lower.match(/\b(only\s*camera|only\s*cameras|cameras?\s*only|just\s*camera|just\s*cameras|already\s*have\s*(?:dvr|nvr|recorder)|extra\s*camera|additional\s*camera)\b/) ||
    lower.includes('ಕೇವಲ ಕ್ಯಾಮೆರಾ') || lower.includes('ಕ್ಯಾಮೆರಾ ಮಾತ್ರ')
  ) {
    componentFocus = 'camera_only';
  } else if (
    lower.match(/\b(only\s*dvr|only\s*nvr|dvr\s*only|nvr\s*only|replace\s*dvr|recorder\s*only|new\s*dvr)\b/) ||
    lower.includes('ಕೇವಲ dvr') || lower.includes('dvr ಮಾತ್ರ')
  ) {
    componentFocus = 'recorder_only';
  } else if (
    lower.match(/\b(only\s*hdd|only\s*hard\s*disk|hard\s*disk\s*only|hdd\s*only|upgrade\s*storage|upgrade\s*hdd|more\s*storage)\b/) ||
    lower.includes('ಹಾರ್ಡ್ ಡಿಸ್ಕ್ ಮಾತ್ರ')
  ) {
    componentFocus = 'storage_only';
  }

  // 3. Vision Preference
  let visionPreference = 'Color Night Vision';
  if (lower.includes('color') || lower.includes('colorvu') || lower.includes('full color') || lower.includes('ಬಣ್ಣ') || lower.includes('கலர்')) {
    visionPreference = 'Color Night Vision';
  } else if (lower.includes('ir') || lower.includes('infrared') || lower.includes('black and white') || lower.includes('b&w') || lower.includes('ಇನ್‌ಫ್ರಾರೆಡ್')) {
    visionPreference = 'Standard IR';
  }

  // 4. IP / PoE / 4K / Audio
  const isIpOrPoe = lower.match(/\b(ip|poe|cat6|network camera|nvr)\b/) !== null;
  const is4K = lower.match(/\b(4k|ultra hd|4mp|5mp|8mp)\b/) !== null;
  const audioPreference = lower.match(/\b(audio|mic|microphone|sound|talk|voice)\b/) !== null || lower.includes('ಆಡಿಯೋ');

  // 5. Budget Cap — use dedicated multilingual parser
  const budgetCap = extractBudgetMax(text);

  return {
    brand,
    componentFocus,
    visionPreference,
    isIpOrPoe,
    is4K,
    audioPreference,
    budgetCap,
  };
}

/**
 * Decide whether a request is vague / incomplete and needs clarifying questions first.
 * Returns true (→ Phase A) when essential sizing info is missing.
 * Returns false (→ Phase B) when enough context is known.
 */
function isVagueRequest(latestMsg = '', sessionContext = {}) {
  const lower = String(latestMsg).toLowerCase();

  // Explicit "help me plan" / "not sure" phrases → always ask
  if (lower.match(/\b(help\s*me\s*(plan|estimate|choose|decide)|not\s*sure|don'?t\s*know|not\s*know|no\s*idea|any\s*recommendation|suggest\s*me|advise\s*me)\b/) ||
      lower.match(/\b(ethana|evvalo|yevlo|help\s*pannunga|gottilla)\b/)) {
    return true;
  }

  // "Skip" / "just recommend" / quick-select answers → go straight to Phase B
  if (lower.match(/\b(skip|just\s*recommend|show\s*me|give\s*me|any\s*package|show\s*packages|recommend\s*for\s*me)\b/)) {
    return false;
  }

  // If session already has cameraCount AND propertyType → Phase B
  const hasCount = sessionContext.cameraCount != null;
  const hasProp = sessionContext.propertyType != null;
  if (hasCount && hasProp) return false;

  // Check if the CURRENT message itself provides both
  const msgCount = extractCameraCount(latestMsg);
  const msgProp = detectPropertyType(latestMsg);
  // detectPropertyType has a default fallback — only count it if explicitly matched
  const msgHasProp = detectPropertyTypeExplicit(latestMsg);

  if (msgCount && msgHasProp) return false; // "4 cameras for my shop" → Phase B
  if (msgCount && hasProp) return false;    // prev turn had property, now has count
  if (msgHasProp && hasCount) return false; // prev turn had count, now has property

  // Otherwise it's vague
  return true;
}

/**
 * Returns the property type only if explicitly matched in the text (not the default fallback).
 */
function detectPropertyTypeExplicit(text = '') {
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
  return null; // No explicit match
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
    if (parsedFloors === 1) estimated = 3;
    else if (parsedFloors === 2) estimated = 4;
    else estimated = 6;
  } else if (prop === 'Apartment / Flat') {
    estimated = 2;
  } else if (prop === 'Retail Shop') {
    estimated = 4;
  } else if (prop === 'Commercial Office') {
    estimated = Math.max(4, parsedFloors * 3);
  } else if (prop === 'Warehouse / Godown') {
    estimated = 8;
  }

  return { count: estimated, isEstimated: true };
}

/**
 * Main service recommendation generation engine grounded in actual DB records.
 * Supports dynamic live inventory querying, user brand filtering, component-only packages,
 * clean rounding (Math.round), and multi-language presentation.
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
  userPreferences = {},
}) {
  if (process.env.ENABLE_INVENTORY_SEEDING === 'true') {
    await ensureInventorySeeded();
  }

  const isKannada = langStyle === 'kannada' || langStyle === 'kanglish';
  const count = Math.max(1, Math.min(cameraCount || 4, 32));
  const cablePerCam = Math.max(10, Math.min(cableEstimatePerCam || 25, 100));
  const totalCableMeters = count * cablePerCam;

  // Fetch only active, non-archived materials from MongoDB Material collection
  const allMaterials = await Material.find({
    status: 'active',
    isArchived: { $ne: true },
    $or: [{ stock: { $gt: 0 } }, { stock: { $exists: false } }],
  }).lean();

  const allPricing = await PricingConfig.find({
    status: 'active',
  }).lean();

  // Helper to find genuine in-stock material with fallback
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
  const installRule = findPricingRule(/SRV-CAM-FITTING/i);
  const dvrSetupRule = findPricingRule(/SRV-RECORDER-SETUP/i);
  const rackMountRule = findPricingRule(/SRV-RACK-MOUNT/i);

  const targetBrand = userPreferences.brand || null;
  const componentFocus = userPreferences.componentFocus || 'full_system';

  if (category === 'CCTV') {
    // ══════════════════════════════════════════════════════════════════════
    // MODE A: COMPONENT-ONLY EXPANSION (e.g. "Only cameras", "Extra cameras")
    // ══════════════════════════════════════════════════════════════════════
    if (componentFocus === 'camera_only') {
      const basicCam = (targetBrand === 'Hikvision')
        ? (findMat(/HIK-2MP-COLORVU/i, 'ColorVu') || findMat(/HIK-4MP-COLORVU-IP/i, 'Hikvision'))
        : (findMat(/CP-PLUS-2MP-DOME/i, 'CP Plus 2MP') || findMat(/HIK-2MP-COLORVU/i, 'Hikvision'));
      const proCam = findMat(/HIK-2MP-COLORVU/i, 'ColorVu') || findMat(/HIK-4MP-COLORVU-IP/i, 'Hikvision') || basicCam;
      const junctionBox = findMat(/ACC-JUNCTION-BOX/i, 'Junction Box');
      const cable = findMat(/CABLE-3PLUS1-MTR/i, '3+1') || findMat(/CABLE-CAT6-MTR/i, 'Cat6');

      // Package 1: Essential Camera Add-on
      const opt1Items = [];
      if (basicCam) opt1Items.push({ item: basicCam, quantity: count, role: 'camera' });
      if (junctionBox) opt1Items.push({ item: junctionBox, quantity: count, role: 'accessory' });
      if (cable) opt1Items.push({ item: cable, quantity: totalCableMeters, role: 'cabling' });

      let opt1Calc = null;
      try {
        opt1Calc = await inventoryService.calculateDynamicQuotePricing({
          serviceCategory: 'CCTV',
          items: opt1Items.map(b => ({
            productId: b.item._id,
            productName: b.item.name,
            quantity: b.quantity,
            sku: b.item.sku,
          })),
          appliedRules: installRule ? [{ ruleId: installRule._id, quantity: count }] : [],
        });
      } catch (e) {
        console.warn('[AI Recommendation] Camera-only opt1 pricing error:', e.message);
      }

      packages.push({
        id: 'addon-cameras-essential',
        tier: 'Basic',
        badge: isKannada ? 'ಕ್ಯಾಮೆರಾ ವಿಸ್ತರಣೆ (Add-on)' : 'Camera Expansion Kit',
        title: isKannada
          ? `${count}-ಕ್ಯಾಮೆರಾ ಎಸೆನ್ಷಿಯಲ್ ವಿಸ್ತರಣಾ ಕಿಟ್`
          : `${count}-Camera Essential HD Add-on Kit`,
        tagline: isKannada
          ? 'ಪ್ರಸ್ತುತ DVR ಸಿಸ್ಟಮ್‌ಗಾಗಿ ಜಂಕ್ಷನ್ ಬಾಕ್ಸ್ ಮತ್ತು ವೈರಿಂಗ್ ಒಳಗೊಂಡ ಅಧಿಕೃತ ಕ್ಯಾಮೆರಾಗಳು.'
          : 'Genuine HD cameras with weatherproof junction boxes & cabling for your existing DVR.',
        cameraCount: count,
        cameraType: basicCam?.name || 'HD Surveillance Camera',
        brand: basicCam?.brand || 'CP Plus',
        recorder: isKannada ? 'ನಿಮ್ಮ ಪ್ರಸ್ತುತ DVR ಬಳಕೆ' : 'Using your existing DVR / NVR',
        storage: isKannada ? 'ಪ್ರಸ್ತುತ ಸ್ಟೋರೇಜ್ ಬಳಕೆ' : 'Using existing hard drive storage',
        isPopular: false,
        items: opt1Items.map(b => ({
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
        pricing: opt1Calc ? {
          itemsSubtotal: Math.round(opt1Calc.pricingBreakdown.itemsSubtotal),
          labourCharge: Math.round(opt1Calc.pricingBreakdown.labourCharge),
          serviceCharge: Math.round(opt1Calc.pricingBreakdown.serviceCharge),
          subtotal: Math.round(opt1Calc.subtotal),
          gstRate: opt1Calc.gstRate,
          gstAmount: Math.round(opt1Calc.gstAmount),
          finalAmount: Math.round(opt1Calc.finalAmount),
          priceDisplay: `₹${Math.round(opt1Calc.finalAmount).toLocaleString('en-IN')}`,
          hasAuthoritativePricing: true,
        } : {
          finalAmount: null,
          priceDisplay: isKannada ? 'ಕೊಟೇಶನ್ ಅಗತ್ಯವಿದೆ' : 'Quotation required',
          hasAuthoritativePricing: false,
        },
        features: isKannada ? [
          `${count}x 1080P HD ಅಧಿಕೃತ ಕ್ಯಾಮೆರಾಗಳು`,
          'IP66 ಜಲನಿರೋಧಕ ಜಂಕ್ಷನ್ ಬಾಕ್ಸ್ ಜೋಡಣೆ',
          'ಪ್ರಸ್ತುತ DVR ಜೊತೆ ಪೂರ್ಣ ಹೊಂದಾಣಿಕೆ',
          'ಕ್ಯಾಮೆರಾ ಫಿಟ್ಟಿಂಗ್ ಮತ್ತು ಆಂಗಲ್ ಅಡ್ಜಸ್ಟ್‌ಮೆಂಟ್ ಒಳಗೊಂಡಿದೆ',
        ] : [
          `${count}x 1080P Full HD Genuine Cameras`,
          'IP66 Weatherproof junction box mount per camera',
          'Direct compatibility check with your existing DVR/NVR',
          'Professional drilling, wall mounting, and angle calibration',
        ],
        assumptions: isKannada ? [
          `ಪ್ರತಿ ಕ್ಯಾಮೆರಾಗೆ ${cablePerCam} ಮೀಟರ್ ಕೇಬಲ್ ಒಳಗೊಂಡಿದೆ.`,
          'ನಿಮ್ಮ DVR ಪೋರ್ಟ್‌ಗಳು ಲಭ್ಯವಿರಬೇಕು.',
        ] : [
          `Includes up to ${cablePerCam}m cable per camera point.`,
          'Assumes open channels are available on existing recorder.',
        ],
        warranty: isKannada
          ? 'ಕ್ಯಾಮೆರಾಗಳಿಗೆ 2 ವರ್ಷಗಳ ಅಧಿಕೃತ ವಾರಂಟಿ + 30 ದಿನಗಳ TechBes ಸೇವಾ ಗ್ಯಾರಂಟಿ.'
          : '2 Years Manufacturer Warranty + 30 Days TechBes Service Guarantee.',
      });

      // Package 2: ColorVu Pro Camera Add-on
      const opt2Items = [];
      if (proCam) opt2Items.push({ item: proCam, quantity: count, role: 'camera' });
      if (junctionBox) opt2Items.push({ item: junctionBox, quantity: count, role: 'accessory' });
      if (cable) opt2Items.push({ item: cable, quantity: totalCableMeters, role: 'cabling' });

      let opt2Calc = null;
      try {
        opt2Calc = await inventoryService.calculateDynamicQuotePricing({
          serviceCategory: 'CCTV',
          items: opt2Items.map(b => ({
            productId: b.item._id,
            productName: b.item.name,
            quantity: b.quantity,
            sku: b.item.sku,
          })),
          appliedRules: installRule ? [{ ruleId: installRule._id, quantity: count }] : [],
        });
      } catch (e) {
        console.warn('[AI Recommendation] Camera-only opt2 pricing error:', e.message);
      }

      packages.push({
        id: 'addon-cameras-colorvu',
        tier: 'Recommended',
        badge: isKannada ? '★ 24/7 ಕಲರ್ ಅಪ್‌ಗ್ರೇಡ್' : '★ 24/7 Color Night Upgrade',
        title: isKannada
          ? `${count}-ಕ್ಯಾಮೆರಾ ಸ್ಮಾರ್ಟ್ ಕಲರ್‌ವು ವಿಸ್ತರಣಾ ಕಿಟ್`
          : `${count}-Camera ColorVu Pro Add-on Kit`,
        tagline: isKannada
          ? 'ರಾತ್ರಿಯಲ್ಲೂ ಪೂರ್ಣ ಬಣ್ಣದ ದೃಶ್ಯ ನೀಡುವ F1.0 ಸೂಪರ್ ಅಪರ್ಚರ್ ಕ್ಯಾಮೆರಾಗಳು.'
          : 'Full-time color night vision cameras with F1.0 super aperture for night clarity.',
        cameraCount: count,
        cameraType: proCam?.name || 'Hikvision ColorVu Camera',
        brand: proCam?.brand || 'Hikvision',
        recorder: isKannada ? 'ನಿಮ್ಮ ಪ್ರಸ್ತುತ DVR ಬಳಕೆ' : 'Using your existing DVR / NVR',
        storage: isKannada ? 'ಪ್ರಸ್ತುತ ಸ್ಟೋರೇಜ್ ಬಳಕೆ' : 'Using existing hard drive storage',
        isPopular: true,
        items: opt2Items.map(b => ({
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
        pricing: opt2Calc ? {
          itemsSubtotal: Math.round(opt2Calc.pricingBreakdown.itemsSubtotal),
          labourCharge: Math.round(opt2Calc.pricingBreakdown.labourCharge),
          serviceCharge: Math.round(opt2Calc.pricingBreakdown.serviceCharge),
          subtotal: Math.round(opt2Calc.subtotal),
          gstRate: opt2Calc.gstRate,
          gstAmount: Math.round(opt2Calc.gstAmount),
          finalAmount: Math.round(opt2Calc.finalAmount),
          priceDisplay: `₹${Math.round(opt2Calc.finalAmount).toLocaleString('en-IN')}`,
          hasAuthoritativePricing: true,
        } : {
          finalAmount: null,
          priceDisplay: isKannada ? 'ಕೊಟೇಶನ್ ಅಗತ್ಯವಿದೆ' : 'Quotation required',
          hasAuthoritativePricing: false,
        },
        features: isKannada ? [
          '24/7 ಪೂರ್ಣ ಬಣ್ಣದ ನೈಟ್ ವಿಷನ್ (ಕತ್ತಲಲ್ಲೂ ಬಣ್ಣದ ರೆಕಾರ್ಡಿಂಗ್)',
          'F1.0 ವಾರ್ಮ್ ವೈಟ್ ಲೈಟ್ ಅಸಿಸ್ಟ್',
          'IP66 ಜಲನಿರೋಧಕ ಬಾಹ್ಯ ಕವಚ',
          'ಪ್ರಸ್ತುತ DVR ಜೊತೆ ಸುಲಭ ಹೊಂದಾಣಿಕೆ',
        ] : [
          '24/7 Full Color Day & Night Vision (no B&W darkness)',
          'F1.0 Super Aperture Lens with Warm White LED assist',
          'IP66 Weatherproof outdoor construction',
          'Seamless connection to existing surveillance DVR',
        ],
        assumptions: isKannada ? [
          `ಪ್ರತಿ ಕ್ಯಾಮೆರಾಗೆ ${cablePerCam} ಮೀಟರ್ ಕೇಬಲ್ ಮತ್ತು ಫಿಟ್ಟಿಂಗ್ ಒಳಗೊಂಡಿದೆ.`,
        ] : [
          `Includes up to ${cablePerCam}m solid copper cable per camera point and mountings.`,
        ],
        warranty: isKannada
          ? 'ಕ್ಯಾಮೆರಾಗಳಿಗೆ 2 ವರ್ಷಗಳ ವಾರಂಟಿ + 30 ದಿನಗಳ TechBes ಸೇವಾ ಖಾತರಿ.'
          : '2 Years Manufacturer Warranty + 30 Days TechBes Workmanship Guarantee.',
      });

      return packages;
    }

    // ══════════════════════════════════════════════════════════════════════
    // MODE B: FULL CCTV INSTALLATION PACKAGES (TIER 1, TIER 2, TIER 3)
    // ══════════════════════════════════════════════════════════════════════

    // ────────── TIER 1: BASIC / ESSENTIAL HD PACKAGE ──────────
    const basicCam = (targetBrand === 'Hikvision')
      ? (findMat(/HIK-2MP-COLORVU/i, 'ColorVu') || findMat(/HIK-4MP-COLORVU-IP/i, 'Hikvision'))
      : (findMat(/CP-PLUS-2MP-DOME/i, 'CP Plus 2MP') || findMat(/HIK-2MP-COLORVU/i, 'Hikvision'));

    const basicDvr = (targetBrand === 'Hikvision')
      ? (count > 4 ? (findMat(/HIK-NVR-8CH-POE/i, 'NVR') || findMat(/CP-PLUS-DVR-8CH/i, 'DVR')) : (findMat(/HIK-NVR-4CH-POE/i, 'NVR') || findMat(/CP-PLUS-DVR-4CH/i, 'DVR')))
      : (count > 4 ? findMat(/CP-PLUS-DVR-8CH/i, 'DVR') : findMat(/CP-PLUS-DVR-4CH/i, 'DVR'));

    const basicHdd = findMat(/HDD-SURV-1TB/i, '1TB');
    const basicCable = findMat(/CABLE-3PLUS1-MTR/i, '3+1');
    const junctionBox = findMat(/ACC-JUNCTION-BOX/i, 'Junction Box');
    const smps = count > 4 ? findMat(/SMPS-12V-10A/i, 'Power Supply') : findMat(/SMPS-12V-5A/i, 'Power Supply');

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
        ? `${basicCam?.brand || 'CP Plus'} 2MP Full HD ಡೋಮ್ / ಬುಲೆಟ್`
        : `${basicCam?.brand || 'CP Plus'} 2MP Full HD Dome / Bullet`,
      brand: basicCam?.brand || 'CP Plus',
      recorder: count > 4 ? `${basicDvr?.brand || 'CP Plus'} 8-Channel HD DVR` : `${basicDvr?.brand || 'CP Plus'} 4-Channel HD DVR`,
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
        itemsSubtotal: Math.round(basicCalc.pricingBreakdown.itemsSubtotal),
        labourCharge: Math.round(basicCalc.pricingBreakdown.labourCharge),
        serviceCharge: Math.round(basicCalc.pricingBreakdown.serviceCharge),
        subtotal: Math.round(basicCalc.subtotal),
        gstRate: basicCalc.gstRate,
        gstAmount: Math.round(basicCalc.gstAmount),
        finalAmount: Math.round(basicCalc.finalAmount),
        priceDisplay: `₹${Math.round(basicCalc.finalAmount).toLocaleString('en-IN')}`,
        hasAuthoritativePricing: true,
      } : {
        finalAmount: null,
        priceDisplay: isKannada ? 'ಕೊಟೇಶನ್ ಅಗತ್ಯವಿದೆ' : 'Quotation required',
        hasAuthoritativePricing: false,
      },
      features: isKannada ? [
        '1080P Full HD ಸ್ಪಷ್ಟ ವೀಡಿಯೊ ರೆಕಾರ್ಡಿಂಗ್',
        '20 ಮೀಟರ್ ಸ್ಮಾರ್ಟ್ ಇನ್‌ಫ್ರಾರೆಡ್ ನೈಟ್ ವಿಷನ್',
        'ಮೊಬೈಲ್ ಲೈವ್ ವೀಕ್ಷಣೆ (Android & iOS App)',
        'ಚಲನೆ ಪತ್ತೆ (Motion Detection) ಮತ್ತು ಮೊಬೈಲ್ ಎಚ್ಚರಿಕೆಗಳು',
        'IP66 ಜಲನಿರೋಧಕ (Weatherproof) ಬಾಹ್ಯ ಕವಚ',
      ] : [
        '1080P Full HD Video Clarity',
        '20-meter Smart Infrared Night Vision',
        'Mobile Live Viewing via Mobile App (iOS & Android)',
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
    const proDvr = (targetBrand === 'Hikvision')
      ? (count > 4 ? (findMat(/HIK-NVR-8CH-POE/i, 'NVR') || findMat(/CP-PLUS-DVR-8CH/i, 'DVR')) : (findMat(/HIK-NVR-4CH-POE/i, 'NVR') || findMat(/CP-PLUS-DVR-4CH/i, 'DVR')))
      : (count > 4 ? findMat(/CP-PLUS-DVR-8CH/i, 'DVR') : findMat(/CP-PLUS-DVR-4CH/i, 'DVR'));
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
          ...(rackMountRule ? [{ ruleId: rackMountRule._id, quantity: 1 }] : []),
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
        itemsSubtotal: Math.round(proCalc.pricingBreakdown.itemsSubtotal),
        labourCharge: Math.round(proCalc.pricingBreakdown.labourCharge),
        serviceCharge: Math.round(proCalc.pricingBreakdown.serviceCharge),
        subtotal: Math.round(proCalc.subtotal),
        gstRate: proCalc.gstRate,
        gstAmount: Math.round(proCalc.gstAmount),
        finalAmount: Math.round(proCalc.finalAmount),
        priceDisplay: `₹${Math.round(proCalc.finalAmount).toLocaleString('en-IN')}`,
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
        'Instant Motion Alerts & Mobile Live Streaming',
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
          ...(rackMountRule ? [{ ruleId: rackMountRule._id, quantity: 1 }] : []),
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
      brand: premCam?.brand || 'Hikvision',
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
        itemsSubtotal: Math.round(premCalc.pricingBreakdown.itemsSubtotal),
        labourCharge: Math.round(premCalc.pricingBreakdown.labourCharge),
        serviceCharge: Math.round(premCalc.pricingBreakdown.serviceCharge),
        subtotal: Math.round(premCalc.subtotal),
        gstRate: premCalc.gstRate,
        gstAmount: Math.round(premCalc.gstAmount),
        finalAmount: Math.round(premCalc.finalAmount),
        priceDisplay: `₹${Math.round(premCalc.finalAmount).toLocaleString('en-IN')}`,
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
        'AI Human and Vehicle Motion Classification (Filters out false alarms)',
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
        itemsSubtotal: Math.round(netCalc1.pricingBreakdown.itemsSubtotal),
        labourCharge: Math.round(netCalc1.pricingBreakdown.labourCharge),
        serviceCharge: Math.round(netCalc1.pricingBreakdown.serviceCharge),
        subtotal: Math.round(netCalc1.subtotal),
        gstRate: netCalc1.gstRate,
        gstAmount: Math.round(netCalc1.gstAmount),
        finalAmount: Math.round(netCalc1.finalAmount),
        priceDisplay: `₹${Math.round(netCalc1.finalAmount).toLocaleString('en-IN')}`,
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
 * Filter packages by budgetMax. If the requested cameraCount produces all packages
 * over budget, automatically try with reduced camera counts (count-1, count-2…)
 * and explain the adjustment in a budgetNote.
 *
 * Returns: { filteredPackages, budgetNote, adjustedCameraCount }
 */
async function applyBudgetFilter({ packages, budgetMax, cameraCount, langStyle, generateRecsCallback }) {
  if (!budgetMax || !packages || packages.length === 0) {
    return { filteredPackages: packages, budgetNote: null, adjustedCameraCount: cameraCount };
  }

  const isKannada = langStyle === 'kannada' || langStyle === 'kanglish';
  const isTamil = langStyle === 'tanglish' || langStyle === 'tamil';

  // Try with original count first
  const inBudget = packages.filter(pkg =>
    pkg.pricing && pkg.pricing.finalAmount && pkg.pricing.finalAmount <= budgetMax
  );

  if (inBudget.length > 0) {
    return { filteredPackages: inBudget, budgetNote: null, adjustedCameraCount: cameraCount };
  }

  // All packages exceed budget — find the cheapest package price to explain the gap
  const cheapest = packages.reduce((min, pkg) =>
    (pkg.pricing?.finalAmount || Infinity) < (min.pricing?.finalAmount || Infinity) ? pkg : min
  , packages[0]);
  const cheapestPrice = cheapest?.pricing?.finalAmount || 0;

  // Try reducing camera count to find what fits
  for (let tryCount = cameraCount - 1; tryCount >= 1; tryCount--) {
    const altPackages = await generateRecsCallback(tryCount);
    const altInBudget = altPackages.filter(pkg =>
      pkg.pricing && pkg.pricing.finalAmount && pkg.pricing.finalAmount <= budgetMax
    );
    if (altInBudget.length > 0) {
      const budgetFmt = `₹${budgetMax.toLocaleString('en-IN')}`;
      const origFmt = `₹${cheapestPrice.toLocaleString('en-IN')}`;
      let budgetNote;
      if (isKannada) {
        budgetNote = `ನಿಮ್ಮ ₹${budgetMax.toLocaleString('en-IN')} ಬಜೆಟ್‌ಗೆ ${cameraCount} ಕ್ಯಾಮೆರಾ ಸಿಸ್ಟಮ್ ಲಭ್ಯವಿಲ್ಲ (ಕನಿಷ್ಟ ${origFmt} ಬೇಕಾಗಿದೆ). ನಿಮ್ಮ ಬಜೆಟ್‌ಗೆ ಸರಿಹೊಂದುವ ${tryCount} ಕ್ಯಾಮೆರಾ ಆಯ್ಕೆಗಳನ್ನು ತೋರಿಸುತ್ತಿದ್ದೇನೆ.`;
      } else if (isTamil) {
        budgetNote = `Ungal ${budgetFmt} budget-la ${cameraCount} camera complete system possible illa (minimum ${origFmt} aagum). ${tryCount} camera setup-ai ${budgetFmt} budget-la ready pannirken.`;
      } else {
        budgetNote = `A ${cameraCount}-camera complete system starts at ${origFmt} with current stock — just above your ${budgetFmt} budget. Here are the best complete setups strictly within your budget (or customize camera count / storage below).`;
      }
      return { filteredPackages: altInBudget, budgetNote, adjustedCameraCount: tryCount };
    }
  }

  // Nothing fits at all — return cheapest 1 package as "closest" with a note
  const budgetFmt = `₹${budgetMax.toLocaleString('en-IN')}`;
  const origFmt = `₹${cheapestPrice.toLocaleString('en-IN')}`;
  let budgetNote;
  if (isKannada) {
    budgetNote = `ನಿಮ್ಮ ${budgetFmt} ಬಜೆಟ್‌ನಲ್ಲಿ ಸಂಪೂರ್ಣ ಸಿಸ್ಟಮ್ ಸಾಧ್ಯವಿಲ್ಲ. ಕನಿಷ್ಟ ಆಯ್ಕೆ ${origFmt} ನಿಂದ ಪ್ರಾರಂಭವಾಗುತ್ತದೆ. ಇಲ್ಲಿ ಲಭ್ಯವಿರುವ ಹತ್ತಿರದ ಆಯ್ಕೆ ತೋರಿಸಲಾಗಿದೆ.`;
  } else if (isTamil) {
    budgetNote = `Ungal ${budgetFmt} budget-la complete system possible illa. Minimum ${origFmt} theva. Closest option kaatukiren.`;
  } else {
    budgetNote = `No complete system fits within ${budgetFmt} budget — the closest option starts at ${origFmt}. Consider increasing your budget or requesting a site survey for a customized scope.`;
  }
  return { filteredPackages: [cheapest], budgetNote, adjustedCameraCount: 1 };
}

/**
 * Generate gathering-phase reply when requirements are incomplete.
 */
function generateGatheringReply({ langStyle, sessionContext = {} }) {
  const isKannada = langStyle === 'kannada' || langStyle === 'kanglish';
  const isTamil = langStyle === 'tanglish' || langStyle === 'tamil';

  if (isKannada) {
    return (
      `ನಮಸ್ಕಾರ! 🙏 ನಾನು ನಿಮ್ಮ **TechBes AI ಸೇವಾ ಸಹಾಯಕ**.\n\n` +
      `ನಿಮಗೆ ಸೂಕ್ತವಾದ CCTV ಪ್ಯಾಕೇಜ್ ತಯಾರಿಸಲು ಕೆಲವು ಪ್ರಶ್ನೆಗಳಿವೆ. ಕೆಳಗೆ ಆಯ್ಕೆ ಮಾಡಿ ಅಥವಾ ನೇರವಾಗಿ ಟೈಪ್ ಮಾಡಿ 👇`
    );
  }
  if (isTamil) {
    return (
      `Vanakkam! 🙏 Naan unga **TechBes AI Service Advisor**.\n\n` +
      `Ungalukku correct CCTV package suggest panna, sila questions kekkanum. Keezhae select pannunga illa type pannunga 👇`
    );
  }
  return (
    `Hello! 🙏 I'm your **TechBes AI Service Advisor**.\n\n` +
    `To suggest the perfect package for you, I need a few quick details. Tap an answer below or type freely 👇`
  );
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
  userPreferences = {},
  budgetNote = null,
}) {
  const bestPackage = recommendations.find(r => r.isPopular) || recommendations[0];
  const targetBrand = userPreferences.brand || null;
  const isComponentOnly = userPreferences.componentFocus === 'camera_only';
  const notePrefix = budgetNote ? `${budgetNote}\n\n` : '';

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

    const brandNote = targetBrand ? ` (${targetBrand} ಅಧಿಕೃತ ಸಿಸ್ಟಮ್)` : '';

    return (
      notePrefix +
      `ನಮಸ್ಕಾರ! ನಿಮ್ಮ **${propLabel}**-ಗೆ ಸೂಕ್ತವಾದ **${countStr}** CCTV ಸಿಸ್ಟಮ್‌ಗಾಗಿ${brandNote} ನಾನು 2–3 ಪ್ಯಾಕೇಜ್ ಆಯ್ಕೆಗಳನ್ನು ಸಿದ್ಧಪಡಿಸಿದ್ದೇನೆ.\n\n` +
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
      notePrefix +
      `Vanakkam! Ungaloda **${propertyType}**-ku thevayana **${countStr}** CCTV setup-ku naan 2–3 suitable configurations ready pannirken.\n\n` +
      `💡 **Recommended Choice**: **${bestPackage?.title || 'Smart Color Pro'}** (${priceSnippet}). Idhula 24/7 Color Night Vision, mobile live viewing, genuine hardware, and 2-year warranty include aagum.\n\n` +
      `📌 *Note*: Final cable length and exact camera positions will be confirmed during our free on-site survey. Nee-nga package choose panni direct-ah quotation request submit pannalam!`
    );
  }

  // English
  const countStr = isComponentOnly
    ? `${cameraCount} camera expansion kit${cameraCount > 1 ? 's' : ''}`
    : `${cameraCount} camera${cameraCount > 1 ? 's' : ''}`;
  const priceSnippet = bestPackage && bestPackage.pricing?.priceDisplay
    ? `starting from **${bestPackage.pricing.priceDisplay}**`
    : 'with itemized quotation';

  const brandIntro = targetBrand ? ` featuring genuine **${targetBrand}** hardware` : '';

  return (
    notePrefix +
    `Hello! Based on your requirement for **${propertyType}**, I have configured **${countStr}**${brandIntro} with 2–3 tailored package tiers below.\n\n` +
    `⭐ **Most Popular Option**: **${bestPackage?.title || 'Smart Color Pro'}** (${priceSnippet}). It includes 24/7 color night vision, mobile app streaming, hard drive storage, and complete professional installation.\n\n` +
    `🔍 *Next Steps*: Select a package below to inspect the genuine item breakdown, customize cameras or storage, or request an official quotation with one click!`
  );
}

/**
 * Controller handler for POST /api/v2/ai/recommend-services
 *
 * Request body:
 *   messages: Array<{role, content}>   — full conversation history
 *   customerLocale: string             — 'en-IN' | 'kn-IN' | 'ta-IN'
 *   serviceCategory: string | null     — optional pre-set category
 *   sessionContext: object | null      — accumulated slot values from prior turns
 *     { propertyType, cameraCount, budgetMax, brand, componentFocus, visionPreference }
 *
 * Response data:
 *   stage: 'gathering_requirements' | 'recommendations'
 *   sessionContext: updated accumulated context
 *   reply: string
 *   clarificationQuestions: []
 *   recommendations: []
 *   appliedFilters: []
 *   budgetNote: string | null
 */
async function processServiceRecommendation(req, res, next) {
  try {
    const {
      messages = [],
      customerLocale = 'en-IN',
      serviceCategory = null,
      sessionContext: incomingContext = {},
    } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Messages array is required.',
      });
    }

    const latestUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    const fullTranscript = messages.map(m => m.content).join(' ');

    const langStyle = detectLanguageStyle(latestUserMsg, customerLocale);
    const { category, subcategory } = detectServiceCategory(fullTranscript, serviceCategory);

    // ── SLOT FILLING: Merge incoming session context with new message extractions ──
    // Rules: existing session values are overridden only when the NEW message
    // explicitly provides a fresh value (not when it's the same default).
    const session = { ...(incomingContext || {}) };

    // Property type — only override if explicitly in the latest message
    const latestProp = detectPropertyTypeExplicit(latestUserMsg);
    if (latestProp) session.propertyType = latestProp;
    else if (!session.propertyType) {
      // Fallback: scan full transcript for property type
      const transcriptProp = detectPropertyTypeExplicit(fullTranscript);
      if (transcriptProp) session.propertyType = transcriptProp;
    }

    // Camera count — latest message wins
    const latestCount = extractCameraCount(latestUserMsg);
    if (latestCount) session.cameraCount = latestCount;
    else if (!session.cameraCount) {
      const transcriptCount = extractCameraCount(fullTranscript);
      if (transcriptCount) session.cameraCount = transcriptCount;
    }

    // Budget max — latest message wins (multilingual parser)
    const latestBudget = extractBudgetMax(latestUserMsg);
    if (latestBudget) session.budgetMax = latestBudget;
    else if (!session.budgetMax) {
      const transcriptBudget = extractBudgetMax(fullTranscript);
      if (transcriptBudget) session.budgetMax = transcriptBudget;
    }

    // User preferences (brand, componentFocus, visionPreference, etc.)
    const latestPrefs = extractUserPreferences(latestUserMsg);
    if (latestPrefs.brand) session.brand = latestPrefs.brand;
    if (latestPrefs.componentFocus && latestPrefs.componentFocus !== 'full_system') {
      session.componentFocus = latestPrefs.componentFocus;
    }
    if (latestPrefs.visionPreference) session.visionPreference = latestPrefs.visionPreference;

    // Merge budgetCap from preferences parser (older regex) if multilingual parser missed it
    if (!session.budgetMax && latestPrefs.budgetCap) {
      session.budgetMax = latestPrefs.budgetCap;
    }

    // ── PHASE DETECTION ──
    const vague = isVagueRequest(latestUserMsg, session);

    // ── PHASE A: GATHERING REQUIREMENTS ──
    if (vague) {
      const clarificationQuestions = generateClarificationQuestions(
        { category, propertyType: session.propertyType, cameraCount: session.cameraCount },
        langStyle
      );
      const reply = generateGatheringReply({ langStyle, sessionContext: session });

      return res.status(200).json({
        success: true,
        data: {
          stage: 'gathering_requirements',
          sessionContext: session,
          reply,
          languageStyle: langStyle,
          detectedCategory: category,
          detectedSubcategory: subcategory,
          clarificationQuestions,
          recommendations: [],
          appliedFilters: [],
          budgetNote: null,
          estimatedCameraCount: session.cameraCount || null,
          isEstimatedCount: false,
          detectedPropertyType: session.propertyType || null,
        },
      });
    }

    // ── PHASE B: TAILORED RECOMMENDATIONS ──
    const floors = extractFloors(fullTranscript);
    const { count: estimatedCount, isEstimated } = estimateCameraCount({
      propertyType: session.propertyType || 'Home / Villa',
      floors,
      text: fullTranscript,
    });

    const cameraCount = session.cameraCount || estimatedCount;
    const propertyType = session.propertyType || 'Home / Villa';

    const userPreferences = {
      brand: session.brand || null,
      componentFocus: session.componentFocus || 'full_system',
      visionPreference: session.visionPreference || 'Color Night Vision',
      budgetCap: session.budgetMax || null,
    };

    // Helper to generate packages for a given camera count (used by budget filter)
    const generateRecsForCount = (count) => generateRecommendations({
      category,
      subcategory,
      propertyType,
      cameraCount: count,
      visionPreference: userPreferences.visionPreference,
      audioPreference: false,
      cableEstimatePerCam: 25,
      langStyle,
      userPreferences,
    });

    // Generate base packages
    let recommendations = await generateRecsForCount(cameraCount);

    // Apply budget filter
    let budgetNote = null;
    let adjustedCameraCount = cameraCount;
    if (session.budgetMax) {
      const result = await applyBudgetFilter({
        packages: recommendations,
        budgetMax: session.budgetMax,
        cameraCount,
        langStyle,
        generateRecsCallback: generateRecsForCount,
      });
      recommendations = result.filteredPackages;
      budgetNote = result.budgetNote;
      adjustedCameraCount = result.adjustedCameraCount;
    }

    // Build applied filters array for the UI
    const appliedFilters = [];
    if (propertyType) {
      const propIcons = {
        'Home / Villa': '🏠',
        'Apartment / Flat': '🏢',
        'Retail Shop': '🛍️',
        'Commercial Office': '💼',
        'Warehouse / Godown': '🏭',
      };
      appliedFilters.push({ key: 'propertyType', label: `${propIcons[propertyType] || '📍'} ${propertyType}`, value: propertyType });
    }
    if (session.cameraCount || adjustedCameraCount) {
      appliedFilters.push({ key: 'cameraCount', label: `📷 ${adjustedCameraCount} Camera${adjustedCameraCount !== 1 ? 's' : ''}`, value: adjustedCameraCount });
    }
    if (session.budgetMax) {
      appliedFilters.push({ key: 'budget', label: `💰 Under ₹${session.budgetMax.toLocaleString('en-IN')}`, value: session.budgetMax });
    }
    if (userPreferences.brand) {
      appliedFilters.push({ key: 'brand', label: `🏷️ ${userPreferences.brand}`, value: userPreferences.brand });
    }

    const clarificationQuestions = generateClarificationQuestions(
      { category, propertyType, cameraCount: adjustedCameraCount },
      langStyle
    );

    const reply = generateAssistantReply({
      langStyle,
      category,
      propertyType,
      cameraCount: adjustedCameraCount,
      isEstimated: session.cameraCount ? false : isEstimated,
      recommendations,
      userPreferences,
      budgetNote,
    });

    // Update session with final resolved values
    session.cameraCount = session.cameraCount || adjustedCameraCount;
    session.propertyType = propertyType;

    return res.status(200).json({
      success: true,
      data: {
        stage: 'recommendations',
        sessionContext: session,
        reply,
        languageStyle: langStyle,
        detectedCategory: category,
        detectedSubcategory: subcategory,
        detectedPropertyType: propertyType,
        estimatedCameraCount: adjustedCameraCount,
        isEstimatedCount: session.cameraCount ? false : isEstimated,
        clarificationQuestions,
        recommendations,
        appliedFilters,
        budgetNote,
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
};
