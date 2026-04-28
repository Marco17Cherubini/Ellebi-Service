/**
 * Legal Footer — inietta automaticamente il footer con link Iubenda
 * (Privacy Policy + Cookie Policy) e carica lo script Iubenda una sola volta.
 *
 * Uso: <script src="/js/legal-footer.js"></script> prima di </body>.
 */
(function (w, d) {
  // Evita doppio inserimento se lo script viene incluso più volte
  if (d.getElementById('legal-footer')) return;

  // ── Footer markup ───────────────────────────────────────────────
  var footer = d.createElement('footer');
  footer.id = 'legal-footer';
  footer.className = 'legal-footer';
  footer.style.cssText =
    'text-align:center;padding:20px 16px;font-size:0.85rem;' +
    'opacity:0.75;line-height:1.6;margin-top:auto;';

  var year = new Date().getFullYear();
  footer.innerHTML =
    '<div>&copy; ' + year + ' Ellebi Service SRL &middot; ' +
    'P.IVA / C.F. — Via Zerbi 21, San Giuliano Vecchio, Alessandria</div>' +
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

  // ── Iubenda loader ──────────────────────────────────────────────
  var loader = function () {
    if (d.getElementById('iubenda-cdn-script')) return;
    var s = d.createElement('script');
    s.id = 'iubenda-cdn-script';
    s.src = 'https://cdn.iubenda.com/iubenda.js';
    var tag = d.getElementsByTagName('script')[0];
    tag.parentNode.insertBefore(s, tag);
  };
  if (w.addEventListener) {
    w.addEventListener('load', loader, false);
  } else if (w.attachEvent) {
    w.attachEvent('onload', loader);
  } else {
    w.onload = loader;
  }
})(window, document);
