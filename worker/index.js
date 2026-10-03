// Runs only for the paths listed in wrangler.jsonc "run_worker_first".
// Everything else is served straight from the static files in dist/.

const REDIRECTS = [
  // Old Shopify-style URLs, so links shared before the rebuild keep working.
  [/^\/products\/([^/]+)\/?$/, m => `/product/${m[1]}`],
  [/^\/collections(\/.*)?$/, () => '/shop'],
  [/^\/pages\/about\/?$/, () => '/about'],
  [/^\/pages\/contact\/?$/, () => '/contact'],
  [/^\/policies\/privacy-policy\/?$/, () => '/privacy-policy'],
  [/^\/policies\/terms-of-service\/?$/, () => '/terms-conditions'],
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    for (const [re, to] of REDIRECTS) {
      const m = url.pathname.match(re);
      if (m) return Response.redirect(new URL(to(m), url.origin).toString(), 301);
    }

    // Product pages: serve the pre-rendered page when it exists. A product added in
    // Shopify after the last deploy gets the shared product page, which loads it live.
    if (url.pathname.startsWith('/product/')) {
      const page = await env.ASSETS.fetch(request);
      if (page.status !== 404) return page;
      const fallback = await env.ASSETS.fetch(new URL('/product', url.origin));
      return new Response(fallback.body, { status: 200, headers: fallback.headers });
    }

    return env.ASSETS.fetch(request);
  },
};
