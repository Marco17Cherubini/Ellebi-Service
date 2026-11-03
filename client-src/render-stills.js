// Genera l'immagine statica dell'auto della pagina d'ingresso dal modello 3D.
// Uso: `npm run build:3d && npm run render:stills` (richiede Playwright con Chromium).
// Scrive frontend/images/auto-assemblata.webp. Il modello non va distribuito al browser.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const BUNDLE = path.join(__dirname, 'build', 'garage3d.js');
const W = 1120;
const H = 688;
const SCALE = 2; // immagini a 2240×1376, poi ridotte e compresse in WebP

const PAGE = `<!doctype html><html><body style="margin:0;background:transparent">
<div id="s" style="width:${W}px;height:${H}px;position:relative"></div>
<script type="module">
import { mount } from '/js/garage3d.js';
window.__api = await mount(document.getElementById('s'), {
  exploded: false, intro: false, preserveDrawingBuffer: true, pixelRatio: ${SCALE}
});
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    return res.end(PAGE);
  }
  if (req.url.split('?')[0] !== '/js/garage3d.js' || !fs.existsSync(BUNDLE)) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader('Content-Type', 'text/javascript');
  fs.createReadStream(BUNDLE).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(url);
  await page.waitForFunction(() => window.__api, null, { timeout: 60000 });

  for (const [name, t] of [['assemblata', 0]]) {
    await page.evaluate(t => window.__api.snap(t), t);
    const png = await page.locator('#s').screenshot({ omitBackground: true });
    const webp = await page.evaluate(
      async ([b64, w, h]) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        return c.toDataURL('image/webp', 0.82).split(',')[1];
      },
      [png.toString('base64'), W, H]
    );
    fs.writeFileSync(
      path.join(FRONTEND, 'images', `auto-${name}.webp`),
      Buffer.from(webp, 'base64')
    );
    console.log(`auto-${name}.webp`, Math.round(Buffer.from(webp, 'base64').length / 1024) + ' KB');
  }

  await browser.close();
  server.close();
})();
