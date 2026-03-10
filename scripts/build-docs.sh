#!/bin/bash
# Build and generate multi-language documentation locally

set -e

echo "🏗️  Building mdsone package..."
npm run build

echo "📁 Creating output directory..."
mkdir -p docs-dist

echo "🇬🇧 Building English documentation..."
npx mdsone \
  --source ./docs/[en] \
  --output ./docs-dist/en.html \
  --template normal \
  --locale en \
  --site-title "MDSone Documentation - English" \
  --theme-mode light

echo "🇹🇼 Building Traditional Chinese documentation..."
npx mdsone \
  --source ./docs/[zh-TW] \
  --output ./docs-dist/zh-TW.html \
  --template normal \
  --locale zh-TW \
  --site-title "MDSone 文檔 - 繁體中文" \
  --theme-mode light

echo "🌐 Building combined multi-language documentation..."
npx mdsone \
  --source ./docs \
  --output ./docs-dist/index.html \
  --template normal \
  --i18n-mode true \
  --default-locale zh-TW \
  --locale zh-TW \
  --site-title "MDSone Documentation" \
  --theme-mode light

echo "✅ Documentation built successfully!"
echo "📍 Output directory: ./docs-dist"
echo ""
echo "Files generated:"
echo "  - en.html (English version)"
echo "  - zh-TW.html (Traditional Chinese version)"
echo "  - index.html (Multi-language version)"
