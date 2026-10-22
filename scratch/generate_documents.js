const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const PDFDocument = require(path.join(__dirname, '../node_modules/pdfkit'));

// Helper to create a standard OpenXML DOCX file without external npm dependencies
function createDocx(markdownText, outputPath) {
  const lines = markdownText.split('\n');
  let bodyXml = '';

  function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  let inTable = false;
  let tableRows = [];

  function flushTable() {
    if (!inTable || tableRows.length === 0) return;
    bodyXml += '<w:tbl>';
    bodyXml += '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:left w:val="none"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:right w:val="none"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="EEEEEE"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr>';
    
    tableRows.forEach((row, rIdx) => {
      bodyXml += '<w:tr>';
      row.forEach(cell => {
        const isHeader = rIdx === 0;
        const bg = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="0F172A"/>' : '';
        const color = isHeader ? '<w:color w:val="FFFFFF"/>' : '<w:color w:val="1E293B"/>';
        const bold = isHeader ? '<w:b/>' : '';
        bodyXml += `<w:tc><w:tcPr>${bg}<w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:rPr>${bold}${color}<w:sz w:val="18"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`;
      });
      bodyXml += '</w:tr>';
    });

    bodyXml += '</w:tbl><w:p/>';
    tableRows = [];
    inTable = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Check if table row
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Check if separator row (|---|---|)
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
        continue;
      }
      inTable = true;
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim().replace(/\*\*/g, ''));
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (!trimmed) {
      bodyXml += '<w:p/>';
      continue;
    }

    // Heading 1
    if (trimmed.startsWith('# ')) {
      const text = trimmed.substring(2).replace(/\*\*/g, '');
      bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="300" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="0F172A"/><w:sz w:val="36"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
    }
    // Heading 2
    else if (trimmed.startsWith('## ')) {
      const text = trimmed.substring(3).replace(/\*\*/g, '');
      bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="240" w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="2563EB"/><w:sz w:val="28"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
    }
    // Heading 3
    else if (trimmed.startsWith('### ')) {
      const text = trimmed.substring(4).replace(/\*\*/g, '');
      bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading3"/><w:spacing w:before="180" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1E293B"/><w:sz w:val="24"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
    }
    // Heading 4
    else if (trimmed.startsWith('#### ')) {
      const text = trimmed.substring(5).replace(/\*\*/g, '');
      bodyXml += `<w:p><w:pPr><w:spacing w:before="140" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="334155"/><w:sz w:val="22"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
    }
    // Bullet item
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const text = trimmed.substring(2).replace(/\*\*/g, '');
      bodyXml += `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="334155"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>• ${escapeXml(text)}</w:t></w:r></w:p>`;
    }
    // Numbered item
    else if (/^\d+\.\s/.test(trimmed)) {
      const text = trimmed.replace(/^\d+\.\s/, '').replace(/\*\*/g, '');
      bodyXml += `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="334155"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(trimmed.match(/^\d+\./)[0])} ${escapeXml(text)}</w:t></w:r></w:p>`;
    }
    // Code block
    else if (trimmed.startsWith('```')) {
      continue;
    }
    // Standard paragraph
    else {
      const cleanText = trimmed.replace(/\*\*/g, '');
      bodyXml += `<w:p><w:pPr><w:spacing w:after="100" w:line="260" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="1E293B"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>${escapeXml(cleanText)}</w:t></w:r></w:p>`;
    }
  }

  flushTable();

  // Create Zip archive files
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

  // Write files to a temporary staging folder then zip into docx via PowerShell
  const tmpDir = path.join(__dirname, 'tmp_docx_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '_rels'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'word'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'word', '_rels'), { recursive: true });

  fs.writeFileSync(path.join(tmpDir, '[Content_Types].xml'), contentTypesXml, 'utf8');
  fs.writeFileSync(path.join(tmpDir, '_rels', '.rels'), relsXml, 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'word', 'document.xml'), documentXml, 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'word', '_rels', 'document.xml.rels'), docRelsXml, 'utf8');

  // Zip using PowerShell (Compress-Archive requires .zip extension, then move to .docx)
  const zipPath = outputPath.replace(/\.docx$/i, '.zip');
  const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${tmpDir}/*' -DestinationPath '${zipPath.replace(/\\/g, '/')}' -Force; Move-Item -Path '${zipPath.replace(/\\/g, '/')}' -Destination '${outputPath.replace(/\\/g, '/')}' -Force"`;
  require('child_process').execSync(psCmd);

  // Clean up temporary files
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`Generated DOCX: ${outputPath}`);
}

// Helper to generate PDF using PDFKit
function createPdf(markdownText, outputPath, docTitle) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        bufferPages: true,
        info: {
          Title: docTitle,
          Author: 'TechBes Engineering Audit',
          Subject: 'Technical Documentation',
          CreationDate: new Date(),
        }
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      // Colors
      const navy = '#0f172a';
      const blue = '#2563eb';
      const slate = '#1e293b';
      const muted = '#64748b';

      const lines = markdownText.split('\n');
      let inCodeBlock = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Page break safety check
        if (doc.y > 730) {
          doc.addPage();
        }

        if (trimmed.startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          continue;
        }

        if (inCodeBlock) {
          doc.fillColor('#334155').fontSize(7.5).font('Courier').text(line, { indent: 15 });
          continue;
        }

        if (trimmed.startsWith('# ')) {
          doc.moveDown(0.8);
          doc.fillColor(navy).fontSize(16).font('Helvetica-Bold').text(trimmed.substring(2));
          doc.moveDown(0.4);
        } else if (trimmed.startsWith('## ')) {
          doc.moveDown(0.6);
          doc.fillColor(blue).fontSize(12).font('Helvetica-Bold').text(trimmed.substring(3));
          doc.moveDown(0.3);
        } else if (trimmed.startsWith('### ')) {
          doc.moveDown(0.4);
          doc.fillColor(slate).fontSize(10.5).font('Helvetica-Bold').text(trimmed.substring(4));
          doc.moveDown(0.2);
        } else if (trimmed.startsWith('#### ')) {
          doc.moveDown(0.3);
          doc.fillColor(slate).fontSize(9.5).font('Helvetica-Bold').text(trimmed.substring(5));
          doc.moveDown(0.15);
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const text = trimmed.substring(2).replace(/\*\*/g, '');
          doc.fillColor(slate).fontSize(8.5).font('Helvetica').text(`•  ${text}`, { indent: 10 });
        } else if (/^\d+\.\s/.test(trimmed)) {
          const text = trimmed.replace(/\*\*/g, '');
          doc.fillColor(slate).fontSize(8.5).font('Helvetica').text(text, { indent: 10 });
        } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
          if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;
          const cells = trimmed.split('|').slice(1, -1).map(c => c.trim().replace(/\*\*/g, ''));
          const rowText = cells.join('  |  ');
          doc.fillColor(cells[0].includes('#') || cells[0].toLowerCase() === 'method' || cells[0].toLowerCase() === 'attribute' ? navy : '#334155')
             .fontSize(7.5)
             .font(cells[0].includes('#') || cells[0].toLowerCase() === 'method' ? 'Helvetica-Bold' : 'Helvetica')
             .text(rowText);
        } else if (trimmed.length > 0) {
          const text = trimmed.replace(/\*\*/g, '');
          doc.fillColor(slate).fontSize(8.5).font('Helvetica').text(text);
        } else {
          doc.moveDown(0.2);
        }
      }

      // Add page numbers on all buffered pages
      const pageCount = doc.bufferedPageRange().count;
      for (let p = 0; p < pageCount; p++) {
        doc.switchToPage(p);
        doc.fontSize(7.5).fillColor(muted).font('Helvetica');
        doc.text(
          `TechBes Technical Audit | Page ${p + 1} of ${pageCount}`,
          40,
          780,
          { align: 'center', width: 515 }
        );
      }

      doc.end();
      writeStream.on('finish', () => {
        console.log(`Generated PDF: ${outputPath} (${pageCount} pages)`);
        resolve(outputPath);
      });
      writeStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function run() {
  const docsDir = 'c:/Work/technician_app/docs/technical';

  const adminMdPath = path.join(docsDir, 'TechBes_Admin_Panel_Technical_Documentation.md');
  const adminDocxPath = path.join(docsDir, 'TechBes_Admin_Panel_Technical_Documentation.docx');
  const adminPdfPath = path.join(docsDir, 'TechBes_Admin_Panel_Technical_Documentation.pdf');

  const mainMdPath = path.join(docsDir, 'TechBes_Main_App_Technical_Documentation.md');
  const mainDocxPath = path.join(docsDir, 'TechBes_Main_App_Technical_Documentation.docx');
  const mainPdfPath = path.join(docsDir, 'TechBes_Main_App_Technical_Documentation.pdf');

  console.log('1. Compiling Admin Panel DOCX and PDF...');
  const adminMd = fs.readFileSync(adminMdPath, 'utf8');
  createDocx(adminMd, adminDocxPath);
  await createPdf(adminMd, adminPdfPath, 'TechBes Admin Panel Technical Documentation');

  console.log('\n2. Compiling Main App DOCX and PDF...');
  const mainMd = fs.readFileSync(mainMdPath, 'utf8');
  createDocx(mainMd, mainDocxPath);
  await createPdf(mainMd, mainPdfPath, 'TechBes Main App Technical Documentation');

  console.log('\nAll 6 technical documentation artifacts compiled successfully!');
}

run().catch(err => {
  console.error('Error generating documents:', err);
  process.exit(1);
});
