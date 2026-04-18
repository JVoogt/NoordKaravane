const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const banners = [
  { file: 'banner-01-classic.html', width: 2000, height: 1200 },
  { file: 'banner-02-bold.html', width: 2000, height: 1200 },
  { file: 'banner-03-minimal.html', width: 2000, height: 1200 },
];

async function exportBanners() {
  console.log('Starting banner PNG export...\n');
  console.log('Banner size: 2000mm x 1200mm');
  console.log('Export resolution: 4000x2400 pixels (2x scale for print quality)\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Create output directory
  const outputDir = path.join(__dirname, 'banner-exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  for (const banner of banners) {
    const page = await browser.newPage();

    // Set viewport with 2x scale for higher resolution output
    await page.setViewport({
      width: banner.width,
      height: banner.height,
      deviceScaleFactor: 2
    });

    const filePath = path.join(__dirname, banner.file);
    const fileUrl = `file://${filePath}`;

    console.log(`Processing: ${banner.file} (${banner.width}x${banner.height})`);

    await page.goto(fileUrl, { waitUntil: 'networkidle0' });

    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');

    // Small delay to ensure everything is rendered
    await new Promise(resolve => setTimeout(resolve, 500));

    const outputFile = path.join(outputDir, banner.file.replace('.html', '.png'));

    await page.screenshot({
      path: outputFile,
      type: 'png',
      clip: {
        x: 0,
        y: 0,
        width: banner.width,
        height: banner.height
      }
    });

    console.log(`  Exported: ${outputFile}`);

    await page.close();
  }

  await browser.close();

  console.log('\nAll banner exports complete!');
  console.log(`PNG files saved to: ${outputDir}`);
  console.log('\nExported at 4000x2400 pixels (2x scale).');
  console.log('For 2000mm x 1200mm print, this provides ~51 DPI.');
  console.log('For higher print quality, request the original logo in vector format (SVG/AI/EPS).');
}

exportBanners().catch(console.error);
