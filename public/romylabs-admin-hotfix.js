/* RomyLabs admin production guard — admin.romylabs.com only. */
(function () {
  if (window.location.hostname !== 'admin.romylabs.com') return;

  var CRM_URL_MAP = {
    'https://www.camvella.com': 'https://taxresolutioncrm.github.io/camvella/',
    'https://camvella.com': 'https://taxresolutioncrm.github.io/camvella/',
    'https://app.camvella.com': 'https://taxresolutioncrm.github.io/camvella/',
    'https://www.arcvena.com': 'https://arcvena-app.pages.dev/',
    'https://arcvena.com': 'https://arcvena-app.pages.dev/',
    'https://app.arcvena.com': 'https://arcvena-app.pages.dev/'
  };

  function normalizeUrl(url) {
    if (!url) return url;
    var raw = String(url);
    var trimmed = raw.replace(/\/$/, '');
    return CRM_URL_MAP[trimmed] || CRM_URL_MAP[raw] || url;
  }

  var nativeOpen = window.open;
  window.open = function (url, target, features) {
    return nativeOpen.call(window, normalizeUrl(url), target, features);
  };

  function cardDestination(el) {
    var node = el;
    while (node && node !== document.body) {
      var text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (/Camvella/.test(text) && /Open/.test(text)) return 'https://taxresolutioncrm.github.io/camvella/';
      if (/Arcvena/.test(text) && /Open/.test(text)) return 'https://arcvena-app.pages.dev/';
      node = node.parentElement;
    }
    return null;
  }

  // Capture before React/anchor handlers so product cards cannot send users to marketing/parked domains.
  document.addEventListener('click', function (e) {
    var clickable = e.target && e.target.closest ? e.target.closest('a,button') : null;
    if (!clickable) return;
    var label = (clickable.textContent || '').trim();
    if (!/^Open(?: CRM)?\s*→?$/.test(label)) return;
    var dest = cardDestination(clickable);
    if (!dest) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    nativeOpen.call(window, dest, '_blank');
  }, true);

  function removeResolvedAlert(textPattern) {
    var nodes = document.querySelectorAll('div,span,p,li');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!textPattern.test(text)) continue;
      var card = el;
      for (var j = 0; j < 5 && card && card !== document.body; j++, card = card.parentElement) {
        var style = window.getComputedStyle(card);
        if (style.borderRadius && style.borderRadius !== '0px' && card.children.length > 0) {
          card.style.display = 'none';
          break;
        }
      }
    }
  }

  function fixPlatformUI() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.indexOf('romy@taxrescrm.net') !== -1) {
        node.nodeValue = node.nodeValue.replace(/romy@taxrescrm\.net/g, 'romy@romylabs.com');
      }
    }

    var anchors = document.querySelectorAll('a[href]');
    for (var a = 0; a < anchors.length; a++) {
      var href = anchors[a].getAttribute('href');
      var normalized = normalizeUrl(href);
      if (normalized !== href) anchors[a].setAttribute('href', normalized);
    }

    // Resolved items must not remain in Needs Attention.
    removeResolvedAlert(/deceptive\s+page|deceptive\s+pages|google.*deceptive/i);
    removeResolvedAlert(/camvella.*provision-org|provision-org.*camvella/i);
    removeResolvedAlert(/arcvena.*dns|dns.*arcvena/i);

    // RomyLabs global overview must not inherit a tenant logo.
    var all = document.querySelectorAll('div');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children.length === 0 && /^RomyLabs Platform\s*[—-]/.test((el.textContent || '').trim())) {
        var header = el.parentElement;
        if (!header) continue;
        var imgs = header.querySelectorAll('img');
        for (var k = 0; k < imgs.length; k++) {
          var src = imgs[k].getAttribute('src') || '';
          if (src.indexOf('romylabs-logo') === -1) imgs[k].remove();
        }
      }
    }
  }

  function start() {
    fixPlatformUI();
    new MutationObserver(fixPlatformUI).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href']
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
