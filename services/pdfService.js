const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { uploadToCloudinary } = require('../utils/cloudinary');

/**
 * Downloads an image from Cloudinary or an external URL to a buffer.
 */
async function fetchImageBuffer(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error(`Error downloading image from ${url}:`, err.message);
    return null;
  }
}

/**
 * Generates a professional digital worksheet PDF and uploads it to Cloudinary.
 * 
 * @param {object} worksheet - The ServiceWorksheet Mongoose document
 * @param {object} job - The Job Mongoose document
 * @returns {Promise<string>} - The uploaded PDF URL
 */
async function generateWorksheetPdf(worksheet, job) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);
          const fileName = `Worksheet_${worksheet.worksheetNumber}.pdf`;
          const uploadResult = await uploadToCloudinary(pdfBuffer, fileName);
          resolve(uploadResult.secure_url);
        } catch (uploadErr) {
          reject(uploadErr);
        }
      });

      // --- COLORS & STYLING ---
      const primaryColor = '#0f172a'; // Slate 900
      const secondaryColor = '#2563eb'; // Blue 600
      const lightBg = '#f8fafc'; // Slate 50
      const borderColor = '#cbd5e1'; // Slate 300
      const darkText = '#334155'; // Slate 700

      // --- HEADER & LOGO ---
      // Try to load Techbes logo if available
      const logoPath = path.join(__dirname, '../../main_app/public/logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 40, 35, { width: 50 });
        doc.fontSize(22).fillColor(primaryColor).text('TECHBES', 100, 40, { font: 'Helvetica-Bold' });
      } else {
        doc.fontSize(22).fillColor(primaryColor).text('TECHBES', 40, 40, { font: 'Helvetica-Bold' });
      }
      
      doc.fontSize(10).fillColor('#64748b').text('Premium Field Service Platform', doc.x, doc.y - 2);

      // Worksheet number block on the right
      doc.fontSize(14).fillColor(secondaryColor).text(`WORKSHEET: ${worksheet.worksheetNumber}`, 350, 40, { align: 'right', font: 'Helvetica-Bold' });
      doc.fontSize(10).fillColor(darkText).text(`Date: ${new Date(worksheet.createdAt).toLocaleDateString('en-IN')}`, 350, 58, { align: 'right' });
      
      // Horizontal separator line
      doc.moveTo(40, 85).lineTo(555, 85).strokeColor(secondaryColor).lineWidth(2).stroke();

      // --- SECTION 1: CUSTOMER & TECHNICIAN DETAILS ---
      doc.fontSize(12).fillColor(primaryColor).text('Service Summary Details', 40, 105, { font: 'Helvetica-Bold' });
      
      // Background box for details
      doc.rect(40, 120, 515, 90).fill(lightBg);
      doc.lineWidth(1).strokeColor(borderColor).rect(40, 120, 515, 90).stroke();

      // Customer Details (Left side)
      doc.fillColor(primaryColor).fontSize(10).text('CUSTOMER DETAILS', 55, 130, { font: 'Helvetica-Bold' });
      doc.fillColor(darkText).text(`Name: ${worksheet.customerName || 'N/A'}`, 55, 148);
      doc.text(`Mobile: ${worksheet.customerMobile || 'N/A'}`, 55, 163);
      doc.text(`Address: ${worksheet.customerAddress || 'N/A'}`, 55, 178, { width: 230, height: 30 });

      // Job/Technician Details (Right side)
      doc.fillColor(primaryColor).text('JOB / TECHNICIAN DETAILS', 310, 130, { font: 'Helvetica-Bold' });
      doc.fillColor(darkText).text(`Booking No: ${worksheet.bookingId || 'N/A'}`, 310, 148);
      doc.text(`Service Type: ${worksheet.serviceType ? worksheet.serviceType.toUpperCase() : 'N/A'}`, 310, 163);
      doc.text(`Technician: ${worksheet.customerName ? (job.assignedTechnician?.name || 'Assigned Technician') : 'N/A'}`, 310, 178);

      // --- SECTION 2: WORK DESCRIPTION & OBSERVATIONS ---
      doc.fontSize(12).fillColor(primaryColor).text('Requested Work & Observations', 40, 230, { font: 'Helvetica-Bold' });
      
      doc.rect(40, 245, 515, 65).fill(lightBg);
      doc.rect(40, 245, 515, 65).strokeColor(borderColor).stroke();

      doc.fillColor(primaryColor).fontSize(9).text('REQUESTED WORK DESCRIPTION', 55, 255, { font: 'Helvetica-Bold' });
      doc.fillColor(darkText).fontSize(10).text(worksheet.requestedWorkDescription || 'No description provided.', 55, 270, { width: 480, height: 35 });

      doc.fontSize(12).fillColor(primaryColor).text('Technician Field Findings', 40, 330, { font: 'Helvetica-Bold' });
      
      doc.rect(40, 345, 515, 65).fill(lightBg);
      doc.rect(40, 345, 515, 65).strokeColor(borderColor).stroke();

      doc.fillColor(primaryColor).fontSize(9).text('DIAGNOSTIC FINDINGS & OBSERVATIONS', 55, 355, { font: 'Helvetica-Bold' });
      doc.fillColor(darkText).fontSize(10).text(worksheet.technicianObservations || 'No observations recorded.', 55, 370, { width: 480, height: 35 });

      // --- SECTION 3: MATERIALS USED ---
      doc.fontSize(12).fillColor(primaryColor).text('Materials & Parts Installed', 40, 430, { font: 'Helvetica-Bold' });
      
      // Table Header
      let tableY = 445;
      doc.rect(40, tableY, 515, 20).fill(secondaryColor);
      doc.fillColor('#ffffff').fontSize(9).text('Item Name', 50, tableY + 6, { font: 'Helvetica-Bold' });
      doc.text('Category', 200, tableY + 6, { font: 'Helvetica-Bold' });
      doc.text('Qty', 330, tableY + 6, { font: 'Helvetica-Bold' });
      doc.text('Unit', 370, tableY + 6, { font: 'Helvetica-Bold' });
      doc.text('Unit Price', 420, tableY + 6, { font: 'Helvetica-Bold' });
      doc.text('Total Amount', 490, tableY + 6, { font: 'Helvetica-Bold' });

      // Table Rows
      let rowY = tableY + 20;
      const materials = worksheet.materialsUsed || [];
      if (materials.length === 0) {
        doc.rect(40, rowY, 515, 20).fill('#ffffff');
        doc.rect(40, rowY, 515, 20).strokeColor(borderColor).stroke();
        doc.fillColor(darkText).text('No materials reported.', 50, rowY + 6);
        rowY += 20;
      } else {
        materials.forEach((mat, idx) => {
          doc.rect(40, rowY, 515, 22).fill(idx % 2 === 0 ? '#ffffff' : '#f1f5f9');
          doc.rect(40, rowY, 515, 22).strokeColor(borderColor).stroke();
          
          doc.fillColor(darkText).text(`${mat.name}`, 50, rowY + 7, { width: 140, height: 15 });
          doc.text(`${mat.category || mat.brand || '-'}`, 200, rowY + 7, { width: 120, height: 15 });
          doc.text(`${mat.quantity}`, 330, rowY + 7);
          doc.text(`${mat.unit || 'Piece'}`, 370, rowY + 7);
          doc.text(`INR ${mat.unitPrice || mat.unitCost || 0}`, 420, rowY + 7);
          doc.text(`INR ${mat.total || mat.totalCost || 0}`, 490, rowY + 7);
          
          rowY += 22;
        });
      }

      // Add a page break for Photos and Signatures
      doc.addPage();

      // --- SECTION 4: PHOTO GALLERY ---
      doc.fontSize(12).fillColor(primaryColor).text('Site Work Photos Gallery', 40, 40, { font: 'Helvetica-Bold' });
      
      let photoY = 60;
      // Before Work Photo
      doc.rect(40, photoY, 160, 150).fill(lightBg);
      doc.rect(40, photoY, 160, 150).strokeColor(borderColor).stroke();
      doc.fillColor(primaryColor).fontSize(9).text('BEFORE WORK PHOTO', 45, photoY + 10, { align: 'center', font: 'Helvetica-Bold' });
      
      if (worksheet.beforePhotos && worksheet.beforePhotos.length > 0) {
        const buf = await fetchImageBuffer(worksheet.beforePhotos[0]);
        if (buf) {
          doc.image(buf, 45, photoY + 25, { width: 150, height: 115 });
        } else {
          doc.fillColor('#ef4444').text('[Image Load Error]', 45, photoY + 60, { align: 'center' });
        }
      } else {
        doc.fillColor('#64748b').text('No photo uploaded', 45, photoY + 60, { align: 'center' });
      }

      // During Work Photo
      doc.rect(215, photoY, 160, 150).fill(lightBg);
      doc.rect(215, photoY, 160, 150).strokeColor(borderColor).stroke();
      doc.fillColor(primaryColor).text('DURING WORK PHOTO', 220, photoY + 10, { align: 'center', font: 'Helvetica-Bold' });
      
      if (worksheet.duringPhotos && worksheet.duringPhotos.length > 0) {
        const buf = await fetchImageBuffer(worksheet.duringPhotos[0]);
        if (buf) {
          doc.image(buf, 220, photoY + 25, { width: 150, height: 115 });
        } else {
          doc.fillColor('#ef4444').text('[Image Load Error]', 220, photoY + 60, { align: 'center' });
        }
      } else {
        doc.fillColor('#64748b').text('No photo uploaded', 220, photoY + 60, { align: 'center' });
      }

      // After Work Photo
      doc.rect(390, photoY, 160, 150).fill(lightBg);
      doc.rect(390, photoY, 160, 150).strokeColor(borderColor).stroke();
      doc.fillColor(primaryColor).text('AFTER WORK PHOTO', 395, photoY + 10, { align: 'center', font: 'Helvetica-Bold' });
      
      if (worksheet.afterPhotos && worksheet.afterPhotos.length > 0) {
        const buf = await fetchImageBuffer(worksheet.afterPhotos[0]);
        if (buf) {
          doc.image(buf, 395, photoY + 25, { width: 150, height: 115 });
        } else {
          doc.fillColor('#ef4444').text('[Image Load Error]', 395, photoY + 60, { align: 'center' });
        }
      } else {
        doc.fillColor('#64748b').text('No photo uploaded', 395, photoY + 60, { align: 'center' });
      }

      // --- SECTION 5: SIGNATURES & VERIFICATION ---
      let sigY = 240;
      doc.fontSize(12).fillColor(primaryColor).text('Signatures & Work Authentication', 40, sigY, { font: 'Helvetica-Bold' });
      
      // Customer Signature Box
      doc.rect(40, sigY + 15, 240, 100).fill(lightBg);
      doc.rect(40, sigY + 15, 240, 100).strokeColor(borderColor).stroke();
      doc.fillColor(primaryColor).fontSize(8).text('CUSTOMER DIGITAL SIGNATURE', 45, sigY + 20, { font: 'Helvetica-Bold' });
      if (worksheet.customerSignatureUrl) {
        const buf = await fetchImageBuffer(worksheet.customerSignatureUrl);
        if (buf) {
          doc.image(buf, 60, sigY + 30, { width: 200, height: 75 });
        }
      } else {
        doc.fillColor('#ef4444').text('Awaiting customer signature', 45, sigY + 60, { align: 'center' });
      }

      // Technician Signature Box
      doc.rect(315, sigY + 15, 240, 100).fill(lightBg);
      doc.rect(315, sigY + 15, 240, 100).strokeColor(borderColor).stroke();
      doc.fillColor(primaryColor).fontSize(8).text('TECHNICIAN DIGITAL SIGNATURE', 320, sigY + 20, { font: 'Helvetica-Bold' });
      if (worksheet.technicianSignatureUrl) {
        const buf = await fetchImageBuffer(worksheet.technicianSignatureUrl);
        if (buf) {
          doc.image(buf, 335, sigY + 30, { width: 200, height: 75 });
        }
      } else {
        doc.fillColor('#ef4444').text('Awaiting technician signature', 320, sigY + 60, { align: 'center' });
      }

      // --- SECTION 6: COST SUMMARY & QR CODE ---
      let sumY = 370;
      doc.fontSize(12).fillColor(primaryColor).text('Cost Summary & Verification', 40, sumY, { font: 'Helvetica-Bold' });
      
      // Left side: cost block
      doc.rect(40, sumY + 15, 300, 120).fill(lightBg);
      doc.rect(40, sumY + 15, 300, 120).strokeColor(borderColor).stroke();
      
      doc.fontSize(10).fillColor(darkText);
      doc.text(`Labour Charges:`, 55, sumY + 30);
      doc.text(`INR ${worksheet.labourCost || 0}`, 220, sumY + 30, { align: 'right', width: 100 });
      
      doc.text(`Materials Subtotal:`, 55, sumY + 50);
      doc.text(`INR ${worksheet.materialCost || 0}`, 220, sumY + 50, { align: 'right', width: 100 });

      doc.moveTo(55, sumY + 75).lineTo(325, sumY + 75).strokeColor(borderColor).lineWidth(1).stroke();
      
      doc.fillColor(primaryColor).fontSize(11).text('Grand Total:', 55, sumY + 85, { font: 'Helvetica-Bold' });
      doc.fillColor(secondaryColor).text(`INR ${worksheet.totalCost || 0}`, 220, sumY + 85, { align: 'right', width: 100, font: 'Helvetica-Bold' });

      doc.fillColor(darkText).fontSize(8).text(`OTP Verified: ${worksheet.completionOtpVerified ? 'Yes (Verified)' : 'No'}`, 55, sumY + 112);
      doc.text(`Time completed: ${worksheet.workEndTime ? new Date(worksheet.workEndTime).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')}`, 55, sumY + 122);

      // Right side: QR Code
      const qrY = sumY + 15;
      doc.rect(370, qrY, 185, 120).fill('#ffffff');
      doc.rect(370, qrY, 185, 120).strokeColor(borderColor).stroke();

      try {
        const qrUrl = worksheet.pdfUrl || `https://techbes.co.in/dashboard/service-report/${worksheet.jobId}`;
        const qrCodeBuffer = await QRCode.toBuffer(qrUrl, { margin: 1, width: 85 });
        doc.image(qrCodeBuffer, 420, qrY + 10);
        doc.fillColor(darkText).fontSize(8).text('Scan to verify worksheet details', 375, qrY + 102, { align: 'center' });
      } catch (qrErr) {
        console.error('Failed to render QR Code in PDF:', qrErr.message);
        doc.fillColor('#ef4444').fontSize(8).text('QR Code generation failed', 375, qrY + 50, { align: 'center' });
      }

      // --- FOOTER ---
      doc.fontSize(8).fillColor('#94a3b8').text('This is a computer-generated digital service worksheet copy powered by Techbes. Subject to terms & conditions.', 40, 560, { align: 'center' });

      doc.end();
    } catch (pdfErr) {
      reject(pdfErr);
    }
  });
}

module.exports = {
  generateWorksheetPdf
};
