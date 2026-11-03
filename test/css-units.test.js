// Layout mobile first in percentuale: larghezze di pagine, colonne, schede, finestre e menu
// si esprimono in % (o frazioni di griglia), non in px. Restano in px solo i piccoli elementi
// (icone, caselle, interruttori) e la soglia minima di 44-48 px per il tocco. I punti di
// cambio sono in em: CSS non accetta percentuali nelle media query.
// Regressione: colonne e tabelle a larghezza fissa rendevano il sito "desktop first".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const STYLES = path.join(__dirname, '../frontend/styles');
const MAX_FIXED_PX = 48;

function cssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return cssFiles(p);
    return e.name.endsWith('.css') ? [p] : [];
  });
}

const LAYOUT_PROPS =
  /^\s*(width|min-width|max-width|flex|flex-basis|grid-template-columns|left|right|padding-left|padding-right)\s*:\s*([^;]+);/;

test('le larghezze del layout sono in percentuale, non in px', () => {
  const offenders = [];
  for (const file of cssFiles(STYLES)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = line.match(LAYOUT_PROPS);
      if (!m) return;
      for (const [, n] of m[2].matchAll(/(\d+(?:\.\d+)?)px/g)) {
        if (Number(n) > MAX_FIXED_PX) {
          offenders.push(`${path.relative(STYLES, file)}:${i + 1} ${line.trim()}`);
        }
      }
    });
  }
  assert.deepEqual(offenders, []);
});

test('i punti di cambio del layout sono in em, non in px', () => {
  const offenders = [];
  for (const file of cssFiles(STYLES)) {
    const css = fs.readFileSync(file, 'utf8');
    for (const m of css.matchAll(/@media[^{]*\d+px[^{]*/g)) {
      offenders.push(`${path.relative(STYLES, file)}: ${m[0].trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});
