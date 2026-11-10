// Renders public/icon.svg to the PNG sizes iOS/Android want. Needs Playwright available (npm i -D playwright). Run: npm run icons
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../public/icon.svg'), 'utf8');
  const browser = await chromium.launch();
  for (const size of [180, 192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0;background:#0d111d}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
    await page.screenshot({ path: path.join(__dirname, `../public/icon-${size}.png`) });
    await page.close();
  }
  await browser.close();
})();
