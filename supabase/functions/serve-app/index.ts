const RAW_BASE = "https://raw.githubusercontent.com/taxresolutioncrm/taxcasereview-CRM/gh-pages";

const MIME: Record<string, string> = {
  js: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
  pdf: 'application/pdf', webp: 'image/webp', map: 'application/json',
};

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const full = url.pathname;

  // Supabase strips /functions/v1 but keeps the function name
  // So path arrives as /serve-app/... or /serve-app
  const PREFIX = '/serve-app';
  let asset = full.startsWith(PREFIX) ? full.slice(PREFIX.length) : full;
  if (!asset || asset === '') asset = '/';

  const ext = (asset.split('.').pop() ?? '').toLowerCase();

  // Static asset — proxy from GitHub raw with correct MIME
  if (ext && MIME[ext]) {
    try {
      const upstream = await fetch(`${RAW_BASE}${asset}`);
      if (!upstream.ok) return new Response('Not found', { status: 404 });
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
      return new Response(`Error: ${e}`, { status: 502 });
    }
  }

  // All other routes → serve the React SPA index.html from GitHub raw
  // Fetch it from raw.githubusercontent.com to get the real built index.html
  // then rewrite the asset paths to go through this edge function
  try {
    const indexResp = await fetch(`${RAW_BASE}/index.html`);
    let html = await indexResp.text();
    
    // Rewrite asset paths from /assets/ to /functions/v1/serve-app/assets/
    // so the browser requests them through this edge function with correct MIME types
    html = html.replace(/src="\/assets\//g, 'src="/functions/v1/serve-app/assets/');
    html = html.replace(/href="\/assets\//g, 'href="/functions/v1/serve-app/assets/');
    html = html.replace(/href="\/favicon/g, 'href="/functions/v1/serve-app/favicon');

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return new Response(`Error loading app: ${e}`, { status: 502 });
  }
});
