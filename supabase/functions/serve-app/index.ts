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
    <\/script>
    <title>TaxRes CRM<\/title>
    <link rel="icon" type="image/png" href="https://raw.githubusercontent.com/taxresolutioncrm/taxcasereview-CRM/gh-pages/favicon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <script type="module" crossorigin src="https://raw.githubusercontent.com/taxresolutioncrm/taxcasereview-CRM/gh-pages/assets/index-Dtmn5plU.js"><\/script>
    <link rel="stylesheet" crossorigin href="https://raw.githubusercontent.com/taxresolutioncrm/taxcasereview-CRM/gh-pages/assets/index-DVq7vtti.css">
  <\/head>
  <body>
    <div id="root"><\/div>
  <\/body>
<\/html>`;

Deno.serve((_req: Request) => {
  return new Response(INDEX_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
});
