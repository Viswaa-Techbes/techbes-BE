/**
 * aiConversationEngine.js
 * Advanced Intent Classification, Entity Extraction, State Normalization,
 * and Context-Aware Dialogue Generation for TechBes Smart Service Advisor.
 */

const { calculateCctvPrice } = require('./cctvPricingService');
const CctvBrand = require('../models/CctvBrand');
const CctvModel = require('../models/CctvModel');
const CctvCablePricing = require('../models/CctvCablePricing');

// Supported Intents
const INTENTS = {
  CCTV_INSTALLATION: 'CCTV_INSTALLATION',
  CCTV_REPAIR: 'CCTV_REPAIR',
  CCTV_AMC: 'CCTV_AMC',
  CCTV_UPGRADE: 'CCTV_UPGRADE',
  CCTV_PRODUCTS: 'CCTV_PRODUCTS',
  CCTV_SITE_SURVEY: 'CCTV_SITE_SURVEY',
  GET_QUOTE: 'GET_QUOTE',
  BOOK_SERVICE: 'BOOK_SERVICE',
  PRICE_ENQUIRY: 'PRICE_ENQUIRY',
  TRACK_BOOKING: 'TRACK_BOOKING',
  TRACK_TECHNICIAN: 'TRACK_TECHNICIAN',
  PAYMENT: 'PAYMENT',
  SUPPORT: 'SUPPORT',
  LAPTOP_SERVICE: 'LAPTOP_SERVICE',
  NETWORKING_SERVICE: 'NETWORKING_SERVICE',
  LOCATION_QUERY: 'LOCATION_QUERY',
  BRAND_QUERY: 'BRAND_QUERY',
  AFFIRMATIVE: 'AFFIRMATIVE',
  NEGATIVE: 'NEGATIVE',
  GREETING: 'GREETING',
  GENERAL_CCTV_QUERY: 'GENERAL_CCTV_QUERY',
  GENERAL_QUERY: 'GENERAL_QUERY',
};

const BANGALORE_AREAS = [
  'indiranagar', 'koramangala', 'whitefield', 'hsr layout', 'hsr', 'jp nagar',
  'jayanagar', 'malleshwaram', 'hebbal', 'yelahanka', 'btm layout', 'btm',
  'marathahalli', 'bellandur', 'electronic city', 'rajajinagar', 'bannerghatta',
  'sarjapur', 'kalyan nagar', 'kammanahalli', 'rt nagar', 'basavanagudi',
  'banashankari', 'domlur', 'ulsoor', 'frazer town', 'sadashivanagar',
  'vijayanagar', 'yeshwanthpur', 'cv raman nagar', 'kr puram', 'mahadevapura',
  'bangalore', 'bengaluru'
];

const BRAND_MAP = {
  'cp plus': 'CP Plus',
  'cpplus': 'CP Plus',
  'cp-plus': 'CP Plus',
  'hikvision': 'Hikvision',
  'hik vision': 'Hikvision',
  'hik-vision': 'Hikvision',
  'secureye': 'Secureye',
  'secur eye': 'Secureye',
  'dahua': 'Dahua',
  'd-link': 'D-Link',
  'dlink': 'D-Link',
  'bosch': 'Bosch',
  'honeywell': 'Honeywell',
  'tp-link': 'TP-Link',
  'tplink': 'TP-Link',
  'tapo': 'TP-Link'
};

const PROPERTY_MAP = {
  'home': 'Home',
  'house': 'Home',
  'residence': 'Home',
  'residential': 'Home',
  'apartment': 'Apartment',
  'flat': 'Apartment',
  'villa': 'Villa',
  'office': 'Office',
  'workplace': 'Office',
  'commercial': 'Commercial',
  'shop': 'Commercial',
  'store': 'Commercial',
  'showroom': 'Commercial',
  'warehouse': 'Warehouse',
  'factory': 'Warehouse',
  'godown': 'Warehouse'
};

/**
 * Extracts accumulated conversation state from all message turns.
 */
function extractConversationState(messages = []) {
  const state = {
    category: null,             // 'cctv' | 'networking' | 'laptop' | 'hardware' | 'amc' | 'general'
    service: null,              // 'install-new-cctv' | 'repair-existing-cctv' | 'maintenance-amc' | 'upgrade-existing-cctv' | 'buy-cctv-products' | 'free-site-survey' | 'wifi-setup' | 'structured-cabling'
    intent: null,               // primary detected intent
    entities: {
      cameraCount: null,
      brand: null,
      cameraType: null,
      propertyType: 'Home',
      location: null,
      storage: null,
      cableType: null,
      budget: null,
    },
    lastAssistantQuestion: null, // what the assistant asked in previous turn
    lastAssistantMessage: '',   // raw text of last assistant message
    turnCount: 0,
    isFirstUserMessage: false,
    history: []
  };

  const userMessages = messages.filter(m => m && m.role === 'user');
  const assistantMessages = messages.filter(m => m && m.role === 'assistant');

  state.turnCount = userMessages.length;
  state.isFirstUserMessage = userMessages.length <= 1;

  if (assistantMessages.length > 0) {
    const lastAssist = assistantMessages[assistantMessages.length - 1];
    state.lastAssistantMessage = lastAssist.content || '';
    state.lastAssistantQuestion = analyzeAssistantQuestion(state.lastAssistantMessage);
  }

  // Scan history to accumulate entities and state progressively
  for (const msg of messages) {
    if (!msg || !msg.content) continue;
    const text = msg.content;
    const lower = text.toLowerCase();

    // 1. Service Category Detection
    if (lower.match(/\b(cctv|camera|cameras|surveillance|dvr|nvr|dome|bullet|ip camera)\b/)) {
      state.category = 'cctv';
    } else if (lower.match(/\b(laptop|macbook|notebook|desktop|pc|computer|screen repair)\b/)) {
      state.category = 'laptop';
      state.service = 'laptop-repair';
    } else if (lower.match(/\b(wifi|wi-fi|router|mesh|structured cabling|lan cable|ethernet|network|switch)\b/)) {
      state.category = 'networking';
      if (lower.match(/\b(cabling|lan|cat6|ethernet|patch)\b/)) state.service = 'structured-cabling';
      else state.service = 'wifi-setup';
    }

    // 2. Specific CCTV Sub-Services
    if (state.category === 'cctv' || lower.match(/\bcctv\b/)) {
      if (lower.match(/\b(install|new cctv|new camera|setup|fresh|new setup|install new)\b/) && !lower.match(/\b(repair|fix|amc|upgrade)\b/)) {
        state.service = 'install-new-cctv';
      } else if (lower.match(/\b(repair|fix|broken|blur|not working|offline|troubleshoot|replace wire)\b/)) {
        state.service = 'repair-existing-cctv';
      } else if (lower.match(/\b(amc|maintenance|annual contract|annual maintenance|yearly)\b/)) {
        state.service = 'maintenance-amc';
      } else if (lower.match(/\b(upgrade|replace old|switch to ip|modernize)\b/)) {
        state.service = 'upgrade-existing-cctv';
      } else if (lower.match(/\b(buy|purchase|accessories|power supply|connectors|standalone camera)\b/)) {
        state.service = 'buy-cctv-products';
      } else if (lower.match(/\b(survey|site survey|inspection|visit site|assess)\b/)) {
        state.service = 'free-site-survey';
      }
    }

    // 3. Entity Extraction: Camera Count
    const parsedCount = parseCameraCount(text);
    if (parsedCount !== null) {
      state.entities.cameraCount = parsedCount;
    }

    // 4. Entity Extraction: Brand
    for (const [key, val] of Object.entries(BRAND_MAP)) {
      const rx = new RegExp(`\\b${key}\\b`, 'i');
      if (rx.test(lower)) {
        state.entities.brand = val;
        break;
      }
    }

    // 5. Entity Extraction: Property Type
    for (const [key, val] of Object.entries(PROPERTY_MAP)) {
      const rx = new RegExp(`\\b${key}\\b`, 'i');
      if (rx.test(lower)) {
        state.entities.propertyType = val;
        break;
      }
    }

    // 6. Entity Extraction: Location
    for (const area of BANGALORE_AREAS) {
      const rx = new RegExp(`\\b${area}\\b`, 'i');
      if (rx.test(lower)) {
        state.entities.location = capitalizeWords(area);
        break;
      }
    }

    // 7. Entity Extraction: Camera Type
    if (lower.includes('ip camera') || lower.includes('ip cam') || lower.includes('network camera')) {
      state.entities.cameraType = 'IP Camera';
    } else if (lower.includes('analog') || lower.includes('hd-tvi') || lower.includes('hd-cvi') || lower.includes('coaxial')) {
      state.entities.cameraType = 'Analog Camera';
    } else if (lower.includes('dome')) {
      state.entities.cameraType = 'Dome Camera';
    } else if (lower.includes('bullet') || lower.includes('outdoor camera')) {
      state.entities.cameraType = 'Bullet Camera';
    } else if (lower.includes('ptz') || lower.includes('360')) {
      state.entities.cameraType = 'PTZ Camera';
    }

    // 8. Entity Extraction: Storage / SD Card / HDD
    const storageMatch = lower.match(/\b(64\s*gb|128\s*gb|256\s*gb|512\s*gb|1\s*tb|2\s*tb|4\s*tb)\b/);
    if (storageMatch) {
      state.entities.storage = storageMatch[1].toUpperCase().replace(/\s+/g, '');
    }

    // 9. Entity Extraction: Cable Type
    if (lower.includes('cat6') || lower.includes('cat 6') || lower.includes('cat6a')) {
      state.entities.cableType = 'CAT6 Cable';
    } else if (lower.includes('3+1') || lower.includes('3 plus 1')) {
      state.entities.cableType = '3+1 CCTV Cable';
    }
  }

  // Default category to CCTV if any CCTV indicators exist or if service is set
  if (!state.category && (state.service || state.entities.cameraCount || state.entities.brand)) {
    state.category = 'cctv';
  }

  return state;
}

/**
 * Analyzes the assistant's previous question to understand what it prompted the user for.
 */
function analyzeAssistantQuestion(assistantText = '') {
  if (!assistantText) return null;
  const lower = assistantText.toLowerCase();

  if (lower.includes('new cctv system or upgrade') || lower.includes('new setup or upgrade') || lower.includes('new or repair')) {
    return 'ASKED_NEW_OR_UPGRADE';
  }
  if (lower.includes('start the installation booking') || lower.includes('proceed with booking') || lower.includes('like to book') || lower.includes('guide you to the booking')) {
    return 'ASKED_BOOKING_CONFIRMATION';
  }
  if (lower.includes('how many cameras') || lower.includes('number of cameras') || lower.includes('camera count')) {
    return 'ASKED_CAMERA_COUNT';
  }
  if (lower.includes('preferred brand') || lower.includes('which brand') || lower.includes('cp plus or hikvision')) {
    return 'ASKED_BRAND_PREFERENCE';
  }
  if (lower.includes('home or office') || lower.includes('property type') || lower.includes('residential or commercial')) {
    return 'ASKED_PROPERTY_TYPE';
  }
  if (lower.includes('site survey') || lower.includes('free survey') || lower.includes('on-site survey')) {
    return 'ASKED_SITE_SURVEY';
  }
  if (lower.includes('support ticket') || lower.includes('support team') || lower.includes('connect you with our support')) {
    return 'ASKED_SUPPORT_TICKET';
  }
  if (lower.includes('quote') || lower.includes('formal quote') || lower.includes('custom estimate')) {
    return 'ASKED_QUOTE_CONFIRMATION';
  }

  return null;
}

/**
 * Normalizes short or ambiguous user messages into precise intent and actions based on context.
 */
function normalizeUserIntent(userMessage, state) {
  const query = (userMessage || '').trim().toLowerCase();
  const cleanQuery = query.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();

  // 1. Greetings
  const greetings = ['hi', 'hello', 'hey', 'greetings', 'hola', 'good morning', 'good afternoon', 'good evening', 'namaste'];
  if (greetings.includes(cleanQuery) || greetings.some(g => cleanQuery.startsWith(g + ' '))) {
    if (state.turnCount <= 1) {
      return { intent: INTENTS.GREETING, confidence: 1.0 };
    }
  }

  // 2. Affirmative Responses ("yes", "sure", "ok", "yep", "do it", "confirm", "proceed", "start", "please")
  const affirmatives = ['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'do it', 'confirm', 'proceed', 'start', 'please', 'go ahead', 'yes please', 'lets do it', 'yes book'];
  if (affirmatives.includes(cleanQuery) || cleanQuery === 'yes' || cleanQuery.startsWith('yes ')) {
    if (state.lastAssistantQuestion === 'ASKED_BOOKING_CONFIRMATION' || state.lastAssistantQuestion === 'ASKED_SITE_SURVEY') {
      return { intent: INTENTS.BOOK_SERVICE, confidence: 1.0, details: { target: state.service || 'install-new-cctv' } };
    }
    if (state.lastAssistantQuestion === 'ASKED_SUPPORT_TICKET') {
      return { intent: INTENTS.SUPPORT, confidence: 1.0 };
    }
    if (state.lastAssistantQuestion === 'ASKED_QUOTE_CONFIRMATION') {
      return { intent: INTENTS.GET_QUOTE, confidence: 1.0 };
    }
    return { intent: INTENTS.AFFIRMATIVE, confidence: 0.9 };
  }

  // 3. Negative Responses ("no", "not now", "cancel", "nevermind", "later")
  const negatives = ['no', 'nope', 'nah', 'not now', 'cancel', 'nevermind', 'later', 'no thanks', 'not really'];
  if (negatives.includes(cleanQuery)) {
    return { intent: INTENTS.NEGATIVE, confidence: 1.0 };
  }

  // 4. Service Category Switches
  if (query.match(/\b(laptop|macbook|notebook|desktop repair|laptop service)\b/)) {
    return { intent: INTENTS.LAPTOP_SERVICE, confidence: 1.0 };
  }
  if (query.match(/\b(wifi|wi-fi|router|mesh network|structured cabling|lan wiring)\b/)) {
    return { intent: INTENTS.NETWORKING_SERVICE, confidence: 1.0 };
  }

  // 5. Booking Intent
  if (query.match(/\b(book|schedule|reserve|order|appointment|setup installation|start booking|book it|book now|book service)\b/)) {
    return { intent: INTENTS.BOOK_SERVICE, confidence: 1.0, details: { service: state.service || 'install-new-cctv' } };
  }

  // 6. Tracking & Status Intent
  if (query.match(/\b(track|technician|where is|order status|booking status|status of booking|live location)\b/)) {
    if (query.includes('technician')) {
      return { intent: INTENTS.TRACK_TECHNICIAN, confidence: 1.0 };
    }
    return { intent: INTENTS.TRACK_BOOKING, confidence: 1.0 };
  }

  // 7. Payment & Wallet Intent
  if (query.match(/\b(payment|pay|upi|wallet|balance|refund|invoice|bill|receipt|money)\b/)) {
    return { intent: INTENTS.PAYMENT, confidence: 0.9 };
  }

  // 8. Support & Ticket Intent
  if (query.match(/\b(support|help|complaint|agent|human|talk to person|contact|customer care|issue|ticket)\b/)) {
    return { intent: INTENTS.SUPPORT, confidence: 1.0 };
  }

  // 9. Site Survey Intent
  if (query.match(/\b(survey|site survey|free inspection|visit|inspection|survey booking|site visit)\b/)) {
    return { intent: INTENTS.CCTV_SITE_SURVEY, confidence: 1.0 };
  }

  // 10. Quote Intent
  if (query.match(/\b(quote|quotation|get quote|request quote|estimate sheet|formal quote|get a quote)\b/)) {
    return { intent: INTENTS.GET_QUOTE, confidence: 1.0 };
  }

  // 11. Price & Cost Enquiry
  if (query.match(/\b(price|pricing|cost|how much|charges|rate|rates|estimate|fee|quotation)\b/)) {
    return { intent: INTENTS.PRICE_ENQUIRY, confidence: 1.0 };
  }

  // 12. Specific CCTV Sub-Services
  // Short message "new cctv", "new camera", "install", "new", "cctv installation"
  if (query.match(/\b(new cctv|new camera|cctv installation|install cctv|fresh installation|install new|new setup)\b/) ||
      (cleanQuery === 'new' && state.category === 'cctv') ||
      (cleanQuery === 'install' && state.category === 'cctv') ||
      (cleanQuery === 'cctv' && state.category === 'cctv')) {
    return { intent: INTENTS.CCTV_INSTALLATION, confidence: 1.0 };
  }

  if (query.match(/\b(repair|fix|broken camera|cctv repair|not recording|blur vision|camera offline)\b/)) {
    return { intent: INTENTS.CCTV_REPAIR, confidence: 1.0 };
  }

  if (query.match(/\b(amc|maintenance|annual contract|cctv amc|service contract)\b/)) {
    return { intent: INTENTS.CCTV_AMC, confidence: 1.0 };
  }

  if (query.match(/\b(upgrade|replace old|modernize|upgrade existing)\b/)) {
    return { intent: INTENTS.CCTV_UPGRADE, confidence: 1.0 };
  }

  if (query.match(/\b(buy|products|accessories|camera prices|buy cameras|buy cctv)\b/)) {
    return { intent: INTENTS.CCTV_PRODUCTS, confidence: 1.0 };
  }

  // 13. Brand Queries
  if (query.match(/\b(brand|brands|cp plus|hikvision|secureye|dahua|which brand|best brand)\b/)) {
    return { intent: INTENTS.BRAND_QUERY, confidence: 0.9 };
  }

  // 14. Location Queries
  if (query.match(/\b(location|area|service area|bangalore|serve|pincode|address|where do you serve)\b/)) {
    return { intent: INTENTS.LOCATION_QUERY, confidence: 0.9 };
  }

  // 15. Standalone Camera Count / Brand / Property (e.g. "4 cameras", "4", "CP Plus", "Home")
  if (state.entities.cameraCount !== null && (cleanQuery.match(/^\d+$/) || cleanQuery.match(/^\d+\s*cameras?$/))) {
    return { intent: INTENTS.PRICE_ENQUIRY, confidence: 0.95, details: { cameraCount: state.entities.cameraCount } };
  }

  if (state.category === 'cctv') {
    return { intent: INTENTS.GENERAL_CCTV_QUERY, confidence: 0.7 };
  }

  return { intent: INTENTS.GENERAL_QUERY, confidence: 0.5 };
}

/**
 * Parses camera count from string.
 */
function parseCameraCount(text = '') {
  const query = text.toLowerCase();
  const numberWordMap = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'twelve': 12, 'sixteen': 16, 'twenty': 20, 'twenty four': 24, 'thirty two': 32
  };

  const digitWithCamMatch = query.match(/(\d+)\s*(?:cameras?|cams?|channels?)/);
  if (digitWithCamMatch) {
    const n = parseInt(digitWithCamMatch[1], 10);
    if (n > 0 && n <= 128) return n;
  }

  for (const [word, num] of Object.entries(numberWordMap)) {
    const rx = new RegExp(`\\b${word}\\b\\s*(?:cameras?|cams?|channels?)`);
    if (rx.test(query)) return num;
  }

  // Standalone number in short query (e.g. "4", "8 cameras")
  const trimmed = query.replace(/[^0-9]/g, '');
  if (trimmed.length > 0 && trimmed.length <= 2) {
    const count = parseInt(trimmed, 10);
    if (count >= 1 && count <= 64) return count;
  }

  return null;
}

/**
 * Calculates dynamic camera setup price from database.
 */
async function getDynamicEstimate(cameraCount = 4, brand = 'CP Plus', propertyType = 'Home') {
  try {
    let brandDoc = null;
    if (brand) {
      brandDoc = await CctvBrand.findOne({ name: new RegExp(brand, 'i'), status: 'active' });
    }
    if (!brandDoc) {
      brandDoc = await CctvBrand.findOne({ name: 'CP Plus' }) || await CctvBrand.findOne({ status: 'active' });
    }

    let model = null;
    if (brandDoc) {
      model = await CctvModel.findOne({ brandId: brandDoc._id, cameraType: 'IP Camera', resolution: '2MP', status: 'active' });
      if (!model) model = await CctvModel.findOne({ brandId: brandDoc._id, status: 'active' });
    }
    if (!model) model = await CctvModel.findOne({ status: 'active' });

    if (!model) return null;

    const cable = await CctvCablePricing.findOne({ name: 'CAT6 Cable', status: 'active' }) || await CctvCablePricing.findOne({ status: 'active' });
    const cableType = cable ? cable.name : 'CAT6 Cable';
    const cableLength = cameraCount * 15;

    const pricingInput = {
      propertyType: propertyType || 'Home',
      cameraTypes: [
        {
          type: model.cameraType,
          brandId: model.brandId,
          modelId: model._id,
          quantity: cameraCount
        }
      ],
      installationRequired: true,
      cableType,
      cableLength,
      dvrRequired: model.cameraType.includes('Analog'),
      nvrRequired: model.cameraType.includes('IP') || model.cameraType.includes('Network'),
      sdCardRequired: false,
    };

    return await calculateCctvPrice(pricingInput);
  } catch (err) {
    console.error("Failed to calculate dynamic estimate in aiConversationEngine:", err);
    return null;
  }
}

/**
 * Formats structured pricing estimation into a user-friendly message.
 */
function formatCostBreakdown(calc, brand = 'CP Plus', count = 4) {
  if (!calc || !calc.priceBreakdown) {
    return `For a **${count}-Camera Setup** (${brand}), our standard packages start from approximately **₹${(count * 2200).toLocaleString('en-IN')}** including camera hardware, fitting, cabling, and recording unit configuration.\n\n||QUICK_ACTIONS:Book Installation,Request Custom Quote,Free Site Survey,Compare Hikvision||||NAVIGATE:/services/install-new-cctv||`;
  }

  const breakdown = calc.priceBreakdown;
  const cams = (calc.cameraDetails || []).map(c => `• **${c.quantity}x ${c.brand} ${c.model}** (@ ₹${c.unitPrice} each): ₹${c.totalPrice.toLocaleString('en-IN')}`).join('\n');

  return `Here is your customized instant estimate for a **${calc.propertyType} (${count} Cameras - ${brand})** setup:

**CCTV Cameras:**
${cams}

**Installation & Infrastructure:**
• Camera Fitting: ${calc.installation.quantity} camera(s) @ ₹${calc.installation.unitPrice}/each = ₹${calc.installation.totalPrice.toLocaleString('en-IN')}
• Cabling: ${calc.cable.length}m ${calc.cable.type} @ ₹${calc.cable.unitPrice}/m = ₹${calc.cable.totalPrice.toLocaleString('en-IN')}
• Recording Unit: ${calc.nvrTotal > 0 ? `NVR Setup = ₹${calc.nvrTotal.toLocaleString('en-IN')}` : calc.dvrTotal > 0 ? `DVR Setup = ₹${calc.dvrTotal.toLocaleString('en-IN')}` : 'Included in Package'}
• Base On-site Visit: ₹${calc.visitCharge}

**Estimated Grand Total: ₹${breakdown.grandTotal.toLocaleString('en-IN')}** *(Incl. GST)*

*(Cabling is billed on actual meters used on-site. Verified Bangalore technicians).*

Would you like to proceed with booking this installation or book a free site survey?

||QUICK_ACTIONS:Book ${count} Cameras Setup,Book Free Site Survey,Get Formal Quote,Customize Brand||||NAVIGATE:/services/install-new-cctv||`;
}

/**
 * Generates an intelligent, conversational response based on state, intent, and entities.
 */
async function generateContextualResponse(state, userMessage) {
  const intentResult = normalizeUserIntent(userMessage, state);
  const intent = intentResult.intent;
  const entities = state.entities;
  const cameraCount = entities.cameraCount || 4;
  const brand = entities.brand || 'CP Plus';
  const property = entities.propertyType || 'Home';

  // 1. GREETING (Only for first greeting turns)
  if (intent === INTENTS.GREETING) {
    return "Hello! I am your TechBes Smart Service Advisor. How can I help you today? I can help you with new CCTV installation, camera repairs, AMC plans, structured cabling, or instant pricing estimates! 👋\n\n||QUICK_ACTIONS:CCTV Installation,Repair CCTV,AMC Plans,Free Site Survey,Get Quote||";
  }

  // 2. CCTV INSTALLATION
  if (intent === INTENTS.CCTV_INSTALLATION) {
    // If user specifically said "new cctv" / "install new" or is continuing
    if (state.turnCount > 1 || userMessage.toLowerCase().includes('new cctv') || userMessage.toLowerCase().includes('install')) {
      if (entities.cameraCount) {
        const calc = await getDynamicEstimate(entities.cameraCount, brand, property);
        return `Great! For a **new ${entities.cameraCount}-camera CCTV installation** (${brand} for ${property}), I can configure the complete setup including HD/IP cameras, cabling, NVR/DVR, and professional on-site mounting.\n\n` +
          formatCostBreakdown(calc, brand, entities.cameraCount);
      }
      return `Great! For a **new CCTV installation**, I can help you configure the camera type, quantity, recorder, cabling, and on-site fitting. 

How many cameras do you need (e.g., 2, 4, or 8 cameras), and is this for your home or office?

||QUICK_ACTIONS:4 Cameras Setup,2 Cameras Setup,8 Cameras Setup,Free Site Survey,Book Installation||||NAVIGATE:/services/install-new-cctv||`;
    }

    return `Sure! Are you looking to install a **completely new CCTV system** or upgrade/repair an existing setup? We provide high-definition IP and Analog cameras from CP Plus, Hikvision, and Secureye with on-site installation across Bangalore.

||QUICK_ACTIONS:Install New CCTV,Repair Existing CCTV,Maintenance & AMC,Free Site Survey,Get a Quote||||NAVIGATE:/services/install-new-cctv||`;
  }

  // 3. CCTV REPAIR
  if (intent === INTENTS.CCTV_REPAIR) {
    state.service = 'repair-existing-cctv';
    return `We provide on-demand diagnostic and repair visits for all CCTV brands across Bangalore. Common issues we resolve include offline cameras, blurred night vision, faulty power supplies, DVR/NVR hard disk errors, and damaged cables.

Inspection and diagnostic visits start from ₹299. Would you like to schedule a technician visit?

||QUICK_ACTIONS:Book CCTV Repair,Troubleshoot Offline Camera,Free Phone Support,Get Quote||||NAVIGATE:/services/repair-existing-cctv||||ACTION:BOOK_CCTV_REPAIR||`;
  }

  // 4. CCTV AMC & MAINTENANCE
  if (intent === INTENTS.CCTV_AMC) {
    state.service = 'maintenance-amc';
    return `Our **CCTV Annual Maintenance Contracts (AMC)** keep your security system running 24/7 with zero downtime:

• **Comprehensive AMC:** Covers regular quarterly preventive maintenance, lens cleaning, DVR health checks, and replacement of consumable parts.
• **Non-Comprehensive AMC:** Covers scheduled preventive maintenance and breakdown service calls with discounted spare parts.

Would you like to view our AMC packages or request a custom office AMC quote?

||QUICK_ACTIONS:View AMC Packages,Request Custom AMC Quote,Free Site Survey,Contact Support||||NAVIGATE:/services/maintenance-amc||||ACTION:BOOK_CCTV_AMC||`;
  }

  // 5. CCTV UPGRADE
  if (intent === INTENTS.CCTV_UPGRADE) {
    state.service = 'upgrade-existing-cctv';
    return `Looking to upgrade your existing security cameras? We can easily upgrade your setup from older Analog systems to crisp **2MP/5MP/4K IP Cameras**, add night color vision, upgrade storage hard disks, or enable mobile app remote viewing.

Would you like to book a free site inspection to evaluate your existing wiring and cameras?

||QUICK_ACTIONS:Book Free Site Survey,Upgrade to IP Cameras,Price for 4 IP Cameras,Get Quote||||NAVIGATE:/services/upgrade-existing-cctv||||ACTION:BOOK_CCTV_UPGRADE||`;
  }

  // 6. CCTV PRODUCTS & ACCESSORIES
  if (intent === INTENTS.CCTV_PRODUCTS) {
    state.service = 'buy-cctv-products';
    return `We supply genuine surveillance hardware with manufacturer warranty:
• **IP & Dome/Bullet Cameras:** CP Plus, Hikvision, Dahua, Secureye
• **Recording Units:** 4/8/16/32 Channel DVRs and NVRs
• **Storage:** Surveillance Hard Disks (1TB, 2TB, 4TB) & High-Endurance SD Cards (64GB, 128GB, 256GB)
• **Accessories:** Power Supplies, BNC/DC Connectors, Cat6 / 3+1 Cables, Wall Racks

Would you like to browse our products catalog or order accessories?

||QUICK_ACTIONS:Browse Products,Buy SD Cards,Buy Cameras,Request Quotation||||NAVIGATE:/services/buy-cctv-products||||ACTION:BOOK_CCTV_PRODUCTS||`;
  }

  // 7. SITE SURVEY
  if (intent === INTENTS.CCTV_SITE_SURVEY) {
    state.service = 'free-site-survey';
    return `We offer a **Free On-Site Security Survey** anywhere in Bangalore! A certified security engineer will visit your premises to:
1. Identify blind spots and optimal camera placements
2. Calculate exact cabling lengths and conduit requirements
3. Recommend the best camera models and DVR/NVR configuration
4. Provide an accurate on-the-spot written estimate

Would you like to book your free site survey now?

||QUICK_ACTIONS:Book Free Site Survey,Calculate Price Online,Ask a Question,Contact Support||||NAVIGATE:/services/free-site-survey||||ACTION:BOOK_CCTV_SURVEY||`;
  }

  // 8. PRICE ENQUIRY
  if (intent === INTENTS.PRICE_ENQUIRY) {
    // If camera count is available or extracted
    const count = entities.cameraCount || 4;
    const calc = await getDynamicEstimate(count, brand, property);

    if (calc) {
      return formatCostBreakdown(calc, brand, count);
    }

    return `For CCTV installation in Bangalore:
• **Camera Fitting & Installation:** Starting from ₹499 per camera
• **Complete 4-Camera Setup (Hardware + Cabling + Installation):** Starting from ₹8,999 (CP Plus / Hikvision)
• **Cabling:** CAT6 Cable @ ₹35–₹50/meter, 3+1 Cable @ ₹18–₹25/meter

Tell me how many cameras you need (e.g. 'pricing for 4 cameras') for an instant itemized estimate, or book a free on-site survey!

||QUICK_ACTIONS:Price for 2 Cameras,Price for 4 Cameras,Price for 8 Cameras,Free Site Survey,Book Installation||||NAVIGATE:/services/install-new-cctv||`;
  }

  // 9. GET QUOTE
  if (intent === INTENTS.GET_QUOTE) {
    return `You can get a detailed, formal quote instantly through our online Quote Builder. You can customize the number of cameras, select brands, choose recording storage, and receive an instant PDF estimate.

Click below to open our interactive quote builder:

||QUICK_ACTIONS:Open Quote Builder,Instant 4 Camera Estimate,Free Site Survey,Book Installation||||NAVIGATE:/get-a-quote||||ACTION:GET_QUOTE||`;
  }

  // 10. BOOK SERVICE
  if (intent === INTENTS.BOOK_SERVICE) {
    const targetService = state.service || 'install-new-cctv';
    const serviceName = targetService === 'repair-existing-cctv' ? 'CCTV Repair' :
                        targetService === 'maintenance-amc' ? 'CCTV Maintenance & AMC' :
                        targetService === 'free-site-survey' ? 'Free Site Survey' : 'New CCTV Installation';

    return `I'll guide you directly to the **${serviceName}** booking page! You can select your preferred date, time slot, and location across Bangalore.

Click below to confirm your booking:

||QUICK_ACTIONS:Proceed to Booking,Get Price Estimate,Book Free Site Survey,Contact Support||||NAVIGATE:/services/${targetService}||||ACTION:BOOK_SERVICE||`;
  }

  // 11. TRACKING (BOOKING / TECHNICIAN)
  if (intent === INTENTS.TRACK_BOOKING || intent === INTENTS.TRACK_TECHNICIAN) {
    return `You can track your active service bookings and view your assigned technician's real-time status directly in your Customer Dashboard.

Click below to view your bookings:

||QUICK_ACTIONS:Track My Bookings,Open Dashboard,Contact Support,Book New Service||||NAVIGATE:/dashboard/bookings||||ACTION:TRACK_BOOKING||`;
  }

  // 12. PAYMENT / WALLET
  if (intent === INTENTS.PAYMENT) {
    return `You can manage payments, view invoices, and check your TechBes Wallet balance directly in your account dashboard. We accept UPI, Credit/Debit Cards, Net Banking, and Wallet credits.

||QUICK_ACTIONS:Open Wallet,View Invoices,Track Bookings,Contact Support||||NAVIGATE:/dashboard/wallet||||ACTION:OPEN_WALLET||`;
  }

  // 13. SUPPORT / HUMAN AGENT
  if (intent === INTENTS.SUPPORT) {
    return `I can connect you directly with our dedicated support team. You can create a support ticket or reach us at **support@techbes.com**. Our support engineers respond within 15 minutes during business hours.

Click below to submit a support request:

||QUICK_ACTIONS:Create Support Ticket,Open Dashboard,Call Support,Track Booking||||ACTION:CONTACT_SUPPORT||`;
  }

  // 14. LAPTOP SERVICE
  if (intent === INTENTS.LAPTOP_SERVICE) {
    state.category = 'laptop';
    return `Laptop Repair & Hardware Service is currently **coming soon** in Bangalore! We are expanding our certified hardware technician team in late 2026.

In the meantime, we actively provide doorstep **CCTV Installation, CCTV Repair, AMC Plans, and Structured Network Cabling** across Bangalore. How can I assist you with those services?

||QUICK_ACTIONS:CCTV Installation,CCTV Repair,Network Setup,AMC Plans||||NAVIGATE:/services/install-new-cctv||`;
  }

  // 15. NETWORKING SERVICE
  if (intent === INTENTS.NETWORKING_SERVICE) {
    state.category = 'networking';
    return `We provide professional **Networking & IT Infrastructure Setup** across Bangalore:
• **Wi-Fi & Mesh Setup:** High-speed coverage for homes, multi-floor villas, and offices
• **Structured Cabling:** Cat6 / Cat6A cabling, patch panels, server racks, and RJ45 crimping
• **Switch & Router Configuration:** Managed switches, VLANs, and firewall deployments

Would you like to book a network technician or get a structured cabling quote?

||QUICK_ACTIONS:Book Wi-Fi Setup,Structured Cabling Quote,Free Site Survey,Contact Support||||NAVIGATE:/services/structured-cabling||`;
  }

  // 16. BRAND QUERY
  if (intent === INTENTS.BRAND_QUERY) {
    return `TechBes partners with world-leading security brands:
• **CP Plus:** Best value for money, robust mobile app, excellent 1080p/5MP clarity.
• **Hikvision:** Industry benchmark for smart AI analytics, ColorVu 24/7 full-color night vision, and enterprise durability.
• **Secureye:** Reliable, budget-friendly surveillance for residential and small retail shops.

All cameras come with a standard 1 to 2-year manufacturer warranty and professional on-site mounting! Which brand would you prefer?

||QUICK_ACTIONS:Quote for CP Plus,Quote for Hikvision,Price for 4 Cameras,Book Installation||||NAVIGATE:/services/install-new-cctv||`;
  }

  // 17. LOCATION QUERY
  if (intent === INTENTS.LOCATION_QUERY) {
    const loc = entities.location || 'Bangalore';
    return `Yes! We provide doorstep CCTV installation, repair, and IT support across **all areas of Bangalore**, including ${loc}, Indiranagar, Koramangala, Whitefield, HSR Layout, JP Nagar, Jayanagar, Malleshwaram, Hebbal, Electronic City, and Yelahanka.

Our verified local technicians are usually dispatched within 2 to 4 hours. Would you like to schedule a visit?

||QUICK_ACTIONS:Book CCTV Installation,Book Free Site Survey,Get Price Estimate,Contact Support||||NAVIGATE:/services/install-new-cctv||`;
  }

  // 18. AFFIRMATIVE / CONFIRMATION
  if (intent === INTENTS.AFFIRMATIVE) {
    if (state.service) {
      return `Awesome! I'll direct you to the **${state.service}** booking page so you can select your preferred slot.\n\n||QUICK_ACTIONS:Proceed to Booking,Book Free Site Survey,Get Quote||||NAVIGATE:/services/${state.service}||||ACTION:BOOK_SERVICE||`;
    }
    return `Great! Would you like to start a **New CCTV Installation** booking, get an **instant price estimate**, or book a **free site survey**?\n\n||QUICK_ACTIONS:Install New CCTV,Calculate Price,Book Free Site Survey,Contact Support||||NAVIGATE:/services/install-new-cctv||`;
  }

  // 19. NEGATIVE
  if (intent === INTENTS.NEGATIVE) {
    return `No problem at all! Feel free to ask whenever you need help with CCTV camera pricing, brand comparisons (CP Plus vs. Hikvision), free site surveys, or support.\n\n||QUICK_ACTIONS:CCTV Installation,Compare Brands,Free Site Survey,Get Quote||`;
  }

  // 20. GENERAL CCTV QUERY
  if (state.category === 'cctv') {
    return `I can help you with CCTV camera selection, price estimations, AMC maintenance, repairs, or booking a free on-site survey in Bangalore. 

Let me know what you'd like to do next:
• Calculate price for a specific number of cameras (e.g. '4 cameras')
• Compare brands like CP Plus or Hikvision
• Book a free technician site survey

||QUICK_ACTIONS:Install New CCTV,Price for 4 Cameras,Compare Brands,Free Site Survey,Book Service||||NAVIGATE:/services/install-new-cctv||`;
  }

  // 21. GENERAL FALLBACK (Clear, direct, actionable, NEVER repetitive intro)
  return `I'm here to assist you with TechBes services in Bangalore. You can explore CCTV installation packages, request camera repairs, calculate dynamic pricing, book AMC plans, or connect with our support team.

How can I help you today?

||QUICK_ACTIONS:CCTV Installation,CCTV Repair,AMC Plans,Free Site Survey,Track Booking,Contact Support||||NAVIGATE:/services/install-new-cctv||`;
}

/**
 * Duplicate response protection: Ensures we never send an identical or substantially duplicate message twice consecutively.
 */
function ensureNonRepetitiveResponse(newResponse, lastAssistantMessage, state) {
  if (!lastAssistantMessage || !newResponse) return newResponse;

  const clean = (s) => s.replace(/\|\|.*?\|\|/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const cNew = clean(newResponse);
  const cLast = clean(lastAssistantMessage);

  if (cNew === cLast || (cNew.length > 20 && cLast.includes(cNew.substring(0, 40)))) {
    // Generate a fresh, contextual actionable prompt
    const service = state.service || 'install-new-cctv';
    return `I'm ready to help you proceed with your ${state.category ? state.category.toUpperCase() : 'service'} request! Would you like to start the online booking, get a customized price estimate, or schedule a free on-site survey?\n\n||QUICK_ACTIONS:Start Booking,Calculate Estimate,Book Free Site Survey,Contact Support||||NAVIGATE:/services/${service}||||ACTION:BOOK_SERVICE||`;
  }

  return newResponse;
}

function capitalizeWords(str = '') {
  return str.replace(/\b\w/g, l => l.toUpperCase());
}

module.exports = {
  INTENTS,
  extractConversationState,
  analyzeAssistantQuestion,
  normalizeUserIntent,
  parseCameraCount,
  getDynamicEstimate,
  formatCostBreakdown,
  generateContextualResponse,
  ensureNonRepetitiveResponse
};
