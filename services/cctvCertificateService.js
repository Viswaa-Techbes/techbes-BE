const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

/**
 * Generates a certificate PDF and returns the local relative URL.
 */
async function generateCertificatePdf({ participantName, programName, issueDate, certificateId }) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
      const outDir = path.join(__dirname, '..', 'uploads', 'certificates');
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `${certificateId}.pdf`);

      const stream = fs.createWriteStream(outPath);
      doc.pipe(stream);

      // Draw background styling
      doc.rect(0, 0, 841.89, 595.28).fill('#0f172a'); // dark premium theme

      // Inner border
      doc.rect(20, 20, 801.89, 555.28).lineWidth(2).stroke('#e2e8f0');
      doc.rect(25, 25, 791.89, 545.28).lineWidth(1).stroke('#e2e8f0');

      // Decorative corner lines (accent)
      doc.rect(15, 15, 40, 40).lineWidth(3).stroke('#e5a833');
      doc.rect(786.89, 15, 40, 40).lineWidth(3).stroke('#e5a833');
      doc.rect(15, 540.28, 40, 40).lineWidth(3).stroke('#e5a833');
      doc.rect(786.89, 540.28, 40, 40).lineWidth(3).stroke('#e5a833');

      // Title / Brand
      doc.fillColor('#e5a833').fontSize(32).text('TECHBES', 50, 60, { align: 'left' });
      doc.fillColor('#ffffff').fontSize(12).text('LEARN. PRACTICE. BUILD.', 50, 100);

      // Certificate Label
      doc.fillColor('#ffffff').fontSize(36).text('CERTIFICATE OF PARTICIPATION', 0, 180, { align: 'center', width: 841.89 });
      
      // Participant presentation text
      doc.fillColor('#94a3b8').fontSize(14).text('This is proudly presented to', 0, 260, { align: 'center', width: 841.89 });
      
      // Name
      doc.fillColor('#e5a833').fontSize(28).text(participantName, 0, 295, { align: 'center', width: 841.89 });

      // Description text
      doc.fillColor('#94a3b8').fontSize(14).text(`for successfully completing the practical training program on`, 0, 350, { align: 'center', width: 841.89 });
      doc.fillColor('#ffffff').fontSize(18).text(programName, 0, 380, { align: 'center', width: 841.89 });

      // Verification QR and ID
      doc.fillColor('#94a3b8').fontSize(11).text(`Certificate ID: ${certificateId}`, 50, 480, { align: 'left' });
      doc.text(`Issue Date: ${new Date(issueDate).toDateString()}`, 50, 500, { align: 'left' });

      // Generate Verification QR Code
      const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const qrData = `${appUrl}/certificate/${certificateId}`;
      const qrBuffer = await QRCode.toBuffer(qrData, { margin: 1, color: { dark: '#ffffff', light: '#0f172a' } });
      
      doc.image(qrBuffer, 670, 430, { width: 100, height: 100 });

      doc.end();

      stream.on('finish', () => {
        resolve(`/uploads/certificates/${certificateId}.pdf`);
      });
      stream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateCertificatePdf
};
