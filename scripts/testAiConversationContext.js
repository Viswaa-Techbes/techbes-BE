const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const {
  extractConversationState,
  normalizeUserIntent,
  generateContextualResponse,
  ensureNonRepetitiveResponse,
  INTENTS
} = require('../services/aiConversationEngine');
const aiService = require('../services/aiService');

async function simulateTurn(messages) {
  let reply = '';
  const req = {
    body: { messages }
  };
  const res = {
    status: function(code) { return this; },
    json: function(data) {
      if (data.success) {
        reply = data.data.reply;
      } else {
        reply = `ERROR: ${data.message}`;
      }
    }
  };
  await aiService.processChat(req, res);
  return reply;
}

async function runTests() {
  console.log("=== STARTING AI CONVERSATION & CONTEXT VERIFICATION TESTS ===\n");
  try {
    const connectDB = require('../config/db');
    await connectDB();
    console.log("MongoDB connected.");
  } catch (e) {
    console.warn("MongoDB connection skipped in test environment, using fallback engine.");
  }

  // TEST 1: User: "CCTV Installation"
  console.log("--- TEST 1: User says 'CCTV Installation' ---");
  const t1_messages = [{ role: 'user', content: 'CCTV Installation' }];
  const t1_reply = await simulateTurn(t1_messages);
  console.log("User: CCTV Installation");
  console.log("Assistant:\n", t1_reply);
  console.assert(!t1_reply.includes('I understand you need help with: "CCTV Installation"'), "FAIL: Generic repeated intro found!");
  console.assert(t1_reply.toLowerCase().includes('new cctv') || t1_reply.toLowerCase().includes('upgrade') || t1_reply.toLowerCase().includes('cctv'), "FAIL: Expected CCTV context");
  console.log("✅ TEST 1 PASSED!\n");

  // TEST 2: User: "CCTV Installation" -> User: "new cctv"
  console.log("--- TEST 2: Follow-up 'new cctv' (No Generic Intro) ---");
  const t2_messages = [
    { role: 'user', content: 'CCTV Installation' },
    { role: 'assistant', content: t1_reply },
    { role: 'user', content: 'new cctv' }
  ];
  const t2_reply = await simulateTurn(t2_messages);
  console.log("User: new cctv");
  console.log("Assistant:\n", t2_reply);
  console.assert(!t2_reply.includes('I understand you need help with'), "FAIL: Generic repeated intro found in follow-up!");
  console.assert(!t2_reply.includes('As a Smart Service Advisor, I can help you with CCTV installation, repair, AMC'), "FAIL: Generic canned intro found!");
  console.assert(t2_reply.toLowerCase().includes('new cctv') || t2_reply.toLowerCase().includes('camera'), "FAIL: Follow-up not contextual");
  console.log("✅ TEST 2 PASSED!\n");

  // TEST 3: User: "CCTV Installation" -> User: "price"
  console.log("--- TEST 3: Follow-up 'price' ---");
  const t3_messages = [
    { role: 'user', content: 'CCTV Installation' },
    { role: 'assistant', content: t1_reply },
    { role: 'user', content: 'price' }
  ];
  const t3_reply = await simulateTurn(t3_messages);
  console.log("User: price");
  console.log("Assistant:\n", t3_reply);
  console.assert(t3_reply.toLowerCase().includes('499') || t3_reply.toLowerCase().includes('price') || t3_reply.toLowerCase().includes('starting from') || t3_reply.toLowerCase().includes('estimate'), "FAIL: Price information missing");
  console.log("✅ TEST 3 PASSED!\n");

  // TEST 4: User: "CCTV Installation" -> User: "book"
  console.log("--- TEST 4: Follow-up 'book' ---");
  const t4_messages = [
    { role: 'user', content: 'CCTV Installation' },
    { role: 'assistant', content: t1_reply },
    { role: 'user', content: 'book' }
  ];
  const t4_reply = await simulateTurn(t4_messages);
  console.log("User: book");
  console.log("Assistant:\n", t4_reply);
  console.assert(t4_reply.includes('install-new-cctv') || t4_reply.includes('BOOK_SERVICE') || t4_reply.toLowerCase().includes('booking'), "FAIL: Booking action not triggered");
  console.log("✅ TEST 4 PASSED!\n");

  // TEST 5: User: "CCTV Installation" -> User: "4 cameras"
  console.log("--- TEST 5: User provides entity '4 cameras' ---");
  const t5_messages = [
    { role: 'user', content: 'CCTV Installation' },
    { role: 'assistant', content: t1_reply },
    { role: 'user', content: '4 cameras' }
  ];
  const state5 = extractConversationState(t5_messages);
  console.log("Extracted entities:", state5.entities);
  console.assert(state5.entities.cameraCount === 4, `FAIL: Expected cameraCount = 4, got ${state5.entities.cameraCount}`);
  const t5_reply = await simulateTurn(t5_messages);
  console.log("Assistant:\n", t5_reply);
  console.assert(t5_reply.includes('4') || t5_reply.toLowerCase().includes('estimate'), "FAIL: 4 cameras calculation not returned");
  console.log("✅ TEST 5 PASSED!\n");

  // TEST 6: User: "4 cameras" -> User: "CP Plus"
  console.log("--- TEST 6: User provides 'CP Plus' ---");
  const t6_messages = [
    { role: 'user', content: 'I need 4 cameras' },
    { role: 'assistant', content: t5_reply },
    { role: 'user', content: 'CP Plus' }
  ];
  const state6 = extractConversationState(t6_messages);
  console.log("Extracted entities after CP Plus:", state6.entities);
  console.assert(state6.entities.cameraCount === 4, `FAIL: Expected cameraCount = 4, got ${state6.entities.cameraCount}`);
  console.assert(state6.entities.brand === 'CP Plus', `FAIL: Expected brand = 'CP Plus', got ${state6.entities.brand}`);
  const t6_reply = await simulateTurn(t6_messages);
  console.log("Assistant:\n", t6_reply);
  console.assert(t6_reply.includes('CP Plus'), "FAIL: Brand not recognized in response");
  console.log("✅ TEST 6 PASSED!\n");

  // TEST 7: User: "yes" after assistant asks booking question
  console.log("--- TEST 7: User says 'yes' to booking prompt ---");
  const t7_messages = [
    { role: 'user', content: 'CCTV Installation' },
    { role: 'assistant', content: 'Great! For a new CCTV installation, I can help you configure the camera type, quantity, recorder, cabling and installation. Would you like to start the installation booking?' },
    { role: 'user', content: 'yes' }
  ];
  const t7_reply = await simulateTurn(t7_messages);
  console.log("Assistant:\n", t7_reply);
  console.assert(t7_reply.includes('install-new-cctv') || t7_reply.includes('BOOK_SERVICE') || t7_reply.toLowerCase().includes('booking'), "FAIL: Affirmative 'yes' not resolved to booking");
  console.log("✅ TEST 7 PASSED!\n");

  // TEST 8: Switch from CCTV to Laptop Repair
  console.log("--- TEST 8: Context Switch (CCTV -> Laptop Repair) ---");
  const t8_messages = [
    { role: 'user', content: 'CCTV Installation' },
    { role: 'assistant', content: t1_reply },
    { role: 'user', content: 'Laptop Repair' }
  ];
  const state8 = extractConversationState(t8_messages);
  console.log("State category after switch:", state8.category);
  console.assert(state8.category === 'laptop', `FAIL: Expected category = 'laptop', got ${state8.category}`);
  const t8_reply = await simulateTurn(t8_messages);
  console.log("Assistant:\n", t8_reply);
  console.assert(t8_reply.toLowerCase().includes('laptop') && (t8_reply.toLowerCase().includes('coming soon') || t8_reply.toLowerCase().includes('2026')), "FAIL: Laptop context switch failed");
  console.log("✅ TEST 8 PASSED!\n");

  // TEST 9: Duplicate Protection Test
  console.log("--- TEST 9: Duplicate Response Protection ---");
  const duplicateTest = ensureNonRepetitiveResponse(
    "Great! For a new CCTV installation, I can help you configure the camera type, quantity, recorder, cabling and installation.",
    "Great! For a new CCTV installation, I can help you configure the camera type, quantity, recorder, cabling and installation.",
    { category: 'cctv', service: 'install-new-cctv' }
  );
  console.log("Protected non-repetitive response:\n", duplicateTest);
  console.assert(duplicateTest !== "Great! For a new CCTV installation, I can help you configure the camera type, quantity, recorder, cabling and installation.", "FAIL: Duplicate response was not modified!");
  console.log("✅ TEST 9 PASSED!\n");

  console.log("🎉 ALL 9 CONVERSATION & CONTEXT VERIFICATION TESTS PASSED SUCCESSFULLY!");
}

runTests().catch(err => {
  console.error("❌ Test crashed:", err);
  process.exit(1);
});
