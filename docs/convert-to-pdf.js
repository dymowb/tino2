const fs = require('fs');
const path = require('path');

// Simple markdown to HTML converter for basic PDF generation
function markdownToHtml(markdown, title) {
    // Basic markdown to HTML conversion
    let html = markdown
        // Headers
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
        // Code blocks
        .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="$1">$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Lists
        .replace(/^\* (.*)$/gim, '<li>$1</li>')
        .replace(/^- (.*)$/gim, '<li>$1</li>')
        .replace(/^\+ (.*)$/gim, '<li>$1</li>')
        // Wrap consecutive list items
        .replace(/(<li>.*<\/li>\s*)+/gs, '<ul>$&</ul>')
        // Bold and italic
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // Wrap in proper HTML structure
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        h1, h2, h3, h4 { color: #2c3e50; margin-top: 30px; }
        h1 { border-bottom: 3px solid #3498db; padding-bottom: 10px; }
        h2 { border-bottom: 1px solid #bdc3c7; padding-bottom: 5px; }
        pre { background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
        code { background: #f1f2f6; padding: 2px 4px; border-radius: 3px; }
        ul { margin: 15px 0; }
        li { margin: 5px 0; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        blockquote { border-left: 4px solid #3498db; margin: 0; padding-left: 20px; color: #666; }
        .toc { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .page-break { page-break-before: always; }
        @media print {
            body { margin: 0; }
            .page-break { page-break-before: always; }
        }
    </style>
</head>
<body>
    <p>${html}</p>
</body>
</html>`;
}

// List of documentation files to convert
const docs = [
    { file: 'README.md', title: 'Tino 2 - Project Documentation Index' },
    { file: '01-System-Overview-Requirements.md', title: 'Tino 2 - System Overview & Requirements' },
    { file: '02-System-Architecture.md', title: 'Tino 2 - System Architecture' },
    { file: '03-Data-Models-Schema.md', title: 'Tino 2 - Data Models & Schema' },
    { file: '04-API-Documentation.md', title: 'Tino 2 - API Documentation' },
    { file: '05-System-Diagrams.md', title: 'Tino 2 - System Diagrams' },
    { file: '06-Deployment-Setup-Guide.md', title: 'Tino 2 - Deployment & Setup Guide' },
    { file: '07-Agentic-Product-Roadmap.md', title: 'Tino 2 - Agentic Product Roadmap' },
    { file: '08-AI-Configuration-Operations.md', title: 'Tino 2 - AI Configuration and Operations' },
    { file: 'IDEAS_BACKLOG.md', title: 'Tino 2 - Product and Agentic Ideas Backlog' },
    { file: 'adr/0001-agentic-memory.md', title: 'Tino 2 - Agentic Memory ADR' }
];

console.log('Converting Tino 2 documentation to HTML format...\n');

// Create output directory
const outputDir = './html-exports';
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Convert each document
docs.forEach(doc => {
    try {
        if (fs.existsSync(doc.file)) {
            const markdown = fs.readFileSync(doc.file, 'utf8');
            const html = markdownToHtml(markdown, doc.title);
            const outputFile = path.join(outputDir, doc.file.replace(/\//g, '-').replace('.md', '.html'));
            
            fs.writeFileSync(outputFile, html);
            console.log(`✅ Converted: ${doc.file} -> ${outputFile}`);
        } else {
            console.log(`❌ File not found: ${doc.file}`);
        }
    } catch (error) {
        console.log(`❌ Error converting ${doc.file}:`, error.message);
    }
});

// Create combined document
try {
    console.log('\n📄 Creating combined documentation...');
    
    let combinedHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Tino 2 - Complete Documentation</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        h1, h2, h3, h4 { color: #2c3e50; margin-top: 30px; }
        h1 { border-bottom: 3px solid #3498db; padding-bottom: 10px; }
        h2 { border-bottom: 1px solid #bdc3c7; padding-bottom: 5px; }
        pre { background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
        code { background: #f1f2f6; padding: 2px 4px; border-radius: 3px; }
        ul { margin: 15px 0; }
        li { margin: 5px 0; }
        .page-break { page-break-before: always; }
        .document-section { margin-top: 50px; }
        .toc { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
        @media print {
            body { margin: 0; }
            .page-break { page-break-before: always; }
        }
    </style>
</head>
<body>
    <h1>Tino 2 - Complete Project Documentation</h1>
    <div class="toc">
        <h2>Table of Contents</h2>
        <ul>
            <li><a href="#overview">System Overview & Requirements</a></li>
            <li><a href="#architecture">System Architecture</a></li>
            <li><a href="#data">Data Models & Schema</a></li>
            <li><a href="#api">API Documentation</a></li>
            <li><a href="#diagrams">System Diagrams</a></li>
            <li><a href="#deployment">Deployment & Setup Guide</a></li>
            <li><a href="#roadmap">Agentic Product Roadmap</a></li>
            <li><a href="#ai-operations">AI Configuration and Operations</a></li>
            <li><a href="#ideas">Ideas Backlog</a></li>
            <li><a href="#memory-adr">Agentic Memory ADR</a></li>
        </ul>
    </div>
    `;

    docs.slice(1).forEach((doc, index) => {
        if (fs.existsSync(doc.file)) {
            const markdown = fs.readFileSync(doc.file, 'utf8');
            const sectionIds = {
                '01-System-Overview-Requirements.md': 'overview',
                '02-System-Architecture.md': 'architecture',
                '03-Data-Models-Schema.md': 'data',
                '04-API-Documentation.md': 'api',
                '05-System-Diagrams.md': 'diagrams',
                '06-Deployment-Setup-Guide.md': 'deployment',
                '07-Agentic-Product-Roadmap.md': 'roadmap',
                '08-AI-Configuration-Operations.md': 'ai-operations',
                'IDEAS_BACKLOG.md': 'ideas',
                'adr/0001-agentic-memory.md': 'memory-adr'
            };
            const sectionId = sectionIds[doc.file] || doc.file.replace(/[^a-z0-9]+/gi, '-');
            
            combinedHtml += `<div class="page-break document-section" id="${sectionId}">`;
            combinedHtml += markdownToHtml(markdown, doc.title).replace(/<!DOCTYPE html>[\s\S]*?<body>/, '').replace('</body></html>', '');
            combinedHtml += '</div>';
        }
    });

    combinedHtml += '</body></html>';
    
    fs.writeFileSync(path.join(outputDir, 'Complete-Tino2-Documentation.html'), combinedHtml);
    console.log('✅ Combined documentation created: Complete-Tino2-Documentation.html');

} catch (error) {
    console.log('❌ Error creating combined document:', error.message);
}

console.log('\n🎉 HTML conversion complete!');
console.log('📁 Files are available in the html-exports/ directory');
console.log('\n📝 To convert to PDF:');
console.log('   1. Open the HTML files in a web browser');
console.log('   2. Use the browser\'s "Print to PDF" feature');
console.log('   3. Or use an online HTML to PDF converter');
console.log('\n📚 Available files:');
docs.forEach(doc => {
    console.log(`   - ${doc.file.replace(/\//g, '-').replace('.md', '.html')}`);
});
console.log('   - Complete-Tino2-Documentation.html (combined)');
