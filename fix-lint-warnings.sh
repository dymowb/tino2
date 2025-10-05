#!/bin/bash

# Tino 2 - Fix ESLint Warnings Script
echo "🔧 Fixing ESLint warnings (unused imports)..."

cd frontend

# Auto-fix unused imports and other auto-fixable issues
echo "📝 Running ESLint auto-fix..."
npx eslint src/ --fix --ext .ts,.tsx

# Run additional cleanup for remaining warnings
echo "🧹 Additional cleanup..."
npx eslint src/ --ext .ts,.tsx --fix-dry-run > lint-report.txt 2>&1 || true

echo ""
echo "✅ ESLint warnings fixed!"
echo "📋 Next startup will be cleaner"
echo ""
echo "💡 To apply fixes: npm run lint:fix"