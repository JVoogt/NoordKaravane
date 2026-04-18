const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const printItems = [
  // Banner-02 (2000x1200mm banner)
  {
    file: 'banner-02-bold.html',
    width: 2000,
    height: 1200,
    name: 'banner-02-bold',
    type: 'banner'
  },
  // A5 Flyer (148x210mm)
  {
    file: 'flyer-a5-bold.html',
    width: 1480,
    height: 2100,
    name: 'flyer-a5-bold',
    type: 'flyer'
  },
];

async function exportAll() {
  console.log('Starting print export process...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Create output directory
  const outputDir = path.join(__dirname, 'print-exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Export HTML files as PNG and PDF
  for (const item of printItems) {
    const page = await browser.newPage();

    // Set viewport with 2x scale for higher resolution output
    await page.setViewport({
      width: item.width,
      height: item.height,
      deviceScaleFactor: 2
    });

    const filePath = path.join(__dirname, item.file);
    const fileUrl = `file://${filePath}`;

    console.log(`Processing: ${item.file}`);
    console.log(`  Dimensions: ${item.width}x${item.height}px`);

    await page.goto(fileUrl, { waitUntil: 'networkidle0' });

    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');

    // Small delay to ensure everything is rendered
    await new Promise(resolve => setTimeout(resolve, 500));

    // Export PNG
    const pngFile = path.join(outputDir, `${item.name}.png`);
    await page.screenshot({
      path: pngFile,
      type: 'png',
      clip: {
        x: 0,
        y: 0,
        width: item.width,
        height: item.height
      }
    });
    console.log(`  PNG exported: ${pngFile}`);

    // Export PDF
    const pdfFile = path.join(outputDir, `${item.name}.pdf`);

    // Calculate PDF dimensions in inches (1 inch = 96 CSS pixels at standard resolution)
    // For banner: 2000mm x 1200mm
    // For A5 flyer: 148mm x 210mm
    let pdfWidth, pdfHeight;

    if (item.type === 'banner') {
      // Banner at 2000mm x 1200mm
      pdfWidth = '2000mm';
      pdfHeight = '1200mm';
    } else if (item.type === 'flyer') {
      // A5 at 148mm x 210mm
      pdfWidth = '148mm';
      pdfHeight = '210mm';
    }

    await page.pdf({
      path: pdfFile,
      width: pdfWidth,
      height: pdfHeight,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });
    console.log(`  PDF exported: ${pdfFile}`);

    await page.close();
    console.log('');
  }

  // Create PDF from the service packages promo PNG
  console.log('Creating PDF from 15-service-packages-promo.png...');

  const promoImagePath = path.join(__dirname, 'png-exports', '15-service-packages-promo.png');

  if (fs.existsSync(promoImagePath)) {
    const page = await browser.newPage();

    // Create a simple HTML wrapper for the image
    const imageBase64 = fs.readFileSync(promoImagePath).toString('base64');
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; }
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            background: #1f1f1f;
          }
          img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <img src="data:image/png;base64,${imageBase64}" />
      </body>
      </html>
    `;

    // Social media post dimensions (1080x1350)
    await page.setViewport({
      width: 1080,
      height: 1350,
      deviceScaleFactor: 2
    });

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const promoPdfFile = path.join(outputDir, '15-service-packages-promo.pdf');
    await page.pdf({
      path: promoPdfFile,
      width: '1080px',
      height: '1350px',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    console.log(`  PDF exported: ${promoPdfFile}`);
    await page.close();
  } else {
    console.log(`  Warning: ${promoImagePath} not found`);
  }

  await browser.close();

  console.log('\n========================================');
  console.log('All exports complete!');
  console.log(`Files saved to: ${outputDir}`);
  console.log('========================================');
  console.log('\nExported files:');
  console.log('  - banner-02-bold.png (4000x2400px at 2x scale)');
  console.log('  - banner-02-bold.pdf (2000mm x 1200mm)');
  console.log('  - flyer-a5-bold.png (2960x4200px at 2x scale)');
  console.log('  - flyer-a5-bold.pdf (148mm x 210mm / A5)');
  console.log('  - 15-service-packages-promo.pdf');
}

exportAll().catch(console.error);
