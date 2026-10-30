// Genera los PNG del manifiesto a partir de public/icons/icon.svg (requiere Playwright).
// Uso: node scripts/render-icons.cjs
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const svg = await readFile(path.join(__dirname, '../public/icons/icon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  async function render(size, file, maskable = false) {
    await page.setViewportSize({ width: size, height: size });
    // Maskable: fondo a sangre y el dibujo dentro de la zona segura (80 %).
    const inner = maskable
      ? `<div style="width:100%;height:100%;background:#2f6fdf;display:flex;align-items:center;justify-content:center">
         <div style="width:80%;height:80%">${svg}</div></div>`
      : svg;
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{width:100%;height:100%;display:block}</style>${inner}`,
    );
    await page.screenshot({
      path: path.join(__dirname, '../public/icons', file),
      omitBackground: true,
    });
  }

  await render(192, 'icon-192.png');
  await render(512, 'icon-512.png');
  await render(512, 'icon-maskable-512.png', true);
  await browser.close();
})();
