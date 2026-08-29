const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../config/db');
const aiService = require('../services/aiService');

async function testQuery(msg) {
  console.log(`\nQuery: "${msg}"`);
  // Mock req and res objects for chatbot endpoint
  const req = {
    body: {
      messages: [{ content: msg }]
    }
  };
  let reply = '';
  const res = {
    status: function(code) {
      console.log(`[Status Code]: ${code}`);
      return this;
    },
    json: function(data) {
      if (data.success) {
        reply = data.data.reply;
      } else {
        reply = `Error: ${data.message}`;
      }
    }
  };
  
  await aiService.processChat(req, res);
  console.log(`Reply:\n----------------------------------\n${reply}\n----------------------------------`);
  return reply;
}

async function run() {
  console.log('--- START CHATBOT AND STARTUP VERIFICATION TEST ---');
  
  // Connect to Database
  console.log('Connecting to MongoDB...');
  await connectDB();
  console.log('MongoDB connected successfully.');

  // 1. Check loaded files
  console.log('Firebase Init status:', require('../config/firebase').isInitialized ? 'Active' : 'Fallback Mode (Safe)');

  // 2. Query Greetings
  await testQuery('Hi, how are you?');

  // 3. Query Brands
  await testQuery('What CCTV brands do you sell?');

  // 4. Query Location
  await testQuery('Do you serve JP Nagar, Bangalore?');

  // 5. Query AMC
  await testQuery('Tell me about your AMC packages');

  // 6. Query Account Recovery
  await testQuery('I forgot my password, how do I reset it?');

  // 7. Query Specific Pricing (camera count match)
  await testQuery('How much for a 3 camera setup?');

  // 8. Query Unrelated Query Fallback
  await testQuery('Who is the president of Mars?');

  console.log('\n--- VERIFICATION TEST COMPLETE ---');
  process.exit(0);
}

run().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
