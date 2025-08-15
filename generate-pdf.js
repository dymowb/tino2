const fs = require('fs');
const path = require('path');

// Simple HTML to PDF converter using native Node.js
// This creates a basic PDF-like output using text formatting

const generatePDF = () => {
  try {
    // Read the requirements markdown file
    const requirementsPath = path.join(__dirname, 'REQUIREMENTS.md');
    const htmlPath = path.join(__dirname, 'requirements-pdf', 'REQUIREMENTS.html');
    
    if (!fs.existsSync(requirementsPath)) {
      console.error('❌ REQUIREMENTS.md not found');
      return;
    }

    console.log('📄 Converting REQUIREMENTS.md to PDF...');
    
    // Read the HTML file if it exists, otherwise read markdown
    let content;
    if (fs.existsSync(htmlPath)) {
      content = fs.readFileSync(htmlPath, 'utf8');
      console.log('✅ Using existing HTML file');
    } else {
      content = fs.readFileSync(requirementsPath, 'utf8');
      console.log('✅ Using markdown file');
    }

    // Create a simple text-based PDF alternative
    const pdfContent = `
TINO 2 - DOMESTIC SERVICE PLATFORM REQUIREMENTS DOCUMENT
========================================================

Generated on: ${new Date().toISOString()}
File size: ${content.length} characters
Word count: ~${content.split(/\s+/).length} words

This file contains the complete requirements specification for Tino 2.
For the full formatted version, please refer to:
- REQUIREMENTS.md (source file)
- requirements-pdf/REQUIREMENTS.html (formatted HTML)

To generate a proper PDF, use one of these methods:

Method 1 - Browser (Recommended):
1. Open requirements-pdf/REQUIREMENTS.html in Chrome/Firefox
2. Press Ctrl+P (Cmd+P on Mac)
3. Select "Save as PDF"
4. Adjust settings: A4 size, minimal margins
5. Save the PDF

Method 2 - Online Converter:
Upload requirements-pdf/REQUIREMENTS.html to:
- https://www.ilovepdf.com/html-to-pdf
- https://smallpdf.com/html-to-pdf
- https://convertio.co/html-pdf/

Method 3 - Command Line (if available):
wkhtmltopdf requirements-pdf/REQUIREMENTS.html requirements-pdf/REQUIREMENTS.pdf

========================================================
REQUIREMENTS CONTENT SUMMARY:
========================================================

${content.substring(0, 2000)}...

[Content truncated - see REQUIREMENTS.md for full content]

========================================================
Document Statistics:
- Total lines: ${content.split('\n').length}
- Total characters: ${content.length}
- Estimated pages: ~${Math.ceil(content.split(/\s+/).length / 250)}
========================================================
`;

    // Write the text-based PDF alternative
    const outputPath = path.join(__dirname, 'requirements-pdf', 'REQUIREMENTS.txt');
    fs.writeFileSync(outputPath, pdfContent);
    
    console.log('✅ Generated text-based requirements file: requirements-pdf/REQUIREMENTS.txt');
    console.log('📊 File size:', fs.statSync(outputPath).size, 'bytes');
    
    // Also create a simple README for PDF generation
    const readmePath = path.join(__dirname, 'requirements-pdf', 'README.md');
    const readmeContent = `# Requirements PDF Generation

This directory contains files for generating PDF versions of the Tino 2 requirements document.

## Files:
- \`REQUIREMENTS.html\` - Formatted HTML version (ready for PDF conversion)
- \`REQUIREMENTS.txt\` - Text summary
- \`README.md\` - This file

## To Generate PDF:

### Method 1: Browser (Easiest)
1. Open \`REQUIREMENTS.html\` in Chrome or Firefox
2. Press Ctrl+P (Cmd+P on Mac)
3. Select "Save as PDF" as destination
4. Configure settings:
   - Paper size: A4
   - Margins: Minimum
   - Scale: 85-90%
   - Background graphics: ON
5. Click Save

### Method 2: Online Tools
Upload \`REQUIREMENTS.html\` to any of these services:
- [HTML to PDF - ILovePDF](https://www.ilovepdf.com/html-to-pdf)
- [SmallPDF HTML to PDF](https://smallpdf.com/html-to-pdf)
- [Convertio HTML to PDF](https://convertio.co/html-pdf/)

### Method 3: Command Line
If you have wkhtmltopdf installed:
\`\`\`bash
wkhtmltopdf --page-size A4 --margin-top 20mm --margin-bottom 20mm REQUIREMENTS.html REQUIREMENTS.pdf
\`\`\`

## Document Info:
- Original: REQUIREMENTS.md (${fs.statSync(requirementsPath).size} bytes)
- Generated: ${new Date().toISOString()}
- Word count: ~${content.split(/\s+/).length} words
- Estimated PDF pages: ~${Math.ceil(content.split(/\s+/).length / 250)}
`;

    fs.writeFileSync(readmePath, readmeContent);
    console.log('✅ Generated README.md with PDF instructions');
    
    return true;
  } catch (error) {
    console.error('❌ Error generating PDF files:', error.message);
    return false;
  }
};

// Run the generator
if (generatePDF()) {
  console.log('\n🎉 PDF generation files created successfully!');
  console.log('📁 Check the requirements-pdf/ directory');
  console.log('🌐 Open requirements-pdf/REQUIREMENTS.html in browser and print to PDF');
} else {
  console.log('\n❌ PDF generation failed');
  process.exit(1);
}