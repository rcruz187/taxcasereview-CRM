/* RomyLabs admin production guard.
   Keeps platform-level UI isolated from tenant branding and normalizes product
   launch destinations while the legacy AdminPortal registry is refactored.
   Scoped to admin.romylabs.com only. */
(function () {
  if (window.location.hostname !== 'admin.romylabs.com') return;

  var CRM_URL_MAP = {
    'https://www.camvella.com': 'https://app.camvella.com',
    'https://camvella.com': 'https://app.camvella.com',
    'https://www.arcvena.com': 'https://app.arcvena.com',
    'https://arcvena.com': 'https://app.arcvena.com'
  };

  function normalizeUrl(url) {
    if (!url) return url;
    var trimmed = String(url).replace(/\/$/, '');
    return CRM_URL_MAP[trimmed] || url;
  }

  // AdminPortal currently uses window.open(product.url) for product launch
  // buttons. Normalize those destinations before the browser opens the tab.
  var nativeOpen = window.open;
  window.open = function (url, target, features) {
    return nativeOpen.call(window, normalizeUrl(url), target, features);
  };

  function fixPlatformUI() {
    // Normalize the legacy hard-coded Platform Owner address.
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.indexOf('romy@taxrescrm.net') !== -1) {
        node.nodeValue = node.nodeValue.replace(/romy@taxrescrm\.net/g, 'romy@romylabs.com');
      }
    }

    // Any direct anchor launch should also point to the product application,
    // never the public marketing site.
    var anchors = document.querySelectorAll('a[href]');
    for (var a = 0; a < anchors.length; a++) {
      var href = anchors[a].getAttribute('href');
      var normalized = normalizeUrl(href);
      if (normalized !== href) anchors[a].setAttribute('href', normalized);
    }

    // The global Overview header must never render a tenant logo. Find the
    // RomyLabs Platform subtitle, then remove only the image in that header.
    var all = document.querySelectorAll('div');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children.length === 0 && /^RomyLabs Platform\s*[—-]/.test((el.textContent || '').trim())) {
        var header = el.parentElement;
        if (!header) continue;
        var imgs = header.querySelectorAll('img');
        for (var j = 0; j < imgs.length; j++) {
          var src = imgs[j].getAttribute('src') || '';
          if (src.indexOf('romylabs-logo') === -1) imgs[j].remove();
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
