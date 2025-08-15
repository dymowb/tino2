# Requirements PDF Generation

This directory contains files for generating PDF versions of the Tino 2 requirements document.

## Files:
- `REQUIREMENTS.html` - Formatted HTML version (ready for PDF conversion)
- `REQUIREMENTS.txt` - Text summary
- `README.md` - This file

## To Generate PDF:

### Method 1: Browser (Easiest)
1. Open `REQUIREMENTS.html` in Chrome or Firefox
2. Press Ctrl+P (Cmd+P on Mac)
3. Select "Save as PDF" as destination
4. Configure settings:
   - Paper size: A4
   - Margins: Minimum
   - Scale: 85-90%
   - Background graphics: ON
5. Click Save

### Method 2: Online Tools
Upload `REQUIREMENTS.html` to any of these services:
- [HTML to PDF - ILovePDF](https://www.ilovepdf.com/html-to-pdf)
- [SmallPDF HTML to PDF](https://smallpdf.com/html-to-pdf)
- [Convertio HTML to PDF](https://convertio.co/html-pdf/)

### Method 3: Command Line
If you have wkhtmltopdf installed:
```bash
wkhtmltopdf --page-size A4 --margin-top 20mm --margin-bottom 20mm REQUIREMENTS.html REQUIREMENTS.pdf
```

## Document Info:
- Original: REQUIREMENTS.md (53667 bytes)
- Generated: 2025-08-15T04:04:07.334Z
- Word count: ~5714 words
- Estimated PDF pages: ~23
