const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

const Category = require('../models/Category');
const SubCategory = require('../models/SubCategory');
const SupportTicket = require('../models/SupportTicket');
const Job = require('../models/Job');
const Wallet = require('../models/Wallet');
const User = require('../models/User');

const CctvBrand = require('../models/CctvBrand');
const CctvModel = require('../models/CctvModel');
const CctvSdCard = require('../models/CctvSdCard');
const CctvCablePricing = require('../models/CctvCablePricing');
const CctvInstallationCharge = require('../models/CctvInstallationCharge');
const CctvAccessory = require('../models/CctvAccessory');

const { calculateCctvPrice } = require('./cctvPricingService');

// Dynamically load frontend AEO/GEO data
function parseTsObject(filePath, varName) {
  try {
    const fullPath = path.resolve(__dirname, filePath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`File not found for dynamic parsing: ${fullPath}`);
      return {};
    }
    let code = fs.readFileSync(fullPath, 'utf8');

    // Remove imports
    code = code.replace(/import\s+[\s\S]*?from\s+['"].*?['"];?/g, '');

    // Remove interface definitions
    code = code.replace(/export\s+interface\s+[A-Za-z0-9_]+\s*\{[\s\S]*?\}/g, '');

    // Strip the Record<...> type annotation precisely
    code = code.replace(/:\s*Record\s*<[^>]+>/g, '');

    // Remove functions at the bottom
    const parts = code.split(/export\s+function/);
    code = parts[0];

    // Replace export const with const
    code = code.replace(/export\s+const\s+/g, 'const ');

    const wrapper = `
      ${code}
      module.exports = { data: typeof ${varName} !== 'undefined' ? ${varName} : {} };
    `;

    const m = new module.constructor();
    m.paths = module.paths;
    m._compile(wrapper, fullPath);
    return m.exports.data;
  } catch (err) {
    console.error(`Error parsing TS file ${filePath}:`, err);
    return {};
  }
}

// Load files
const aeoData = parseTsObject('../../main_app/lib/aeo-data.ts', 'AEO_DATA');
const geoPages = parseTsObject('../../main_app/lib/geo-data.ts', 'GEO_PAGES');

// Helper to score string matches by keyword overlap
function getContextMatches(userMessage, aeoData, geoPages) {
  const query = userMessage.toLowerCase();
  let matchedAeo = null;
  let matchedGeo = [];
  let matchedFaqs = [];

  // Split query into keywords (exclude short words)
  const keywords = query.split(/[^a-z0-9]+/).filter(k => k.length > 3);

  if (keywords.length === 0) return { matchedAeo, matchedGeo, matchedFaqs };

  const scoreString = (str = '') => {
    const s = str.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (s.includes(kw)) score++;
    }
    return score;
  };

  // Score AEO_DATA
  let bestAeoScore = 0;
  for (const [key, val] of Object.entries(aeoData)) {
    let score = scoreString(key);
    if (val.aiAnswers) {
      val.aiAnswers.forEach(ans => {
        score += scoreString(ans.question) * 2;
        score += scoreString(ans.answer);
      });
    }
    if (val.faqs) {
      val.faqs.forEach(faq => {
        score += scoreString(faq.question) * 2;
        score += scoreString(faq.answer);
      });
    }
    if (score > bestAeoScore && score >= 2) {
      bestAeoScore = score;
      matchedAeo = { key, val };
    }
  }

  // Score GEO_PAGES
  const scoredGeo = [];
  for (const [key, val] of Object.entries(geoPages)) {
    let score = scoreString(val.title) * 3;
    score += scoreString(val.description) * 2;
    score += scoreString(val.question) * 2;
    score += scoreString(val.answer);
    if (val.keyPoints) {
      val.keyPoints.forEach(kp => { score += scoreString(kp); });
    }
    if (val.sections) {
      val.sections.forEach(s => {
        score += scoreString(s.title) * 2;
        score += scoreString(s.text);
      });
    }
    if (val.faqs) {
      val.faqs.forEach(f => {
        score += scoreString(f.question) * 2;
        score += scoreString(f.answer);
      });
    }
    if (score >= 2) {
      scoredGeo.push({ score, page: val });
    }
  }
  scoredGeo.sort((a, b) => b.score - a.score);
  matchedGeo = scoredGeo.slice(0, 2).map(item => item.page);

  // Score FAQs
  for (const val of Object.values(aeoData)) {
    if (val.faqs) {
      val.faqs.forEach(faq => {
        const score = scoreString(faq.question);
        if (score >= 2) matchedFaqs.push({ score, faq });
      });
    }
  }
  for (const val of Object.values(geoPages)) {
    if (val.faqs) {
      val.faqs.forEach(faq => {
        const score = scoreString(faq.question);
        if (score >= 2) matchedFaqs.push({ score, faq });
      });
    }
  }
  matchedFaqs.sort((a, b) => b.score - a.score);
  const uniqueFaqs = [];
  const seenFaqs = new Set();
  for (const item of matchedFaqs) {
    if (!seenFaqs.has(item.faq.question)) {
      seenFaqs.add(item.faq.question);
      uniqueFaqs.push(item.faq);
    }
  }

  return {
    matchedAeo,
    matchedGeo,
    matchedFaqs: uniqueFaqs.slice(0, 3)
  };
}

// Parse camera count from user query
function parseCameraCount(userMessage) {
  const query = userMessage.toLowerCase();
  const numberWordMap = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
  };

  const digitMatch = query.match(/(\d+)\s*camera/);
  if (digitMatch) {
    return parseInt(digitMatch[1], 10);
  }

  for (const [word, num] of Object.entries(numberWordMap)) {
    const rx = new RegExp(`\\b${word}\\b\\s*camera`);
    if (rx.test(query)) return num;
  }

  const standAloneDigit = query.match(/\b(\d+)\b/);
  if (standAloneDigit) {
    const count = parseInt(standAloneDigit[1], 10);
    if (count > 0 && count <= 64) return count;
  }

  if (query.includes('cost') || query.includes('price') || query.includes('pricing') || query.includes('estimate')) {
    return 4; // default
  }

  return null;
}

// Calculate dynamic camera setup price
async function getDynamicEstimate(cameraCount) {
  try {
    let cpPlus = await CctvBrand.findOne({ name: 'CP Plus' });
    if (!cpPlus) cpPlus = await CctvBrand.findOne({ status: 'active' });

    let model = null;
    if (cpPlus) {
      model = await CctvModel.findOne({ brandId: cpPlus._id, cameraType: 'IP Camera', resolution: '2MP', status: 'active' });
      if (!model) model = await CctvModel.findOne({ brandId: cpPlus._id, status: 'active' });
    }
    if (!model) model = await CctvModel.findOne({ status: 'active' });

    if (!model) return null;

    const cable = await CctvCablePricing.findOne({ name: 'CAT6 Cable', status: 'active' });
    const cableType = cable ? cable.name : 'CAT6 Cable';
    const cableLength = cameraCount * 15;

    const pricingInput = {
      propertyType: 'Home',
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
    console.error("Failed to calculate dynamic estimate:", err);
    return null;
  }
}

// Format cost calculation
function formatCalculation(calc) {
  if (!calc) return "";
  const breakdown = calc.priceBreakdown;
  const cams = calc.cameraDetails.map(c => `• ${c.quantity}x ${c.brand} ${c.model} (@ ₹${c.unitPrice} each): ₹${c.totalPrice}`).join('\n');

  return `Here is a dynamic price estimation for a standard **${calc.propertyType}** setup:

**CCTV Cameras:**
${cams}

**Installation & Accessories:**
• Camera Fitting: ${calc.installation.quantity} camera(s) @ ₹${calc.installation.unitPrice}/each = ₹${calc.installation.totalPrice}
• Cabling: ${calc.cable.length} meters of ${calc.cable.type} @ ₹${calc.cable.unitPrice}/meter = ₹${calc.cable.totalPrice}
• Recording Unit: ${calc.nvrTotal > 0 ? `NVR Setup = ₹${calc.nvrTotal}` : calc.dvrTotal > 0 ? `DVR Setup = ₹${calc.dvrTotal}` : 'Not added'}
• Base/Visit Charge: ₹${calc.visitCharge}

**Cost Breakdown:**
• Subtotal: ₹${breakdown.subtotal}
• GST (${breakdown.taxTotal > 0 ? '18%' : '0%'}): ₹${breakdown.taxTotal}
• **Estimated Grand Total: ₹${breakdown.grandTotal}**

*(Note: Cable cost is calculated on actual consumption on-site. Prices are fetched dynamically from the TechBes admin configuration. You can proceed with booking to get a precise quote.)*`;
}

// Local search matching engine (fallback when Gemini is unavailable)
async function executeLocalSearchFallback(userMessage) {
  const query = userMessage.toLowerCase();
  
  // 1. Greetings
  const greetings = ['hi', 'hello', 'hey', 'greetings', 'hola', 'sup'];
  const isGreeting = greetings.some(g => query.trim() === g || query.trim().startsWith(g + ' '));
  if (isGreeting) {
    return "Hello! I am your TechBes Smart Service Advisor. How can I help you today? I can recommend CCTV packages, estimate installation costs, compare camera brands, or assist in booking. 👋";
  }

  // 2. Action Intents
  if (query.match(/\b(book|install|setup|schedule|reserve|order)\b/)) {
    return "Would you like to book a service? Let me guide you to the booking flow. Click below to proceed and customize your setup:\n\n[Book CCTV Setup] ||ACTION:BOOK_SERVICE||";
  }
  if (query.match(/\b(track|status|where is|order status)\b/)) {
    return "You can track your service bookings directly in your dashboard. Click below to view status:\n\n[Track Bookings] ||ACTION:TRACK_BOOKING||";
  }
  if (query.match(/\b(wallet|balance|money|credits)\b/)) {
    return "You can view your wallet balance and transactions in the wallet tab. Click below to view:\n\n[Open Wallet] ||ACTION:OPEN_WALLET||";
  }
  if (query.match(/\b(dashboard|home|account)\b/)) {
    return "Here is your customer dashboard:\n\n[Open Dashboard] ||ACTION:OPEN_DASHBOARD||";
  }
  if (query.match(/\b(support|complaint|ticket|help|contact|human|agent)\b/)) {
    return "I can connect you with our support team. Click below to create a support ticket. Our agents will contact you shortly:\n\nCreate Support Ticket ||ACTION:CONTACT_SUPPORT||";
  }

  // 3. Laptop coming soon
  if (query.match(/\blaptop\b/)) {
    return "Laptop Repair & Service is currently coming soon! We are expanding our coverage to include laptop screen, battery, and software troubleshooting in late 2026. Stay tuned!";
  }

  // 4. Pricing / Cost Estimation
  const cameraCount = parseCameraCount(userMessage);
  if (cameraCount !== null) {
    const calc = await getDynamicEstimate(cameraCount);
    if (calc) return formatCalculation(calc);
  }

  // 5. Keyword search in Knowledge Hub and AEO Data
  const matches = getContextMatches(userMessage, aeoData, geoPages);
  
  if (matches.matchedFaqs && matches.matchedFaqs.length > 0) {
    return `Based on your question, here is what I found:\n\n**Q: ${matches.matchedFaqs[0].question}**\n${matches.matchedFaqs[0].answer}`;
  }

  if (matches.matchedAeo) {
    const val = matches.matchedAeo.val;
    if (val.aiAnswers && val.aiAnswers.length > 0) {
      return val.aiAnswers[0].answer;
    }
    if (val.faqs && val.faqs.length > 0) {
      return val.faqs[0].answer;
    }
  }

  if (matches.matchedGeo && matches.matchedGeo.length > 0) {
    const page = matches.matchedGeo[0];
    return `**${page.title}**\n\n${page.answer}\n\n*Key Highlights:*\n${page.keyPoints.map(kp => `• ${kp}`).join('\n')}`;
  }

  // 6. Generic Fallback
  return `I understand you need help with: "${userMessage}". As a Smart Service Advisor, I can help you with CCTV installation, repair, AMC plans, or structured network cabling. How can I assist you today?`;
}

// Main chat handler
async function processChat(req, res) {
  try {
    const { messages } = req.body;
    if (!messages || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Messages array is required' });
    }
    const userMessage = messages[messages.length - 1].content;
    const userId = req.user ? req.user.id : null;

    // Fetch user context
    let userContext = "";
    if (userId) {
      try {
        const user = await User.findById(userId);
        const jobs = await Job.find({ customer: userId }).sort({ createdAt: -1 }).limit(3);
        const wallet = await Wallet.findOne({ user: userId });

        userContext = `\nCustomer Context: \nName: ${user?.name || 'Unknown'}\n`;
        if (jobs.length > 0) {
          userContext += `Recent Bookings: ${jobs.map(j => `ID: ${j._id}, Status: ${j.status}`).join('; ')}\n`;
        }
        if (wallet) {
          userContext += `Wallet Balance: ₹${wallet.balance}\n`;
        }
      } catch (e) {
        console.error("Error fetching user context:", e);
      }
    }

    // Build dynamic catalog and pricing context from DB
    let dynamicContext = "";
    try {
      const dbCats = await Category.find({ isActive: true }).lean();
      const dbSubs = await SubCategory.find({ isActive: true }).lean();

      dynamicContext += "--- SERVICE CATALOG ---\n";
      for (const cat of dbCats) {
        dynamicContext += `Category: ${cat.name} (${cat.description})\n`;
        const catSubs = dbSubs.filter(s => String(s.categoryId) === String(cat._id));
        for (const sub of catSubs) {
          dynamicContext += `  - Subcategory: ${sub.name} (Slug: ${sub.slug})\n`;
          dynamicContext += `    Description: ${sub.description}\n`;
          if (sub.packages && sub.packages.length > 0) {
            dynamicContext += `    Packages:\n`;
            sub.packages.forEach(pkg => {
              if (pkg.isActive) {
                dynamicContext += `      * ${pkg.name}: ₹${pkg.price} (Original: ₹${pkg.originalPrice || 'N/A'}, Duration: ${pkg.duration})\n`;
                if (pkg.includes && pkg.includes.length > 0) {
                  dynamicContext += `        Includes: ${pkg.includes.join(', ')}\n`;
                }
              }
            });
          }
          if (sub.bookingQuestions && sub.bookingQuestions.length > 0) {
            dynamicContext += `    Booking Questions to ask if user wants to book this:\n`;
            sub.bookingQuestions.forEach(q => {
              dynamicContext += `      * Question: "${q.question}" (Type: ${q.type}, Options: ${q.options ? q.options.join('/') : 'text'})\n`;
            });
          }
        }
      }

      const brands = await CctvBrand.find({ status: 'active' }).lean();
      const models = await CctvModel.find({ status: 'active' }).populate('brandId').lean();
      const sdCards = await CctvSdCard.find({ status: 'active' }).lean();
      const cables = await CctvCablePricing.find({ status: 'active' }).lean();
      const fittings = await CctvInstallationCharge.find({ status: 'active' }).lean();
      const accessories = await CctvAccessory.find({ status: 'active' }).lean();

      dynamicContext += "\n--- CCTV DYNAMIC PRICING AND PRODUCTS ---\n";
      dynamicContext += "Camera Brands available:\n";
      brands.forEach(b => {
        dynamicContext += `  - ${b.name}\n`;
        const brandModels = models.filter(m => m.brandId && String(m.brandId._id) === String(b._id));
        brandModels.forEach(m => {
          dynamicContext += `    * ${m.cameraType} - ${m.name} (${m.resolution}): ₹${m.price}\n`;
        });
      });

      dynamicContext += "\nSD Cards available:\n";
      sdCards.forEach(sd => {
        dynamicContext += `  - ${sd.capacity}: ₹${sd.price}\n`;
      });

      dynamicContext += "\nCabling available:\n";
      cables.forEach(c => {
        dynamicContext += `  - ${c.name}: ₹${c.price} per meter\n`;
      });

      dynamicContext += "\nInstallation Fitting Charges:\n";
      fittings.forEach(f => {
        dynamicContext += `  - ${f.name}: ₹${f.price} per camera\n`;
      });

      dynamicContext += "\nAccessories & Recorders:\n";
      accessories.forEach(a => {
        dynamicContext += `  - ${a.name}: ₹${a.price}\n`;
      });
    } catch (e) {
      console.error("Error building dynamic DB context:", e);
    }

    // Match Knowledge Hub and AEO context
    let matchedArticlesText = "";
    try {
      const matches = getContextMatches(userMessage, aeoData, geoPages);
      if (matches.matchedAeo) {
        matchedArticlesText += `\nMatched AEO Guide:\n${JSON.stringify(matches.matchedAeo.val)}\n`;
      }
      if (matches.matchedGeo && matches.matchedGeo.length > 0) {
        matchedArticlesText += `\nMatched Knowledge Hub Articles:\n`;
        matches.matchedGeo.forEach(p => {
          matchedArticlesText += `* Article: ${p.title}\n  Summary: ${p.answer}\n  Key points: ${p.keyPoints.join(', ')}\n`;
        });
      }
      if (matches.matchedFaqs && matches.matchedFaqs.length > 0) {
        matchedArticlesText += `\nMatched FAQs:\n`;
        matches.matchedFaqs.forEach(f => {
          matchedArticlesText += `* Q: ${f.question}\n  A: ${f.answer}\n`;
        });
      }
    } catch (e) {
      console.error("Error matching articles context:", e);
    }

    // Check if camera count is referenced to insert a dynamic calculation in prompt
    let pricingCalculationSnippet = "";
    const cameraCount = parseCameraCount(userMessage);
    if (cameraCount !== null) {
      const calc = await getDynamicEstimate(cameraCount);
      if (calc) {
        pricingCalculationSnippet = `\nPRICING CALCULATION ESTIMATION FOR ${cameraCount} CAMERAS:\n${JSON.stringify(calc)}\n`;
      }
    }

    // Build overall system prompt
    const systemPrompt = `You are the Techbes Smart Service Advisor.
You act as a friendly, professional assistant for a field service marketplace (TechBes) operating in Bangalore, India only.
Use natural English. Give short answers unless the user asks for details.

--- SERVICE CAPABILITIES AND AREA ---
* Service Area: Bangalore only. If the user asks about other areas, clarify that we only operate in Bangalore.
* Laptop Repair: If asked about Laptop Repair or Laptop Services, explain that the service is coming soon and provide a friendly expected availability message.

--- DYNAMIC BUSINESS CONFIGURATION ---
${dynamicContext}

--- USER CONTEXT ---
${userContext}

--- RELEVANT KNOWLEDGE HUB & FAQs CONTEXT ---
${matchedArticlesText}
${pricingCalculationSnippet}

--- CONTEXT RULES ---
* Use the dynamic pricing configuration to estimate costs when the user asks for quotes or camera counts. Never make up prices.
* If the user wants to book a service:
  - Recommend the appropriate service based on their answers.
  - Suggest suitable products/packages.
  - Ask only the required questions from the service booking questions.
  - Redirect the user by appending the BOOK_SERVICE action token to your response.

--- ACTIONS AND INTENT DETECTION ---
If the user's intent matches one of the following, append the exact token to your reply:
* Wants to track a booking: ||ACTION:TRACK_BOOKING||
* Wants to book a service: ||ACTION:BOOK_SERVICE||
* Wants to open wallet: ||ACTION:OPEN_WALLET||
* Wants to contact support/create ticket: ||ACTION:CONTACT_SUPPORT||
* Wants to go to dashboard: ||ACTION:OPEN_DASHBOARD||

Never display raw variables, stack traces, or template placeholders in the response. If the information is not present, guide the user gracefully or suggest a support ticket.`;

    // 1. Strict Gemini check - fallback if key is missing/mock
    const hasValidKey = process.env.GEMINI_API_KEY && 
                         process.env.GEMINI_API_KEY !== 'mock-key' && 
                         process.env.GEMINI_API_KEY !== '';

    if (!hasValidKey) {
      console.warn("WARNING: GEMINI_API_KEY is missing or invalid. AI Chatbot is running in Search Fallback Mode.");
      const reply = await executeLocalSearchFallback(userMessage);
      return res.json({
        success: true,
        data: { reply }
      });
    }

    // 2. Call Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemPrompt
    });

    // Build clean chat history for Gemini
    const chatHistory = messages.slice(0, -1).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(userMessage);
    const response = await result.response;
    const replyText = response.text();

    res.json({
      success: true,
      data: { reply: replyText }
    });

  } catch (error) {
    console.error("AI Service Error:", error);
    try {
      // In case of any API call failure or exception, fall back to local search
      const userMessage = req.body.messages[req.body.messages.length - 1].content;
      const fallbackReply = await executeLocalSearchFallback(userMessage);
      res.json({
        success: true,
        data: { reply: fallbackReply }
      });
    } catch (fallbackError) {
      res.status(500).json({ success: false, message: 'Failed to process AI request', error: error.message });
    }
  }
}

async function createAiTicketHandoff(req, res) {
  try {
    const { summary, chatLog } = req.body;

    const ticket = await SupportTicket.create({
      customer: req.user.id,
      subject: "AI Handoff: " + summary,
      category: "Other",
      priority: "Medium",
      messages: [{ sender: req.user.id, text: "Automated Handoff Log:\n" + chatLog }]
    });

    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  processChat,
  createAiTicketHandoff
};
