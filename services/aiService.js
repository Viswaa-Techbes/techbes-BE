const { GoogleGenerativeAI } = require("@google/generative-ai");
const Category = require('../models/Category');
const SubCategory = require('../models/SubCategory');
const SupportTicket = require('../models/SupportTicket');
const Job = require('../models/Job');
const Wallet = require('../models/Wallet');
const User = require('../models/User');

// Defaulting to Google Gemini as the provider
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'mock-key');

async function processChat(req, res) {
  try {
    const { messages } = req.body;
    const userMessage = messages[messages.length - 1].content;
    const userId = req.user ? req.user.id : null;
    
    // User context
    let userContext = "";
    if (userId) {
      try {
        const user = await User.findById(userId);
        const jobs = await Job.find({ customer: userId }).sort({ createdAt: -1 }).limit(3);
        const wallet = await Wallet.findOne({ user: userId });
        
        userContext = `\\nCustomer Context: \\nName: ${user?.name || 'Unknown'}\\n`;
        if (jobs.length > 0) {
          userContext += `Recent Bookings: ${jobs.map(j => `ID: ${j._id}, Status: ${j.status}`).join('; ')}\\n`;
        }
        if (wallet) {
          userContext += `Wallet Balance: ₹${wallet.balance}\\n`;
        }
      } catch (e) {
        console.error("Error fetching user context:", e);
      }
    }

    // Simulate RAG context building by fetching categories and subcategories
    let contextData = `Company Information:
Techbes is a modern IT service marketplace offering CCTV, Networking, Laptop, Desktop, and Home Automation services.
Working Hours: 9 AM to 8 PM.
Contact: support@techbes.com | +91 9876543210
Warranty: 30 days on service, up to 1 year on parts.
AMC Plans available for CCTV and Networking.

Our available service categories are: `;

    try {
      const categories = await Category.find({ isActive: true }).limit(20);
      const subcategories = await SubCategory.find({ isActive: true }).limit(50);
      
      contextData += categories.map(c => c.name).join(', ') + ". ";
      
      if (subcategories.length > 0) {
        contextData += "\\nOur specific services/packages include: ";
        contextData += subcategories.map(s => s.name).join(', ') + ".";
      }
    } catch (e) {
      contextData += "CCTV Installation, Networking, IT Services. ";
    }
    
    contextData += userContext;
    
    const systemPrompt = `You are the Techbes Smart Service Advisor. 
You act as a friendly, professional assistant for a field service marketplace (Techbes).
Use natural English. Give short answers unless the user asks for details.
Context: \${contextData}
If a user asks about services we offer, use the context provided to inform them.
If they ask for quotation, contact number, AMC, or warranty, provide the relevant details from the context.
If they need help booking, tracking, or pricing, guide them gracefully.
If they have a complaint, or you cannot answer their query after a couple of tries, explicitly suggest creating a support ticket.

ACTIONS:
If the user's intent matches one of the following, append the exact token to your reply:
- Wants to track a booking: ||ACTION:TRACK_BOOKING||
- Wants to book a service: ||ACTION:BOOK_SERVICE||
- Wants to open wallet: ||ACTION:OPEN_WALLET||
- Wants to contact support/create ticket: ||ACTION:CONTACT_SUPPORT||
- Wants to go to dashboard: ||ACTION:OPEN_DASHBOARD||`;

    // Strict Gemini check
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'mock-key' || process.env.GEMINI_API_KEY === '') {
      console.warn("WARNING: GEMINI_API_KEY is missing or invalid. AI Chatbot is running in Demo Mode.");
      return res.json({
        success: true,
        data: {
          reply: `I understand you need help with: "\${userMessage}". As a Smart Service Advisor, I can recommend exploring our CCTV or Networking packages based on your request. (Demo Mode Active)`
        }
      });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // Build history for Gemini
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Understood. I am ready to assist." }] },
        ...messages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }))
      ]
    });

    const result = await chat.sendMessage(userMessage);
    const response = await result.response;
    
    res.json({
      success: true,
      data: { reply: response.text() }
    });

  } catch (error) {
    console.error("AI Service Error:", error);
    res.status(500).json({ success: false, message: 'Failed to process AI request', error: error.message });
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
      messages: [{ sender: req.user.id, text: "Automated Handoff Log:\\n" + chatLog }]
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
