const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function exportAll() {
  console.log('Starting exports...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // 1. Export high-quality logo PNGs from SVG
  console.log('=== Exporting HQ Logo PNGs ===');
  const svgContent = fs.readFileSync(path.join(__dirname, 'logo-hq.svg'), 'utf8');

  const variants = [
    { name: 'logo-hq-black-1024', size: 1024, color: '#1f1f1f' },
    { name: 'logo-hq-black-512', size: 512, color: '#1f1f1f' },
    { name: 'logo-hq-white-1024', size: 1024, color: '#ffffff' },
    { name: 'logo-hq-orange-1024', size: 1024, color: '#e85d04' },
    { name: 'logo-hq-navy-1024', size: 1024, color: '#2d3a4a' },
  ];

  for (const variant of variants) {
    const logoPage = await browser.newPage();
    let svg = svgContent;
    svg = svg.replace(/#1f1f1f/g, variant.color);
    svg = svg.replace(/width="1024"/, `width="${variant.size}"`);
    svg = svg.replace(/height="1024"/, `height="${variant.size}"`);

    const html = `<!DOCTYPE html><html><head><style>
      * { margin: 0; padding: 0; }
      body { width: ${variant.size}px; height: ${variant.size}px; }
    </style></head><body>${svg}</body></html>`;

    await logoPage.setViewport({ width: variant.size, height: variant.size, deviceScaleFactor: 1 });
    await logoPage.setContent(html, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 500));

    const outputPath = path.join(__dirname, `${variant.name}.png`);
    await logoPage.screenshot({
      path: outputPath,
      omitBackground: true,
      clip: { x: 0, y: 0, width: variant.size, height: variant.size }
    });
    console.log(`  Exported: ${variant.name}.png`);
    await logoPage.close();
  }

  // 2. Export Brand Manual PDF
  console.log('\n=== Exporting Brand Manual PDF ===');
  const pdfPage = await browser.newPage();
  const filePath = path.join(__dirname, 'brand-manual.html');
  const fileUrl = `file://${filePath}`;

  console.log(`  Loading: ${filePath}`);
  await pdfPage.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 60000 });
  await pdfPage.evaluateHandle('document.fonts.ready');
  await new Promise(r => setTimeout(r, 2000));

  const pdfOutput = path.join(__dirname, 'Noord-Karavane-Brand-Manual.pdf');
  await pdfPage.pdf({
    path: pdfOutput,
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  console.log(`  Exported: Noord-Karavane-Brand-Manual.pdf`);

  await browser.close();
  console.log('\nAll exports complete!');
}

exportAll().catch(console.error);
