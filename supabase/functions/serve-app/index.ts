const RAW_BASE = "https://raw.githubusercontent.com/taxresolutioncrm/taxcasereview-CRM/gh-pages";

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="theme-color" content="#0a0f1a" />
    <script>
      (function(){
        var redirect = sessionStorage.redirect;
        delete sessionStorage.redirect;
        if (redirect && redirect !== location.href) {
          history.replaceState(null, null, redirect);
        }
      })();
    </script>
    <title>TaxRes CRM</title>
    <link rel="icon" type="image/png" href="/functions/v1/serve-app/favicon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <script type="module" crossorigin src="/functions/v1/serve-app/assets/index-Dtmn5plU.js"></script>
    <link rel="stylesheet" crossorigin href="/functions/v1/serve-app/assets/index-DVq7vtti.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

const MIME: Record<string, string> = {
  js: 'application/javascript',
  css: 'text/css',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  pdf: 'application/pdf',
  webp: 'image/webp',
  map: 'application/json',
};

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const full = url.pathname;

  // Supabase passes the path WITH the function prefix stripped already
  // So req.url.pathname for /functions/v1/serve-app/assets/foo.js
  // arrives as just /assets/foo.js inside the function
  // BUT sometimes it arrives as /functions/v1/serve-app/assets/foo.js
  // Handle both cases:
  const PREFIX = '/functions/v1/serve-app';
  const asset = full.startsWith(PREFIX) ? full.slice(PREFIX.length) : full;
  const cleanAsset = asset || '/';

  // Debug: return the path info for non-HTML requests to diagnose
  const ext = (cleanAsset.split('.').pop() ?? '').toLowerCase();

  if (ext && MIME[ext]) {
    const rawUrl = `${RAW_BASE}${cleanAsset}`;
    try {
      const upstream = await fetch(rawUrl);
      if (!upstream.ok) {
        // Return debug info to help trace the issue
        return new Response(
          `404: asset=${cleanAsset} full=${full} rawUrl=${rawUrl} upstream=${upstream.status}`,
          { status: 404, headers: { 'Content-Type': 'text/plain' } }
        );
      }
      const body = await upstream.arrayBuffer();
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': MIME[ext],
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (e) {
      return new Response(`Proxy error: ${e}`, { status: 502 });
    }
  }

  return new Response(INDEX_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
});
