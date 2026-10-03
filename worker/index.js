// Runs only for the paths listed in wrangler.jsonc "run_worker_first".
// Everything else is served straight from the static files in dist/.

// Original listings archived on 2026-10-03; each piece now lives under a new name.
const RENAMED = {
  'jewelry-example-product-1': 'terracotta-rose-pendant',
  'pendant-copy': 'noir-tulip-drops',
  'spring-drop-earring': 'blush-bouquet-drops',
  'pendant-copy-1': 'honeybee-garden-drops',
};

const REDIRECTS = [
  [/^\/products?\/(jewelry-example-product-1|pendant-copy|spring-drop-earring|pendant-copy-1)\/?$/, m => `/product/${RENAMED[m[1]]}`],
  // Old Shopify-style URLs, so links shared before the rebuild keep working.
  [/^\/products\/([^/]+)\/?$/, m => `/product/${m[1]}`],
  [/^\/collections(\/.*)?$/, () => '/shop'],
  [/^\/pages\/about\/?$/, () => '/about'],
  [/^\/pages\/contact\/?$/, () => '/contact'],
  [/^\/policies\/privacy-policy\/?$/, () => '/privacy-policy'],
  [/^\/policies\/terms-of-service\/?$/, () => '/terms-conditions'],
  [/^\/cart\/?$/, () => '/'],
  [/^\/(account|search)(\/.*)?$/, () => '/shop'],
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
