const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Converts a number to Indian Rupees words (e.g., 31954 -> Thirty-One Thousand Nine Hundred Fifty-Four)
 */
function numberToWordsINR(amount) {
  const num = Math.round(Math.abs(amount));
  if (num === 0) return 'Zero Rupees Only';

  const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teenDigits = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tensDigits = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n) {
    if (n === 0) return '';
    if (n < 10) return singleDigits[n];
    if (n < 20) return teenDigits[n - 10];
    const tens = Math.floor(n / 10);
    const rest = n % 10;
    return rest > 0 ? `${tensDigits[tens]} ${singleDigits[rest]}` : tensDigits[tens];
  }

  function convertThreeDigits(n) {
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;
    let str = '';
    if (hundreds > 0) {
      str += `${singleDigits[hundreds]} Hundred`;
      if (remainder > 0) str += ' and ';
    }
    if (remainder > 0) {
      str += convertTwoDigits(remainder);
    }
    return str;
  }

  const crore = Math.floor(num / 10000000);
  let rem = num % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;
  const hundredAndBelow = rem;

  const parts = [];
  if (crore > 0) parts.push(`${convertThreeDigits(crore)} Crore`);
  if (lakh > 0) parts.push(`${convertThreeDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${convertThreeDigits(thousand)} Thousand`);
  if (hundredAndBelow > 0) parts.push(convertThreeDigits(hundredAndBelow));

  return `${parts.join(' ')} Rupees Only`;
}

/**
 * Formats a currency amount into standard Indian Rupee format (e.g. ₹31,954.40)
 */
function formatINR(val) {
  const num = typeof val === 'number' ? val : parseFloat(val) || 0;
  return 'Rs. ' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats a Date object or ISO string to standard DD MMM YYYY (e.g., 17 Oct 2026)
 */
function formatDate(d) {
  if (!d) return 'N/A';
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return 'N/A';
  return dateObj.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Generates an authoritative, beautifully branded TechBes Quotation PDF buffer.
 * 
 * @param {object} quote - The QuoteRequest document / object
 * @returns {Promise<Buffer>} - Raw PDF buffer
 */
async function generateQuotationPdfBuffer(quote) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 36,
        size: 'A4',
        bufferPages: true,
        info: {
          Title: `TechBes Quotation - ${quote.requestId || 'Quotation'}`,
          Author: 'TechBes Services Private Limited',
          Subject: `Quotation for ${quote.fullName || 'Customer'}`,
          Keywords: 'Quotation, TechBes, CCTV, Security Systems',
          CreationDate: new Date(),
        },
      });

      const buffers = [];
      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', err => reject(err));

      // --- COLOR PALETTE ---
      const navyPrimary = '#0f172a';
      const blueAccent = '#2563eb';
      const slateDark = '#1e293b';
      const slateMedium = '#475569';
      const slateLight = '#64748b';
      const bgGray = '#f8fafc';
      const borderGray = '#e2e8f0';

      // --- ASSET LOCATIONS ---
      const possibleLogoPaths = [
        path.join(__dirname, '../../admin/public/logo.png'),
        path.join(__dirname, '../../main_app/public/logo.png'),
        path.join(__dirname, '../public/logo.png'),
      ];
      let logoPath = possibleLogoPaths.find(p => fs.existsSync(p));

      // Helper for drawing table headers
      function drawTableHeader(y) {
        doc.rect(36, y, 523, 22).fill(navyPrimary);
        doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
        doc.text('#', 44, y + 6, { width: 20 });
        doc.text('DESCRIPTION & SPECIFICATIONS', 70, y + 6, { width: 240 });
        doc.text('QTY', 315, y + 6, { width: 45, align: 'center' });
        doc.text('UNIT PRICE', 365, y + 6, { width: 85, align: 'right' });
        doc.text('TOTAL (INR)', 455, y + 6, { width: 95, align: 'right' });
        doc.font('Helvetica');
      }

      // --- HEADER SECTION ---
      let startY = 36;
      if (logoPath) {
        try {
          doc.image(logoPath, 36, startY, { width: 48 });
        } catch (_) {
          logoPath = null;
        }
      }

      const brandTextX = logoPath ? 92 : 36;
      doc.fontSize(18).fillColor(navyPrimary).font('Helvetica-Bold').text('TECHBES', brandTextX, startY);
      doc.fontSize(8).fillColor(blueAccent).font('Helvetica-Bold').text('SERVICES PRIVATE LIMITED', brandTextX, startY + 18);
      doc.fontSize(7.5).fillColor(slateLight).font('Helvetica').text('Smart Security & IoT Solutions | Premium Field Services', brandTextX, startY + 28);
      doc.text('GSTIN: 29AABCT1234F1Z5 | support@techbes.co.in | +91 91080 34888 | www.techbes.co.in', brandTextX, startY + 38);

      // Top Right: Quotation Badge & Meta
      doc.rect(395, startY, 164, 52).fillAndStroke(bgGray, borderGray);
      doc.fontSize(12).fillColor(blueAccent).font('Helvetica-Bold').text('QUOTATION', 400, startY + 6, { align: 'right', width: 150 });
      doc.fontSize(8).fillColor(navyPrimary).font('Helvetica-Bold').text(`Ref: ${quote.requestId || 'QT-DRAFT'}`, 400, startY + 22, { align: 'right', width: 150 });
      
      const issueDate = formatDate(quote.sentAt || quote.createdAt || new Date());
      const validDays = quote.validityDays || 15;
      const validUntilDate = quote.validUntil 
        ? formatDate(quote.validUntil)
        : formatDate(new Date(Date.now() + validDays * 24 * 60 * 60 * 1000));

      doc.fontSize(7.5).fillColor(slateMedium).font('Helvetica').text(`Date: ${issueDate}`, 400, startY + 32, { align: 'right', width: 150 });
      doc.text(`Valid Until: ${validUntilDate} (${validDays} Days)`, 400, startY + 41, { align: 'right', width: 150 });

      // Subtle horizontal accent line
      doc.moveTo(36, 96).lineTo(559, 96).strokeColor(blueAccent).lineWidth(1.5).stroke();

      // --- SECTION: CLIENT & SITE DETAILS ---
      const detailsBoxY = 104;
      const boxHeight = 78;
      doc.rect(36, detailsBoxY, 258, boxHeight).fillAndStroke(bgGray, borderGray);
      doc.rect(301, detailsBoxY, 258, boxHeight).fillAndStroke(bgGray, borderGray);

      // Left Box: Customer Details
      doc.fillColor(navyPrimary).fontSize(8.5).font('Helvetica-Bold').text('CUSTOMER / BILL TO', 44, detailsBoxY + 8);
      doc.fillColor(slateDark).fontSize(8).font('Helvetica-Bold').text(quote.fullName || 'Customer', 44, detailsBoxY + 22);
      
      doc.fillColor(slateMedium).font('Helvetica').fontSize(7.5);
      doc.text(`Mobile: ${quote.mobile || 'N/A'}${quote.whatsapp ? ` (WA: ${quote.whatsapp})` : ''}`, 44, detailsBoxY + 34);
      if (quote.email) {
        doc.text(`Email: ${quote.email}`, 44, detailsBoxY + 44);
      }
      const fullAddress = [quote.address, quote.locality, quote.pincode].filter(Boolean).join(', ');
      doc.text(`Address: ${fullAddress || 'Bangalore'}`, 44, quote.email ? detailsBoxY + 54 : detailsBoxY + 44, {
        width: 242,
        height: 24,
        ellipsis: true,
      });

      // Right Box: Service & Project Details
      doc.fillColor(navyPrimary).fontSize(8.5).font('Helvetica-Bold').text('PROJECT & REQUIREMENT DETAILS', 309, detailsBoxY + 8);
      doc.fillColor(slateDark).fontSize(8).font('Helvetica');
      doc.text(`Service Category: `, 309, detailsBoxY + 22, { continued: true })
        .font('Helvetica-Bold').text(quote.serviceCategory || 'CCTV');
      
      doc.font('Helvetica').fontSize(7.5);
      if (quote.propertyType) {
        doc.text(`Property Type: `, 309, detailsBoxY + 33, { continued: true })
          .font('Helvetica-Bold').text(quote.propertyType);
      }
      if (quote.cameraCount || quote.cameraRequirement) {
        const camInfo = [quote.cameraCount && `${quote.cameraCount} Cameras`, quote.cameraRequirement].filter(Boolean).join(' - ');
        doc.font('Helvetica').text(`Configuration: ${camInfo}`, 309, detailsBoxY + 44, { width: 242, ellipsis: true });
      } else {
        doc.font('Helvetica').text(`Source: ${quote.source || 'Website Request'}`, 309, detailsBoxY + 44);
      }
      doc.text(`Location: ${quote.locality || 'Bangalore'}`, 309, detailsBoxY + 55);
      if (quote.preferredVisitDate) {
        doc.text(`Requested Visit: ${formatDate(quote.preferredVisitDate)} (${quote.preferredVisitTime || 'Anytime'})`, 309, detailsBoxY + 65);
      }

      // --- SECTION: ITEMIZED QUOTATION TABLE ---
      let currentY = 192;
      drawTableHeader(currentY);
      currentY += 22;

      const items = Array.isArray(quote.items) && quote.items.length > 0 ? quote.items : [];
      let calculatedSubtotal = 0;

      items.forEach((item, index) => {
        // Page break check
        if (currentY > 700) {
          doc.addPage();
          currentY = 36;
          drawTableHeader(currentY);
          currentY += 22;
        }

        const qty = item.quantity || 1;
        const unitPrice = typeof item.unitPrice === 'number' ? item.unitPrice : (parseFloat(item.unitPrice) || 0);
        const lineTotal = typeof item.lineTotal === 'number' && item.lineTotal > 0 ? item.lineTotal : qty * unitPrice;
        calculatedSubtotal += lineTotal;

        const isAlt = index % 2 === 1;
        const rowHeight = 24;

        if (isAlt) {
          doc.rect(36, currentY, 523, rowHeight).fill('#fafafa');
        }
        doc.rect(36, currentY, 523, rowHeight).strokeColor(borderGray).lineWidth(0.5).stroke();

        // Index
        doc.fillColor(slateLight).fontSize(8).font('Helvetica').text(String(index + 1), 44, currentY + 7, { width: 20 });

        // Item Name & Variant
        const productName = item.productName || item.name || 'Equipment / Service';
        const itemSpecs = [item.brand, item.variant, item.sku].filter(Boolean).join(' | ');

        doc.fillColor(navyPrimary).fontSize(8).font('Helvetica-Bold').text(productName, 70, currentY + 4, {
          width: 240,
          height: 10,
          ellipsis: true,
        });

        if (itemSpecs) {
          doc.fillColor(slateLight).fontSize(6.5).font('Helvetica').text(itemSpecs, 70, currentY + 14, {
            width: 240,
            height: 8,
            ellipsis: true,
          });
        }

        // Qty
        doc.fillColor(slateDark).fontSize(8).font('Helvetica').text(String(qty), 315, currentY + 7, { width: 45, align: 'center' });

        // Unit Price
        doc.text(formatINR(unitPrice).replace('Rs. ', ''), 365, currentY + 7, { width: 85, align: 'right' });

        // Line Total
        doc.fillColor(navyPrimary).font('Helvetica-Bold').text(formatINR(lineTotal).replace('Rs. ', ''), 455, currentY + 7, { width: 95, align: 'right' });

        currentY += rowHeight;
      });

      if (items.length === 0) {
        doc.rect(36, currentY, 523, 30).fillAndStroke(bgGray, borderGray);
        doc.fillColor(slateMedium).fontSize(8.5).font('Helvetica-Oblique')
          .text('No line items recorded for this quotation.', 44, currentY + 10, { align: 'center', width: 507 });
        currentY += 30;
      }

      // --- SECTION: TOTALS & SUMMARY ---
      // Page break check if remaining space is insufficient for totals and terms
      if (currentY > 620) {
        doc.addPage();
        currentY = 36;
      }

      const summaryY = currentY + 10;
      const finalSubtotal = quote.subtotal && quote.subtotal > 0 ? quote.subtotal : calculatedSubtotal;
      const gstRateVal = typeof quote.gstRate === 'number' ? quote.gstRate : 18;
      const gstAmountVal = typeof quote.gstAmount === 'number' && quote.gstAmount >= 0 
        ? quote.gstAmount 
        : Math.round(finalSubtotal * (gstRateVal / 100) * 100) / 100;
      const grandTotalVal = typeof quote.finalAmount === 'number' && quote.finalAmount > 0 
        ? quote.finalAmount 
        : finalSubtotal + gstAmountVal;

      // Left Box: Amount in words & Bank info
      doc.rect(36, summaryY, 290, 84).fillAndStroke(bgGray, borderGray);
      doc.fillColor(navyPrimary).fontSize(7.5).font('Helvetica-Bold').text('AMOUNT IN WORDS:', 44, summaryY + 8);
      doc.fillColor(slateDark).fontSize(8).font('Helvetica-Bold').text(numberToWordsINR(grandTotalVal), 44, summaryY + 19, { width: 274 });

      doc.fillColor(navyPrimary).fontSize(7.5).font('Helvetica-Bold').text('PAYMENT DETAILS / DIGITAL GATEWAY:', 44, summaryY + 42);
      doc.fillColor(slateMedium).fontSize(7).font('Helvetica');
      doc.text('Beneficiary: TECHBES SERVICES PRIVATE LIMITED', 44, summaryY + 52);
      doc.text('Digital Gateway: Razorpay Instant UPI / Net Banking / Cards', 44, summaryY + 61);
      doc.text('Online Payment Link available in customer portal dashboard.', 44, summaryY + 70);

      // Right Box: Totals breakdown
      doc.rect(336, summaryY, 223, 84).fillAndStroke(bgGray, borderGray);
      let rY = summaryY + 6;

      // Subtotal
      doc.fillColor(slateMedium).fontSize(7.5).font('Helvetica').text('Taxable Subtotal:', 344, rY);
      doc.fillColor(slateDark).font('Helvetica-Bold').text(formatINR(finalSubtotal), 430, rY, { width: 120, align: 'right' });
      rY += 13;

      // GST Breakdown (CGST + SGST if applicable)
      if (gstRateVal > 0) {
        const halfGstRate = gstRateVal / 2;
        const halfGstAmount = gstAmountVal / 2;

        doc.fillColor(slateMedium).font('Helvetica').text(`CGST (${halfGstRate}%):`, 344, rY);
        doc.fillColor(slateDark).font('Helvetica').text(formatINR(halfGstAmount), 430, rY, { width: 120, align: 'right' });
        rY += 12;

        doc.fillColor(slateMedium).font('Helvetica').text(`SGST (${halfGstRate}%):`, 344, rY);
        doc.fillColor(slateDark).font('Helvetica').text(formatINR(halfGstAmount), 430, rY, { width: 120, align: 'right' });
        rY += 12;
      } else {
        doc.fillColor(slateMedium).font('Helvetica').text('GST (0% - Exempt):', 344, rY);
        doc.fillColor(slateDark).font('Helvetica').text('Rs. 0.00', 430, rY, { width: 120, align: 'right' });
        rY += 14;
      }

      // Grand Total Highlight Bar
      doc.rect(336, summaryY + 54, 223, 30).fill(navyPrimary);
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text('GRAND TOTAL:', 344, summaryY + 64);
      doc.fillColor('#38bdf8').fontSize(11).font('Helvetica-Bold').text(formatINR(grandTotalVal), 420, summaryY + 63, { width: 130, align: 'right' });

      // --- SECTION: TERMS AND CONDITIONS ---
      const termsY = summaryY + 94;
      doc.fillColor(navyPrimary).fontSize(8).font('Helvetica-Bold').text('TERMS & CONDITIONS:', 36, termsY);

      const defaultTerms = [
        '1. 50% advance on order confirmation, remaining balance payable upon work completion and testing.',
        '2. Warranty: 1-Year manufacturer warranty on cameras & active electronics. Physical damage and surges excluded.',
        '3. Cabling and PVC conduits will be billed based on actual on-site measurement if exceeding estimate.',
        '4. Quotation validity: Valid for 15 days from issuance date. Prices subject to change thereafter.',
        '5. Customer to provide electricity and required ladder/access permissions during installation.',
      ];

      const customTerms = quote.terms && quote.terms.trim() ? quote.terms.split('\n').filter(t => t.trim()) : [];
      const termsList = customTerms.length > 0 ? customTerms : defaultTerms;

      let currentTermY = termsY + 12;
      doc.fillColor(slateMedium).fontSize(6.5).font('Helvetica');
      termsList.slice(0, 5).forEach(term => {
        doc.text(term.trim(), 36, currentTermY, { width: 360 });
        currentTermY += 10;
      });

      // Right: Signatory / Company Stamp block
      const sigX = 410;
      const sigY = termsY + 6;
      doc.fillColor(navyPrimary).fontSize(7.5).font('Helvetica-Bold').text('For TECHBES SERVICES PVT LTD', sigX, sigY, { width: 149, align: 'center' });
      doc.fontSize(6).fillColor(slateLight).font('Helvetica-Oblique').text('(Authorized Signatory / Digitally Generated)', sigX, sigY + 36, { width: 149, align: 'center' });

      // --- FOOTER ACROSS ALL BUFFERED PAGES ---
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.moveTo(36, 804).lineTo(559, 804).strokeColor(borderGray).lineWidth(0.5).stroke();
        doc.fillColor(slateLight).fontSize(7).font('Helvetica');
        doc.text(
          `TechBes Quotation #${quote.requestId || 'QT'} | Computer generated document — no physical signature required.`,
          36,
          810,
          { width: 360 }
        );
        doc.text(`Page ${i + 1} of ${pages.count}`, 400, 810, { width: 159, align: 'right' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateQuotationPdfBuffer,
  numberToWordsINR,
  formatINR,
};
