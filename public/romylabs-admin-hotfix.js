/* RomyLabs admin production guard — admin.romylabs.com only. */
(function () {
  if (window.location.hostname !== 'admin.romylabs.com') return;

  var CAMVELLA_CRM = 'https://taxresolutioncrm.github.io/camvella/';
  var ARCVENA_CRM = 'https://arcvena-app.pages.dev/';

  function normalized(url) {
    try {
      var u = new URL(url, window.location.href);
      var host = u.hostname.toLowerCase();
      if (host === 'www.camvella.com' || host === 'camvella.com' || host === 'app.camvella.com') return CAMVELLA_CRM;
      if (host === 'www.arcvena.com' || host === 'arcvena.com' || host === 'app.arcvena.com' || host === 'arcvena-com.link' || host === 'www.arcvena-com.link') return ARCVENA_CRM;
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
