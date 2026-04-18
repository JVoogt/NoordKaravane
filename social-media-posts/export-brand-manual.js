const puppeteer = require('puppeteer');
const path = require('path');

async function exportBrandManual() {
  console.log('Starting brand manual PDF export...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  const filePath = path.join(__dirname, 'brand-manual.html');
  const fileUrl = `file://${filePath}`;

  console.log(`Loading: ${filePath}`);

  await page.goto(fileUrl, { waitUntil: 'networkidle0' });

  // Wait for fonts to load
  await page.evaluateHandle('document.fonts.ready');

  // Small delay to ensure everything is rendered
  await new Promise(resolve => setTimeout(resolve, 1000));

  const outputFile = path.join(__dirname, 'Noord-Karavane-Brand-Manual.pdf');

  await page.pdf({
    path: outputFile,
    format: 'A4',
    printBackground: true,
    margin: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    }
  });

  console.log(`\nPDF exported: ${outputFile}`);

  await browser.close();

  console.log('\nBrand manual export complete!');
}

exportBrandManual().catch(console.error);
