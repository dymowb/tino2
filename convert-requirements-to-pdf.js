const fs = require('fs');
const path = require('path');

// Simple markdown to HTML converter for PDF generation
function markdownToHtml(markdown, title) {
    // Enhanced markdown to HTML conversion with better table support
    let html = markdown
        // Headers
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
        .replace(/^##### (.*$)/gim, '<h5>$1</h5>')
        .replace(/^###### (.*$)/gim, '<h6>$1</h6>')
        // Code blocks
        .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="$1">$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Tables - basic table support
        .replace(/^\|(.+)\|$/gim, (match, content) => {
            const cells = content.split('|').map(cell => cell.trim()).filter(cell => cell);
            return '<tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
        })
        // Lists
        .replace(/^\* (.*)$/gim, '<li>$1</li>')
        .replace(/^- (.*)$/gim, '<li>$1</li>')
        .replace(/^\+ (.*)$/gim, '<li>$1</li>')
        .replace(/^\d+\. (.*)$/gim, '<li>$1</li>')
        // Wrap consecutive list items in ul/ol
        .replace(/(<li>.*<\/li>\s*)+/gs, '<ul>$&</ul>')
        // Bold and italic
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        // Horizontal rules
        .replace(/^---$/gim, '<hr>')
        // Line breaks and paragraphs
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // Wrap tables properly
    html = html.replace(/(<tr>.*?<\/tr>\s*)+/gs, '<table>$&</table>');

    // Wrap in proper HTML structure
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 210mm;
            margin: 0 auto;
            padding: 20px;
            font-size: 12pt;
        }
        
        h1, h2, h3, h4, h5, h6 { 
            color: #2c3e50; 
            margin-top: 30px; 
            margin-bottom: 10px;
            page-break-after: avoid;
        }
        
        h1 { 
            border-bottom: 3px solid #3498db; 
            padding-bottom: 10px; 
            font-size: 24pt;
            page-break-before: always;
        }
        
        h1:first-child {
            page-break-before: avoid;
        }
        
        h2 { 
            border-bottom: 1px solid #bdc3c7; 
            padding-bottom: 5px; 
            font-size: 18pt;
            page-break-before: avoid;
        }
        
        h3 { font-size: 16pt; }
        h4 { font-size: 14pt; }
        h5 { font-size: 13pt; }
        h6 { font-size: 12pt; }
        
        pre { 
            background: #f8f9fa; 
            padding: 15px; 
            border-radius: 5px; 
            overflow-x: auto;
            border: 1px solid #e9ecef;
            font-size: 10pt;
            page-break-inside: avoid;
        }
        
        code { 
            background: #f1f2f6; 
            padding: 2px 4px; 
            border-radius: 3px;
            font-size: 11pt;
        }
        
        ul, ol { margin: 15px 0; padding-left: 25px; }
        li { margin: 3px 0; }
        
        table { 
            border-collapse: collapse; 
            width: 100%; 
            margin: 20px 0;
            page-break-inside: avoid;
        }
        
        th, td { 
            border: 1px solid #ddd; 
            padding: 8px 12px; 
            text-align: left;
            font-size: 11pt;
        }
        
        th { 
            background-color: #f8f9fa; 
            font-weight: 600;
        }
        
        blockquote { 
            border-left: 4px solid #3498db; 
            margin: 15px 0; 
            padding-left: 20px; 
            color: #666; 
            font-style: italic;
        }
        
        .toc { 
            background: #f8f9fa; 
            padding: 20px; 
            border-radius: 5px; 
            margin: 20px 0;
            border: 1px solid #e9ecef;
        }
        
        .page-break { 
            page-break-before: always; 
        }
        
        hr {
            border: none;
            border-top: 1px solid #bdc3c7;
            margin: 30px 0;
        }
        
        p {
            margin: 10px 0;
            text-align: justify;
        }
        
        @media print {
            body { 
                margin: 0; 
                font-size: 11pt;
            }
            
            .page-break { 
                page-break-before: always; 
            }
            
            h1, h2, h3, h4, h5, h6 {
                page-break-after: avoid;
            }
            
            table, pre, blockquote {
                page-break-inside: avoid;
            }
            
            img {
                max-width: 100%;
                page-break-inside: avoid;
            }
        }
        
        @page {
            margin: 2cm;
            size: A4;
        }
    </style>
</head>
<body>
    <p>${html}</p>
</body>
</html>
    `;
}

console.log('🔄 Converting Tino 2 Requirements Document to HTML for PDF generation...\n');

try {
    // Check if requirements file exists
    const requirementsFile = 'REQUIREMENTS.md';
    
    if (!fs.existsSync(requirementsFile)) {
        console.log(`❌ Requirements file not found: ${requirementsFile}`);
        process.exit(1);
    }
    
    // Read the requirements document
    const markdown = fs.readFileSync(requirementsFile, 'utf8');
    const title = 'Tino 2 - Comprehensive Requirements Specification';
    
    // Convert to HTML
    const html = markdownToHtml(markdown, title);
    
    // Create output directory if it doesn't exist
    const outputDir = './requirements-pdf';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }
    
    // Write HTML file
    const htmlOutputFile = path.join(outputDir, 'REQUIREMENTS.html');
    fs.writeFileSync(htmlOutputFile, html);
    
    console.log(`✅ Successfully converted: ${requirementsFile} -> ${htmlOutputFile}`);
    console.log(`📁 HTML file saved in: ${outputDir}/`);
    
    console.log('\n📄 To convert to PDF:');
    console.log('  Method 1 - Browser (Recommended):');
    console.log(`    1. Open ${htmlOutputFile} in Google Chrome or Firefox`);
    console.log('    2. Press Ctrl+P (Cmd+P on Mac) to print');
    console.log('    3. Select "Save as PDF" as destination');
    console.log('    4. Adjust settings: A4 size, margins, headers/footers');
    console.log('    5. Click "Save" to generate PDF');
    
    console.log('\n  Method 2 - Command Line (if you have wkhtmltopdf installed):');
    console.log(`    wkhtmltopdf --page-size A4 --margin-top 20mm --margin-bottom 20mm ${htmlOutputFile} requirements-pdf/REQUIREMENTS.pdf`);
    
    console.log('\n  Method 3 - Online Converter:');
    console.log('    Upload the HTML file to services like:');
    console.log('    - https://www.ilovepdf.com/html-to-pdf');
    console.log('    - https://smallpdf.com/html-to-pdf');
    console.log('    - https://convertio.co/html-pdf/');
    
    console.log('\n📊 Document Statistics:');
    const stats = fs.statSync(requirementsFile);
    const wordCount = markdown.split(/\s+/).length;
    const lineCount = markdown.split('\n').length;
    
    console.log(`  - File size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`  - Word count: ~${wordCount.toLocaleString()}`);
    console.log(`  - Line count: ${lineCount.toLocaleString()}`);
    console.log(`  - Estimated pages: ${Math.ceil(wordCount / 250)} pages`);
    
    console.log('\n🎉 Conversion complete! The requirements document is ready for PDF generation.');
    
} catch (error) {
    console.log('❌ Error during conversion:', error.message);
    process.exit(1);
}