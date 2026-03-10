@echo off
REM Build and generate multi-language documentation locally

echo 🏗️  Building mdsone package...
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%

echo 📁 Creating output directory...
if not exist "docs-dist" mkdir docs-dist

echo 🇬🇧 Building English documentation...
call npx mdsone ^
  --source ./docs/[en] ^
  --output ./docs-dist/en.html ^
  --template normal ^
  --locale en ^
  --site-title "MDSone Documentation - English" ^
  --theme-mode light
if %errorlevel% neq 0 exit /b %errorlevel%

echo 🇹🇼 Building Traditional Chinese documentation...
call npx mdsone ^
  --source ./docs/[zh-TW] ^
  --output ./docs-dist/zh-TW.html ^
  --template normal ^
  --locale zh-TW ^
  --site-title "MDSone 文檔 - 繁體中文" ^
  --theme-mode light
if %errorlevel% neq 0 exit /b %errorlevel%

echo 🌐 Building combined multi-language documentation...
call npx mdsone ^
  --source ./docs ^
  --output ./docs-dist/index.html ^
  --template normal ^
  --i18n-mode true ^
  --default-locale zh-TW ^
  --locale zh-TW ^
  --site-title "MDSone Documentation" ^
  --theme-mode light
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ✅ Documentation built successfully!
echo 📍 Output directory: ./docs-dist
echo.
echo Files generated:
echo   - en.html ^(English version^)
echo   - zh-TW.html ^(Traditional Chinese version^)
echo   - index.html ^(Multi-language version^)
