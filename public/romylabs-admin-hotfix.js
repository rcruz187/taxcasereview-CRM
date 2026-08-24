/* RomyLabs admin production guard.
   Scoped to admin.romylabs.com only. */
(function () {
  if (window.location.hostname !== 'admin.romylabs.com') return;

  // Use the actual application deployments, never marketing or parked domains.
  // Camvella is restored to its default GitHub Pages origin while app.camvella.com
  // DNS is completed. Arcvena uses its Cloudflare Pages application origin.
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
