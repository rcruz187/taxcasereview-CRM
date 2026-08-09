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
    <script type="text/javascript">
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "xyck7g2mfl");
    </script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-M6J80B65LG"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-M6J80B65LG');
    </script>
    <script type="module" crossorigin src="/functions/v1/serve-app/assets/index-Dtmn5plU.js"></script>
    <link rel="stylesheet" crossorigin href="/functions/v1/serve-app/assets/index-DVq7vtti.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

const STATIC_EXTENSIONS = new Set([
  'js','css','png','jpg','jpeg','gif','svg','ico','woff','woff2','ttf','eot',
  'pdf','json','webp','mp4','webm','txt','xml','map'
]);

function getExt(pathname: string): string {
  const parts = pathname.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function getMimeType(ext: string): string {
  const mime: Record<string, string> = {
    js: 'application/javascript', css: 'text/css', png: 'image/png',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    svg: 'image/svg+xml', ico: 'image/x-icon', woff: 'font/woff',
    woff2: 'font/woff2', ttf: 'font/ttf', pdf: 'application/pdf',
    json: 'application/json', webp: 'image/webp', txt: 'text/plain',
    xml: 'application/xml', map: 'application/json',
  };
  return mime[ext] || 'application/octet-stream';
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  let pathname = url.pathname;

  // Strip function prefix
  const fnPrefix = '/functions/v1/serve-app';
  if (pathname.startsWith(fnPrefix)) {
    pathname = pathname.slice(fnPrefix.length) || '/';
  }
  if (!pathname || pathname === '') pathname = '/';

  const ext = getExt(pathname);
  const isStatic = STATIC_EXTENSIONS.has(ext);

  if (isStatic || pathname.startsWith('/assets/') || pathname.startsWith('/state-forms/') || pathname.startsWith('/templates/')) {
    const rawUrl = `${RAW_BASE}${pathname}`;
    try {
      const upstream = await fetch(rawUrl);
      if (!upstream.ok) {
        return new Response(`Not found: ${pathname}`, { status: 404 });
      }
      const body = await upstream.arrayBuffer();
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': getMimeType(ext),
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (e) {
      return new Response(`Proxy error: ${e}`, { status: 502 });
    }
  }

  // All routes → serve index.html (SPA)
  return new Response(INDEX_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
});
