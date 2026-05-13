/**
 * Legal Footer — inietta automaticamente il footer con link Iubenda
 * (Privacy Policy + Cookie Policy) e carica lo script Iubenda una sola volta.
 *
 * Usa il pattern "sticky footer": body diventa flex column, il contenuto
 * principale cresce e il footer resta ancorato in fondo al viewport.
 *
 * Uso: <script src="/js/legal-footer.js"></script> prima di </body>.
 */
(function (w, d) {
  // Evita doppio inserimento se lo script viene incluso più volte
  if (d.getElementById('legal-footer')) return;

  // ── CSS sticky footer pattern (iniettato runtime) ───────────────
  var style = d.createElement('style');
  style.id = 'legal-footer-style';
  style.textContent =
    'html, body { min-height: 100vh; }' +
    'body { display: flex; flex-direction: column; }' +
    'body > *:not(#legal-footer):not(script):not(style) { flex-shrink: 0; }' +
    '.center-container { flex: 1 0 auto !important; min-height: auto !important; }' +
    '#legal-footer {' +
      'flex-shrink: 0;' +
      'text-align: center;' +
      'padding: 16px 12px;' +
      'font-size: 0.8rem;' +
      'opacity: 0.75;' +
      'line-height: 1.5;' +
      'border-top: 1px solid rgba(128,128,128,0.15);' +
      'margin-top: 24px;' +
    '}' +
    '#legal-footer a { color: inherit; text-decoration: underline; margin: 0 4px; }' +
    '#legal-footer a:hover { opacity: 0.9; }';
  d.head.appendChild(style);

  // ── Footer markup ───────────────────────────────────────────────
  var footer = d.createElement('footer');
  footer.id = 'legal-footer';

  var year = new Date().getFullYear();
  footer.innerHTML =
    '<div>&copy; ' + year + ' Ellebi Service SRL</div>' +
    '<div style="margin-top:4px;">P.IVA 02686660065 &middot; PEC: ellebi_service@legalmail.it</div>' +
    '<div style="margin-top:4px;">' +
      'Via Zerbi 21, San Giuliano Vecchio, Alessandria &middot; ' +
      '<a href="mailto:ellebi_service@libero.it">ellebi_service@libero.it</a>' +
    '</div>' +
    '<div style="margin-top:6px;">' +
      '<a href="https://www.iubenda.com/privacy-policy/85215680" ' +
        'class="iubenda-white iubenda-noiframe iubenda-embed" ' +
        'title="Privacy Policy">Privacy Policy</a>' +
      ' &middot; ' +
      '<a href="https://www.iubenda.com/privacy-policy/85215680/cookie-policy" ' +
        'class="iubenda-white iubenda-noiframe iubenda-embed" ' +
        'title="Cookie Policy">Cookie Policy</a>' +
    '</div>';
  d.body.appendChild(footer);

  // ── Iubenda Cookie Consent Banner ───────────────────────────────────
  w._iub = w._iub || [];
  w._iub.csConfiguration = {
    "askConsentAtCookiePolicyUpdate": true,
    "cookiePolicyId": 85215680,
    "lang": "it",
    "banner": {
      "acceptButtonDisplay": true,
      "customizeButtonDisplay": true,
      "rejectButtonDisplay": true,
      "position": "float-bottom-center"
    }
  };

  // ── Iubenda loader ──────────────────────────────────────────────────
  var loader = function () {
    if (d.getElementById('iubenda-cdn-script')) return;
    
    // Script per le policy modali
    var s = d.createElement('script');
    s.id = 'iubenda-cdn-script';
    s.src = 'https://cdn.iubenda.com/iubenda.js';
    var tag = d.getElementsByTagName('script')[0] || d.body.lastChild;
    if (tag && tag.parentNode) {
      tag.parentNode.insertBefore(s, tag);
    } else {
      d.body.appendChild(s);
    }

    // Script per il cookie banner
    var cs = d.createElement('script');
    cs.src = 'https://cdn.iubenda.com/cs/iubenda_cs.js';
    if (tag && tag.parentNode) {
      tag.parentNode.insertBefore(cs, tag);
    } else {
      d.body.appendChild(cs);
    }
  };
  
  if (w.addEventListener) {
    w.addEventListener('load', loader, false);
  } else if (w.attachEvent) {
    w.attachEvent('onload', loader);
  } else {
    w.onload = loader;
  }
})(window, document);
