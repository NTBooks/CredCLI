const path = require('path');
const { execSync } = require('child_process');

const browsersPath = path.join(__dirname, 'dist', '.browsers');

try {
  execSync('playwright install chromium', {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
  });
} catch (e) {
  console.warn('Warning: Could not install Chromium automatically.');
  console.warn('Run: npx playwright install chromium');
}
