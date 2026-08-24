/* RomyLabs admin production guard.
   Keeps platform-level UI isolated from TaxRes tenant branding while the legacy
   AdminPortal component is refactored. Scoped to admin.romylabs.com only. */
(function () {
  if (window.location.hostname !== 'admin.romylabs.com') return;

  function fixPlatformUI() {
    // Normalize the legacy hard-coded Platform Owner address.
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.indexOf('romy@taxrescrm.net') !== -1) {
        node.nodeValue = node.nodeValue.replace(/romy@taxrescrm\.net/g, 'romy@romylabs.com');
      }
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
      characterData: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
