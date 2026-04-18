const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const posts = [
  { file: '01-caravan-service-repairs.html', width: 1080, height: 1080 },
  { file: '02-electrical-solar.html', width: 1080, height: 1080 },
  { file: '03-safety-checks.html', width: 1080, height: 1080 },
  { file: '04-brand-adventure.html', width: 1080, height: 1920 },
  { file: '05-brand-expertise.html', width: 1080, height: 1920 },
  { file: '06-wheel-bearings-chassis.html', width: 1080, height: 1080 },
  { file: '07-awning-repairs.html', width: 1080, height: 1080 },
  { file: '08-water-systems.html', width: 1080, height: 1080 },
  { file: '09-holiday-checklist.html', width: 1080, height: 1080 },
  { file: '10-why-choose-us.html', width: 1080, height: 1080 },
  { file: '11-service-single-unbraked.html', width: 1080, height: 1080 },
  { file: '12-service-single-braked.html', width: 1080, height: 1080 },
  { file: '13-service-double-braked.html', width: 1080, height: 1080 },
  { file: '14-service-packages-comparison.html', width: 1080, height: 1080 },
  { file: '15-service-packages-promo.html', width: 1080, height: 1080 },
];

async function exportToPng() {
  console.log('Starting PNG export...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Create output directory
  const outputDir = path.join(__dirname, 'png-exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  for (const post of posts) {
    const page = await browser.newPage();

    // Set viewport to exact dimensions
    await page.setViewport({
      width: post.width,
      height: post.height,
      deviceScaleFactor: 1
    });

    const filePath = path.join(__dirname, post.file);
    const fileUrl = `file://${filePath}`;

    console.log(`Processing: ${post.file} (${post.width}x${post.height})`);

    await page.goto(fileUrl, { waitUntil: 'networkidle0' });

    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');

    // Small delay to ensure everything is rendered
    await new Promise(resolve => setTimeout(resolve, 500));

    const outputFile = path.join(outputDir, post.file.replace('.html', '.png'));

    await page.screenshot({
      path: outputFile,
      type: 'png',
      clip: {
        x: 0,
        y: 0,
        width: post.width,
        height: post.height
      }
    });

    console.log(`  Exported: ${outputFile}`);

    await page.close();
  }

  await browser.close();

  console.log('\nAll exports complete!');
  console.log(`PNG files saved to: ${outputDir}`);
}

exportToPng().catch(console.error);
