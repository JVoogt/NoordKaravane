// Renders the two link-share (Open Graph) images and writes them where the sites serve them from.
// Run from social-media-posts/:  node og/export-og.js
// JPEG at 1200x630 and well under 300 KB: WhatsApp drops to a small square thumbnail for heavy images.
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..', '..');
const jobs = [
  { html: 'og-site.html', out: path.join(root, 'web/public/assets/images/og-image-1200.jpg') },
  { html: 'og-shop.html', out: path.join(root, 'storefront/public/og-default.jpg') },
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'] });
  for (const job of jobs) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    await page.goto('file://' + path.join(__dirname, job.html), { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: job.out, type: 'jpeg', quality: 86 });
    await page.close();
    console.log(path.relative(root, job.out), Math.round(fs.statSync(job.out).size / 1024) + ' KB');
  }
  await browser.close();
})();
