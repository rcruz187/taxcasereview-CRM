/* RomyLabs admin production guard — canonical admin host + legacy product-link cleanup. */
/* CC_HIDE_FIX_20260827: never hide Command Center containers by textContent. */
(function () {
  var host = window.location.hostname.toLowerCase();
  var path = window.location.pathname;

  /* /crm-admin belongs to the RomyLabs admin host. Repair stale TaxRes links. */
  if ((host === 'taxrescrm.app' || host === 'www.taxrescrm.app') && path.indexOf('/crm-admin') === 0) {
    window.location.replace('https://admin.romylabs.com' + path + window.location.search + window.location.hash);
    return;
  }

  if (host !== 'admin.romylabs.com') return;

  /* admin.romylabs.com is a dedicated control-plane host. Never allow an
   * authenticated owner session to fall through to the TaxRes demo CRM shell.
   * Deep admin routes are preserved; root/CRM-shell routes return to portal. */
  if (path.indexOf('/crm-admin') !== 0 && path !== '/login' && path.indexOf('/auth/') !== 0) {
    window.location.replace('/crm-admin');
    return;
  }

  var CAMVELLA_CRM = 'https://app.camvella.com';
  var ARCVENA_CRM = 'https://app.arcvena.com';

  function normalized(url) {
    try {
      var u = new URL(url, window.location.href);
      var targetHost = u.hostname.toLowerCase();
      if (targetHost === 'www.camvella.com' || targetHost === 'camvella.com' || targetHost === 'app.camvella.com') return CAMVELLA_CRM;
      if (targetHost === 'www.arcvena.com' || targetHost === 'arcvena.com' || targetHost === 'app.arcvena.com' || targetHost === 'arcvena-com.link' || targetHost === 'www.arcvena-com.link') return ARCVENA_CRM;
      return url;
    } catch (_) { return url; }
  }

  function productFromCard(el) {
    var node = el;
    while (node && node !== document.body) {
      var text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (/\bCamvella\b/i.test(text)) return 'camvella';
      if (/\bArcvena\b/i.test(text)) return 'arcvena';
      node = node.parentElement;
    }
    return null;
  }

  function crmFor(product) {
    return product === 'camvella' ? CAMVELLA_CRM : product === 'arcvena' ? ARCVENA_CRM : null;
  }

  document.addEventListener('click', function (event) {
    var clickable = event.target && event.target.closest ? event.target.closest('a,button') : null;
    if (!clickable) return;
    var href = clickable.getAttribute && clickable.getAttribute('href');
    var direct = href ? normalized(href) : href;
    var label = (clickable.textContent || '').replace(/\s+/g, ' ').trim();
    var product = productFromCard(clickable);
    var forced = crmFor(product);
    if (direct && direct !== href) {
      event.preventDefault(); event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      window.open(direct, '_blank', 'noopener,noreferrer'); return;
    }
    if (/^Open(?: CRM)?\s*→?$/i.test(label) && forced) {
      event.preventDefault(); event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      window.open(forced, '_blank', 'noopener,noreferrer');
    }
  }, true);

  /* IMPORTANT: this guard must never hide or mutate rendered Command Center
   * containers based on textContent. Previous alert-cleanup code walked every
   * div/span/p/li and set display:none on matching ancestors; because Overview
   * contains the old alert phrases inside its own text tree, that could hide the
   * entire Command Center shortly after render. Product-link normalization is
   * intentionally limited to anchor hrefs only. */
  function rewriteLinks() {
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var oldHref = anchors[i].getAttribute('href');
      var newHref = normalized(oldHref);
      var product = productFromCard(anchors[i]);
      var forced = crmFor(product);
      var label = (anchors[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (/^Open(?: CRM)?\s*→?$/i.test(label) && forced) newHref = forced;
      if (newHref && newHref !== oldHref) anchors[i].setAttribute('href', newHref);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rewriteLinks, { once: true });
  else rewriteLinks();

  var count = 0;
  var timer = window.setInterval(function () { rewriteLinks(); count += 1; if (count >= 20) window.clearInterval(timer); }, 500);
})();
