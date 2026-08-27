/* RomyLabs admin production guard. Keep admin traffic on the canonical host and
 * protect the CRM reporting tab from the legacy conditional-hook crash until
 * the tab state is fully lifted into CommandCenter. */
(function () {
  var host = window.location.hostname.toLowerCase();

  /* /crm-admin belongs to the RomyLabs admin host. This also repairs stale
   * Chrome bookmarks/sessions that land on taxrescrm.app/crm-admin. */
  if ((host === 'taxrescrm.app' || host === 'www.taxrescrm.app') &&
      window.location.pathname.indexOf('/crm-admin') === 0) {
    window.location.replace(
      'https://admin.romylabs.com' + window.location.pathname +
      window.location.search + window.location.hash
    );
    return;
  }

  if (host !== 'admin.romylabs.com') return;

  var CAMVELLA_CRM = 'https://app.camvella.com';
  var ARCVENA_CRM = 'https://app.arcvena.com';

  function normalized(url) {
    try {
      var u = new URL(url, window.location.href);
      var targetHost = u.hostname.toLowerCase();
      if (targetHost === 'www.camvella.com' || targetHost === 'camvella.com' || targetHost === 'app.camvella.com') return CAMVELLA_CRM;
      if (targetHost === 'www.arcvena.com' || targetHost === 'arcvena.com' || targetHost === 'app.arcvena.com' || targetHost === 'arcvena-com.link' || targetHost === 'www.arcvena-com.link') return ARCVENA_CRM;
      return url;
    } catch (_) {
      return url;
    }
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

  /* Capture Open actions before React/anchor navigation. */
  document.addEventListener('click', function (event) {
    var clickable = event.target && event.target.closest ? event.target.closest('a,button') : null;
    if (!clickable) return;

    var href = clickable.getAttribute && clickable.getAttribute('href');
    var direct = href ? normalized(href) : href;
    var label = (clickable.textContent || '').replace(/\s+/g, ' ').trim();
    var product = productFromCard(clickable);
    var forced = crmFor(product);

    /* The CRM reporting view currently contains a state hook inside a
     * tab-conditional render. Switching to it client-side changes hook order
     * and can crash CommandCenter. A document navigation makes CRM the initial
     * tab so hook order stays stable and the portal remains usable. */
    if (label === 'CRM' && window.location.pathname.indexOf('/crm-admin') === 0) {
      var params = new URLSearchParams(window.location.search);
      if (params.get('tab') !== 'crm') {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        params.set('tab', 'crm');
        window.location.assign(window.location.pathname + '?' + params.toString());
        return;
      }
    }

    if (direct && direct !== href) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      window.open(direct, '_blank', 'noopener,noreferrer');
      return;
    }

    if (/^Open(?: CRM)?\s*→?$/i.test(label) && forced) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      window.open(forced, '_blank', 'noopener,noreferrer');
    }
  }, true);

  function removeResolvedAlert(pattern) {
    var nodes = document.querySelectorAll('div,span,p,li');
    for (var i = 0; i < nodes.length; i++) {
      var text = (nodes[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (!pattern.test(text)) continue;
      var card = nodes[i];
      for (var j = 0; j < 5 && card && card !== document.body; j++, card = card.parentElement) {
        if (card.children && card.children.length > 0) {
          card.style.display = 'none';
          break;
        }
      }
    }
  }

  function rewrite() {
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

    removeResolvedAlert(/GSC deceptive pages review pending/i);
    removeResolvedAlert(/arcvena\.com DNS cutover not complete/i);
    removeResolvedAlert(/provision-org edge fn not yet deployed/i);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rewrite, { once: true });
  } else {
    rewrite();
  }

  /* React renders cards asynchronously. Re-run briefly without a mutation loop. */
  var count = 0;
  var timer = window.setInterval(function () {
    rewrite();
    count += 1;
    if (count >= 20) window.clearInterval(timer);
  }, 500);
})();
