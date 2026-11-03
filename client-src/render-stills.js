// Genera le immagini statiche dell'auto (assemblata ed esplosa) e le posizioni delle
// etichette dal modello 3D vero, così immagine e 3D coincidono.
// Uso: `npm run build:3d && npm run render:stills` (richiede Playwright con Chromium).
// Scrive frontend/images/auto-{assemblata,esplosa}.webp e gli attributi data-x/y-…
// delle etichette (.hotspot) in frontend/index.html. Non va distribuito al browser.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
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
  const file = path.join(FRONTEND, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(FRONTEND) || !fs.existsSync(file)) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader(
    'Content-Type',
    file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'
  );
  fs.createReadStream(file).pipe(res);
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

  const positions = {};
  for (const [name, t] of [
    ['assemblata', 0],
    ['esplosa', 1]
  ]) {
    positions[name] = await page.evaluate(t => {
      window.__api.snap(t);
      return window.__api.positions();
    }, t);
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

  // Coordinate delle etichette nell'HTML (percentuali sul riquadro dell'immagine)
  const indexPath = path.join(FRONTEND, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  for (const part of Object.keys(positions.assemblata)) {
    const a = positions.assemblata[part];
    const e = positions.esplosa[part];
    const re = new RegExp(
      `(data-part="${part}"[\\s\\S]*?style=")[^"]*("[\\s\\S]*?data-x-esplosa=")[^"]*("[\\s\\S]*?data-y-esplosa=")[^"]*("[\\s\\S]*?data-x-assemblata=")[^"]*("[\\s\\S]*?data-y-assemblata=")[^"]*(")`
    );
    if (!re.test(html)) throw new Error('Etichetta non trovata: ' + part);
    html = html.replace(re, `$1--x: ${a.x}; --y: ${a.y}$2${e.x}$3${e.y}$4${a.x}$5${a.y}$6`);
  }
  fs.writeFileSync(indexPath, html);
  console.log(JSON.stringify(positions));

  await browser.close();
  server.close();
})();
