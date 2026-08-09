const RAW_BASE = "https://raw.githubusercontent.com/taxresolutioncrm/taxcasereview-CRM/gh-pages";

const MIME: Record<string, string> = {
  js: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
  pdf: 'application/pdf', webp: 'image/webp', map: 'application/json',
  mjs: 'application/javascript; charset=utf-8',
};

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const full = url.pathname;

  const PREFIX = '/serve-app';
  let asset = full.startsWith(PREFIX) ? full.slice(PREFIX.length) : full;
  if (!asset || asset === '') asset = '/';

  const ext = (asset.split('.').pop() ?? '').toLowerCase();

  if (ext && MIME[ext]) {
    try {
      const upstream = await fetch(`${RAW_BASE}${asset}`);
      if (!upstream.ok) return new Response(`Not found: ${asset}`, { status: 404 });
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

  // SPA: fetch real index.html from gh-pages (now built with correct base path)
  try {
    const indexResp = await fetch(`${RAW_BASE}/index.html`);
    const html = await indexResp.text();
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return new Response(`Error: ${e}`, { status: 502 });
  }
});
