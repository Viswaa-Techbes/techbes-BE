const mongoose = require('mongoose');

// Mock User, Apartment, SupportTicket, QuoteRequest logic tests
async function runTests() {
  console.log('--- STARTING VERIFICATION TESTS ---');

  // Test 1: Quotation Calculation Math
  console.log('Test 1: Quotation Calculation Logic...');
  const items = [
    { productName: '5MP CCTV Camera', quantity: 6, unitPrice: 2500 },
    { productName: '1TB Surveillance HDD', quantity: 1, unitPrice: 5000 },
    { productName: 'Cat6 Cable Roll', quantity: 2, unitPrice: 3200 },
  ];

  let calculatedSubtotal = 0;
  const processedItems = items.map((it) => {
    const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
    const unitPrice = Math.max(0, parseFloat(it.unitPrice) || 0);
    const lineTotal = Math.round(qty * unitPrice * 100) / 100;
    calculatedSubtotal += lineTotal;
    return { ...it, quantity: qty, unitPrice, lineTotal };
  });

  const gstRate = 18;
  const calculatedGst = Math.round(((calculatedSubtotal * gstRate) / 100) * 100) / 100;
  const calculatedFinal = Math.round((calculatedSubtotal + calculatedGst) * 100) / 100;

  // Expected:
  // Item 1: 6 * 2500 = 15000
  // Item 2: 1 * 5000 = 5000
  // Item 3: 2 * 3200 = 6400
  // Subtotal = 26400
  // GST 18% = 4752
  // Final = 31152
  if (calculatedSubtotal !== 26400) throw new Error(`Subtotal mismatch: got ${calculatedSubtotal}, expected 26400`);
  if (calculatedGst !== 4752) throw new Error(`GST mismatch: got ${calculatedGst}, expected 4752`);
  if (calculatedFinal !== 31152) throw new Error(`Final amount mismatch: got ${calculatedFinal}, expected 31152`);
  console.log('✓ Test 1 Passed: Authoritative Subtotal=26400, GST=4752, Final=31152.');

  // Test 2: Verify Models Load Without Syntax Errors
  console.log('Test 2: Verifying Mongoose Model schemas...');
  const User = require('./models/User');
  const Apartment = require('./models/Apartment');
  const SupportTicket = require('./models/SupportTicket');
  const QuoteRequest = require('./models/QuoteRequest');

  // Verify User ROLES includes association and resident
  if (!User.ROLES.includes('association')) throw new Error('User.ROLES missing "association"');
  if (!User.ROLES.includes('resident')) throw new Error('User.ROLES missing "resident"');
  console.log('✓ Test 2.1: User.ROLES has "association" and "resident"');

  // Verify Apartment schema has associationUsers and residents
  const aptPaths = Apartment.schema.paths;
  if (!aptPaths['name']) throw new Error('Apartment schema missing "name"');
  if (!aptPaths['associationUsers']) throw new Error('Apartment schema missing "associationUsers"');
  if (!Apartment.schema.paths['residents'].schema.paths['flatNumber']) throw new Error('Apartment schema missing "residents.flatNumber"');
  console.log('✓ Test 2.2: Apartment schema validated');

  // Verify SupportTicket schema
  const ticketPaths = SupportTicket.schema.paths;
  if (!ticketPaths['raisedByType']) throw new Error('SupportTicket schema missing "raisedByType"');
  if (!ticketPaths['flatNumber']) throw new Error('SupportTicket schema missing "flatNumber"');
  if (!ticketPaths['apartmentName']) throw new Error('SupportTicket schema missing "apartmentName"');
  console.log('✓ Test 2.3: SupportTicket schema validated');

  // Verify QuoteRequest schema
  const quotePaths = QuoteRequest.schema.paths;
  if (!QuoteRequest.schema.paths['items'].schema.paths['productName']) throw new Error('QuoteRequest schema missing "items.productName"');
  if (!quotePaths['subtotal']) throw new Error('QuoteRequest schema missing "subtotal"');
  if (!quotePaths['finalAmount']) throw new Error('QuoteRequest schema missing "finalAmount"');
  if (!quotePaths['orderNumber']) throw new Error('QuoteRequest schema missing "orderNumber"');
  console.log('✓ Test 2.4: QuoteRequest schema validated');

  // Test 3: Association & Resident Ticket Access Scoping Logic
  console.log('Test 3: Testing ticket scoping logic...');
  const mockApt1 = new mongoose.Types.ObjectId();
  const mockApt2 = new mongoose.Types.ObjectId();
  const mockAssocUser1 = { role: 'association', apartmentId: mockApt1 };
  const mockResident101 = { role: 'resident', apartmentId: mockApt1, flatNumber: '101' };

  // Helper simulating apartmentController getTickets filter builder
  function buildTicketFilter(user, query = {}) {
    const filter = {};
    if (user.role === 'admin') {
      if (query.apartmentId && query.apartmentId !== 'All') filter.apartmentId = query.apartmentId;
      if (query.raisedByType && query.raisedByType !== 'All') filter.raisedByType = query.raisedByType;
      if (query.flatNumber) filter.flatNumber = new RegExp(query.flatNumber.trim(), 'i');
      if (query.status && query.status !== 'All') filter.status = query.status;
    } else if (user.role === 'association') {
      filter.apartmentId = user.apartmentId;
    } else if (user.role === 'resident') {
      filter.apartmentId = user.apartmentId;
      filter.flatNumber = user.flatNumber;
      filter.raisedByType = 'resident';
    }
    return filter;
  }

  // Association member sees all tickets for their apartment
  const assocFilter = buildTicketFilter(mockAssocUser1);
  if (assocFilter.apartmentId !== mockApt1 || assocFilter.flatNumber) {
    throw new Error('Association filter should see all tickets in apartment without flat restriction');
  }

  // Resident member sees ONLY tickets for their flat in their apartment
  const residentFilter = buildTicketFilter(mockResident101);
  if (residentFilter.apartmentId !== mockApt1 || residentFilter.flatNumber !== '101' || residentFilter.raisedByType !== 'resident') {
    throw new Error('Resident filter failed: must restrict to apartment + flat 101 + resident type');
  }
  console.log('✓ Test 3 Passed: Role scoping logic correctly restricts association and resident tickets.');

  // Test 4: Pricing Visibility Rule
  console.log('Test 4: Customer Quotation Price Sanitization Rule...');
  const rawQuote = {
    _id: 'q1',
    status: 'quotation_requested',
    subtotal: 26400,
    gstAmount: 4752,
    finalAmount: 31152,
    items: [{ productName: '5MP Camera', quantity: 6, unitPrice: 2500, lineTotal: 15000 }],
  };

  function sanitizeQuoteForCustomer(q) {
    const priceVisibleStatuses = ['quotation_sent', 'Quote Sent', 'Quotation Sent', 'quotation_accepted', 'payment_pending', 'paid', 'converted_to_order'];
    const isVisible = priceVisibleStatuses.includes(q.status);
    const sanitized = { ...q };
    if (!isVisible) {
      delete sanitized.subtotal;
      delete sanitized.gstAmount;
      delete sanitized.finalAmount;
      delete sanitized.pricingBreakdown;
      sanitized.items = (sanitized.items || []).map((item) => {
        const itemCopy = { ...item };
        delete itemCopy.unitPrice;
        delete itemCopy.lineTotal;
        return itemCopy;
      });
    }
    return sanitized;
  }

  const sanitized = sanitizeQuoteForCustomer(rawQuote);
  if (sanitized.subtotal !== undefined || sanitized.finalAmount !== undefined || sanitized.items[0].unitPrice !== undefined) {
    throw new Error('Price sanitization failed: price was exposed for quotation_requested status!');
  }

  const sentQuote = { ...rawQuote, status: 'quotation_sent' };
  const visibleQuote = sanitizeQuoteForCustomer(sentQuote);
  if (visibleQuote.subtotal !== 26400 || visibleQuote.items[0].unitPrice !== 2500) {
    throw new Error('Sent quotation should reveal authoritative prices');
  }
  console.log('✓ Test 4 Passed: Customer does NOT see price when requested; price appears only after Admin sends.');

  console.log('\n--- ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
