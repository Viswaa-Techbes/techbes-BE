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
const {
  INTENTS,
  extractConversationState,
  normalizeUserIntent,
  parseCameraCount,
  getDynamicEstimate,
  formatCostBreakdown,
  generateContextualResponse,
  ensureNonRepetitiveResponse
} = require('./aiConversationEngine');

// Load pre-compiled AEO/GEO data
let aeoData = {};
let geoPages = {};
try {
  aeoData = require('../data/aeoData').AEO_DATA || {};
  geoPages = require('../data/geoData').GEO_PAGES || {};
  console.log('✅ [AI Service] Successfully loaded pre-compiled AEO and GEO data.');
} catch (err) {
  console.warn('⚠️ [AI Service] Pre-compiled AEO/GEO data not found. AI Chatbot will run without search indices. Error:', err.message);
}

// Helper to score string matches by keyword overlap
function getContextMatches(userMessage, aeoData, geoPages) {
  const query = (userMessage || '').toLowerCase();
  let matchedAeo = null;
  let matchedGeo = [];
  let matchedFaqs = [];

  // Exclude extremely generic terms that cause false-positive matches
  const stopWords = new Set([
    'cctv', 'camera', 'cameras', 'service', 'services', 'installation', 'setup',
    'system', 'repair', 'diagnostics', 'about', 'need', 'want', 'help', 'find',
    'advisor', 'techbes', 'please', 'tell', 'show', 'give', 'what', 'where',
    'when', 'how', 'who', 'which', 'why', 'does', 'have', 'would', 'could',
    'should', 'your', 'they', 'them', 'their', 'this', 'that', 'these', 'those',
    'with', 'from', 'than', 'then', 'were', 'been', 'being', 'some', 'many',
    'more', 'most', 'each', 'every', 'other', 'only', 'same', 'also', 'very',
    'much', 'here', 'there', 'their', 'them', 'both', 'into', 'onto', 'your',
    'yours', 'ours', 'myself', 'himself', 'herself', 'itself', 'themselves',
    'serve', 'located', 'location', 'pricing', 'price', 'cost', 'estimate',
    'charges', 'charge', 'bangalore'
  ]);
  
  // Whitelist important 3-letter industry terms
  const whitelistedTerms = new Set(['amc', 'dvr', 'nvr', 'ip', 'gst', 'cat', 'pay']);

  // Split query into keywords
  const keywords = query.split(/[^a-z0-9]+/).filter(k => {
    return (k.length > 3 || whitelistedTerms.has(k)) && !stopWords.has(k);
  });

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
    const keyWords = key.split('-');
    if (keyWords.length > 0 && keyWords.every(w => query.includes(w))) {
      score += 20;
    }

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

    const keyWords = key.split('-');
    if (keyWords.length > 0 && keyWords.every(w => query.includes(w))) {
      score += 20;
    }

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

/**
 * Intelligent Fallback & Rule-Based Dialogue Engine.
 * Executed when Gemini API is unavailable or when used directly.
 */
async function executeLocalSearchFallback(messagesOrString) {
  let messages = [];
  let userMessage = '';

  if (Array.isArray(messagesOrString)) {
    messages = messagesOrString;
    userMessage = messages[messages.length - 1]?.content || '';
  } else if (typeof messagesOrString === 'string') {
    userMessage = messagesOrString;
    messages = [{ role: 'user', content: userMessage }];
  } else if (messagesOrString && messagesOrString.messages) {
    messages = messagesOrString.messages;
    userMessage = messages[messages.length - 1]?.content || '';
  }

  const state = extractConversationState(messages);
  let reply = await generateContextualResponse(state, userMessage);
  reply = ensureNonRepetitiveResponse(reply, state.lastAssistantMessage, state);
  return reply;
}

/**
 * Helper to build sanitized Gemini chat history (ensuring alternating user/model turns starting with 'user').
 */
function sanitizeGeminiHistory(messages) {
  const clean = [];
  // Slice all except the last user message
  const past = messages.slice(0, -1);

  for (let i = 0; i < past.length; i++) {
    const m = past[i];
    if (!m || !m.content || !m.content.trim()) continue;

    const role = m.role === 'user' ? 'user' : 'model';

    // If history is currently empty, it MUST start with a 'user' turn
    if (clean.length === 0 && role === 'model') {
      continue; // skip leading assistant greetings
    }

    // Ensure strictly alternating roles
    if (clean.length > 0 && clean[clean.length - 1].role === role) {
      // Append text to previous turn of the same role
      clean[clean.length - 1].parts[0].text += `\n${m.content}`;
    } else {
      clean.push({
        role,
        parts: [{ text: m.content }]
      });
    }
  }

  return clean;
}

// Main chat handler
async function processChat(req, res) {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Messages array is required' });
    }

    const userMessage = messages[messages.length - 1]?.content || '';
    const userId = req.user ? req.user.id : null;

    // 1. Extract Conversation State & Intent
    const state = extractConversationState(messages);
    const intentResult = normalizeUserIntent(userMessage, state);

    // 2. Fetch user context from DB
    let userContext = "";
    if (userId) {
      try {
        const user = await User.findById(userId);
        const jobs = await Job.find({ customer: userId }).sort({ createdAt: -1 }).limit(3);
        const wallet = await Wallet.findOne({ user: userId });

        userContext = `\nCustomer Context: \nName: ${user?.name || 'Customer'}\n`;
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

    // 3. Build dynamic catalog and pricing context from DB
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

    // 4. Dynamic Pricing Calculation Snippet
    let pricingCalculationSnippet = "";
    const cameraCount = state.entities.cameraCount || parseCameraCount(userMessage);
    if (cameraCount !== null) {
      const calc = await getDynamicEstimate(cameraCount, state.entities.brand || 'CP Plus', state.entities.propertyType || 'Home');
      if (calc) {
        pricingCalculationSnippet = `\nPRICING CALCULATION ESTIMATION FOR ${cameraCount} CAMERAS (${state.entities.brand || 'CP Plus'}):\n${JSON.stringify(calc)}\n`;
      }
    }

    // 5. Match Knowledge Hub and AEO context
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

    // 6. Build overall system prompt with conversation context
    const systemPrompt = `You are the Techbes Smart Service Advisor.
You act as a friendly, professional assistant for a field service marketplace (TechBes) operating in Bangalore, India only.
Use natural English. Be conversational, concise, and action-oriented.

--- CONVERSATION CONTEXT & ACCUMULATED STATE ---
* Current Category: ${state.category || 'CCTV'}
* Current Sub-Service: ${state.service || 'install-new-cctv'}
* Detected Intent: ${intentResult.intent}
* Extracted Entities: ${JSON.stringify(state.entities)}
* Conversation Turn Count: ${state.turnCount}
* Is Follow-up Message: ${state.turnCount > 1 ? 'YES' : 'NO'}

--- CRITICAL CONVERSATION RULES ---
1. NEVER repeatedly start responses with generic introductions like:
   - "I understand you need help with: ..."
   - "As a Smart Service Advisor, I can help you with ..."
   These introductions must NEVER appear during an ongoing conversation!
2. NORMALIZE SHORT USER MESSAGES:
   - If user says "new cctv" after CCTV discussion, treat as "I want to install a new CCTV system" (do not restart the conversation!).
   - If user says "price" or "how much", respond specifically with CCTV pricing/estimates using previous entities.
   - If user says "book", guide them to the booking flow for the active service.
   - If user says "yes", interpret based on the previous question asked by the assistant.
   - If user mentions "4 cameras" or "CP Plus", remember and build upon these entities.
3. CONTEXT SWITCHING: If the user changes topic to Laptop Repair or Networking, switch topics gracefully.
4. SERVICE AREA: Bangalore only.
5. LAPTOP REPAIR: Coming soon in late 2026.

--- DYNAMIC BUSINESS CONFIGURATION ---
${dynamicContext}

--- USER CONTEXT ---
${userContext}

--- RELEVANT KNOWLEDGE & ESTIMATES ---
${matchedArticlesText}
${pricingCalculationSnippet}

--- ACTIONS & NAVIGATION TOKENS ---
Append suitable tokens to your response when appropriate:
* Book New CCTV: ||NAVIGATE:/services/install-new-cctv||||ACTION:BOOK_CCTV_NEW||
* Repair CCTV: ||NAVIGATE:/services/repair-existing-cctv||||ACTION:BOOK_CCTV_REPAIR||
* CCTV AMC: ||NAVIGATE:/services/maintenance-amc||||ACTION:BOOK_CCTV_AMC||
* Free Site Survey: ||NAVIGATE:/services/free-site-survey||||ACTION:BOOK_CCTV_SURVEY||
* Get Quote: ||NAVIGATE:/get-a-quote||||ACTION:GET_QUOTE||
* Track Booking: ||NAVIGATE:/dashboard/bookings||||ACTION:TRACK_BOOKING||
* Open Wallet: ||NAVIGATE:/dashboard/wallet||||ACTION:OPEN_WALLET||
* Contact Support: ||ACTION:CONTACT_SUPPORT||
* Quick Action Suggestions: ||QUICK_ACTIONS:Option 1,Option 2,Option 3||`;

    // 7. Check Gemini API key
    const hasValidKey = process.env.GEMINI_API_KEY && 
                         process.env.GEMINI_API_KEY !== 'mock-key' && 
                         process.env.GEMINI_API_KEY !== '';

    if (!hasValidKey) {
      const reply = await executeLocalSearchFallback(messages);
      return res.json({
        success: true,
        data: { reply }
      });
    }

    // 8. Call Gemini with sanitized history
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: systemPrompt
      });

      const chatHistory = sanitizeGeminiHistory(messages);
      const chat = model.startChat({ history: chatHistory });
      const result = await chat.sendMessage(userMessage);
      const response = await result.response;
      let replyText = response.text();

      // Apply duplicate protection
      replyText = ensureNonRepetitiveResponse(replyText, state.lastAssistantMessage, state);

      return res.json({
        success: true,
        data: { reply: replyText }
      });
    } catch (geminiError) {
      console.warn("Gemini SDK call failed, falling back to dialogue engine:", geminiError.message);
      const fallbackReply = await executeLocalSearchFallback(messages);
      return res.json({
        success: true,
        data: { reply: fallbackReply }
      });
    }

  } catch (error) {
    console.error("AI Service Error:", error);
    try {
      const fallbackReply = await executeLocalSearchFallback(req.body.messages || []);
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
      subject: "AI Handoff: " + (summary || "Assistance Request"),
      category: "Other",
      priority: "Medium",
      messages: [{ sender: req.user.id, text: "Automated Handoff Log:\n" + (chatLog || "") }]
    });

    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  processChat,
  createAiTicketHandoff,
  executeLocalSearchFallback
};
