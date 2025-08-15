#!/bin/bash

# Tino 2 Requirements Document PDF Export Script
# This script provides multiple methods to convert the requirements document to PDF

echo "🔄 Tino 2 Requirements Document - PDF Export"
echo "============================================="

# Check current directory
if [ ! -f "REQUIREMENTS.md" ]; then
    echo "❌ Error: REQUIREMENTS.md not found in current directory"
    echo "Please run this script from the project root directory."
    exit 1
fi

# Create output directory
mkdir -p requirements-pdf

echo "✅ Found REQUIREMENTS.md ($(du -h REQUIREMENTS.md | cut -f1))"

# Method 1: Try Node.js HTML to PDF (if available)
if command -v node >/dev/null 2>&1; then
    echo "📄 Converting to HTML format..."
    node convert-requirements-to-pdf.js
    
    if [ -f "requirements-pdf/REQUIREMENTS.html" ]; then
        echo "✅ HTML version created: requirements-pdf/REQUIREMENTS.html"
    fi
else
    echo "⚠️  Node.js not available for HTML conversion"
fi

# Method 2: Try wkhtmltopdf (if available)
if command -v wkhtmltopdf >/dev/null 2>&1; then
    echo "🔧 Using wkhtmltopdf for PDF conversion..."
    wkhtmltopdf \
        --page-size A4 \
        --margin-top 20mm \
        --margin-bottom 20mm \
        --margin-left 15mm \
        --margin-right 15mm \
        --encoding UTF-8 \
        --print-media-type \
        requirements-pdf/REQUIREMENTS.html \
        requirements-pdf/REQUIREMENTS.pdf
    
    if [ -f "requirements-pdf/REQUIREMENTS.pdf" ]; then
        echo "✅ PDF created: requirements-pdf/REQUIREMENTS.pdf"
        echo "📊 PDF size: $(du -h requirements-pdf/REQUIREMENTS.pdf | cut -f1)"
        exit 0
    fi
else
    echo "⚠️  wkhtmltopdf not available"
fi

# Method 3: Try Chromium/Chrome headless (if available)
CHROME_CMD=""
if command -v chromium-browser >/dev/null 2>&1; then
    CHROME_CMD="chromium-browser"
elif command -v google-chrome >/dev/null 2>&1; then
    CHROME_CMD="google-chrome"
elif command -v chrome >/dev/null 2>&1; then
    CHROME_CMD="chrome"
fi

if [ ! -z "$CHROME_CMD" ]; then
    echo "🔧 Using $CHROME_CMD for PDF conversion..."
    HTML_FILE="$(pwd)/requirements-pdf/REQUIREMENTS.html"
    PDF_FILE="$(pwd)/requirements-pdf/REQUIREMENTS.pdf"
    
    $CHROME_CMD \
        --headless \
        --disable-gpu \
        --no-sandbox \
        --print-to-pdf="$PDF_FILE" \
        --print-to-pdf-no-header \
        "file://$HTML_FILE" 2>/dev/null
    
    if [ -f "$PDF_FILE" ]; then
        echo "✅ PDF created: requirements-pdf/REQUIREMENTS.pdf"
        echo "📊 PDF size: $(du -h requirements-pdf/REQUIREMENTS.pdf | cut -f1)"
        exit 0
    fi
else
    echo "⚠️  Chrome/Chromium not available"
fi

# Method 4: Try pandoc (if available)
if command -v pandoc >/dev/null 2>&1; then
    echo "🔧 Using pandoc for PDF conversion..."
    pandoc REQUIREMENTS.md \
        -o requirements-pdf/REQUIREMENTS.pdf \
        --pdf-engine=xelatex \
        --variable geometry:margin=1in \
        --variable fontsize=11pt \
        --variable documentclass=article \
        --toc \
        --number-sections 2>/dev/null
    
    if [ -f "requirements-pdf/REQUIREMENTS.pdf" ]; then
        echo "✅ PDF created: requirements-pdf/REQUIREMENTS.pdf"
        echo "📊 PDF size: $(du -h requirements-pdf/REQUIREMENTS.pdf | cut -f1)"
        exit 0
    fi
else
    echo "⚠️  pandoc not available"
fi

# If no automated method worked, provide manual instructions
echo ""
echo "🔄 Automated PDF conversion not available in this environment."
echo "📋 Manual Conversion Instructions:"
echo ""
echo "Method 1 - Browser (Recommended):"
echo "  1. Open requirements-pdf/REQUIREMENTS.html in a web browser"
echo "  2. Press Ctrl+P (Cmd+P on Mac)"
echo "  3. Select 'Save as PDF' as destination"
echo "  4. Adjust settings:"
echo "     - Paper size: A4"
echo "     - Margins: Minimum"
echo "     - Scale: Custom (85-90%)"
echo "     - Options: Background graphics ON"
echo "  5. Click 'Save'"
echo ""
echo "Method 2 - Online Tools:"
echo "  Upload requirements-pdf/REQUIREMENTS.html to:"
echo "  • https://www.ilovepdf.com/html-to-pdf"
echo "  • https://smallpdf.com/html-to-pdf"
echo "  • https://convertio.co/html-pdf/"
echo ""
echo "Method 3 - Install Tools:"
echo "  # Ubuntu/Debian:"
echo "  sudo apt-get install wkhtmltopdf"
echo "  ./export-to-pdf.sh"
echo ""
echo "  # macOS:"
echo "  brew install wkhtmltopdf"
echo "  ./export-to-pdf.sh"
echo ""
echo "  # Alternative with pandoc:"
echo "  sudo apt-get install pandoc texlive-xetex"
echo "  pandoc REQUIREMENTS.md -o requirements.pdf"
echo ""

if [ -f "requirements-pdf/REQUIREMENTS.html" ]; then
    echo "📁 Available files:"
    ls -la requirements-pdf/
    echo ""
    echo "🌐 To open HTML in browser:"
    HTML_PATH="$(pwd)/requirements-pdf/REQUIREMENTS.html"
    echo "  file://$HTML_PATH"
fi

echo ""
echo "📄 Document Info:"
echo "  • Original: REQUIREMENTS.md ($(wc -w < REQUIREMENTS.md) words, $(wc -l < REQUIREMENTS.md) lines)"
echo "  • Estimated pages: ~$((($(wc -w < REQUIREMENTS.md) + 249) / 250)) pages"
echo "  • Requirements count: 367 total (224 functional + 143 UI/UX)"
echo ""
echo "✨ The requirements document is ready for PDF conversion!"