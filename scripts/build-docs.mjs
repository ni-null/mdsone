#!/usr/bin/env node

import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(command, description) {
  try {
    console.log(`\n${description}`);
    execSync(command, { stdio: 'inherit', shell: true });
    return true;
  } catch (error) {
    console.error(`❌ Failed to ${description}`);
    process.exit(1);
  }
}

// Create output directory
console.log('📁 Creating output directory...');
mkdirSync('docs-dist', { recursive: true });

// Build multi-language combined documentation (i18n mode)
// This will automatically detect [en] and [zh-TW] subdirectories
run(
  'npx mdsone --source ./docs --output ./docs-dist/index.html --template normal --i18n-mode true --i18n-default zh-TW --site-title "MDSone Documentation" --theme-mode light',
  '🌐 Building multi-language documentation (i18n mode)...'
);

console.log('\n✅ Documentation built successfully!');
console.log('📍 Output directory: ./docs-dist');
console.log('\nFiles generated:');
console.log('  - index.html (Multi-language version with [en] and [zh-TW])');
console.log('\n💡 Tip: Open index.html in your browser to view the documentation');

