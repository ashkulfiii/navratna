# Navratna by Navya — storefront

Custom storefront for navratnanavya.com. Shopify holds products, inventory, orders and checkout. Everything the customer sees is code in this repo, edited through Claude.

## How it works
- `src/config.js` — store domain, brand assets (hosted in Shopify Files), contact details, bestseller picks.
- `src/pages/*.html` — one file per page. The `<!-- page {...} -->` header sets the URL, title bar and meta description.
- `src/layout/` — header, footer and cart drawer shared by every page.
- `src/assets/site.css` — all styles. Colour and font tokens sit at the top in `:root`.
- `src/assets/site.js` — live products and cart from Shopify's Storefront API (tokenless, no keys), cart drawer with discount codes and "Save for later", product pages, collection toolbar (sort, color filter, three layouts), saved pieces.
- `src/assets/render.js` — product card and tile markup shared by `build.mjs` and `site.js`. Change cards here only.
- `src/pages/saved.html` — the hearted pieces page. Saved pieces live in the shopper's browser (localStorage), so they are per device.
- Color filter reads Shopify product tags written as `Color: Pink`. It stays hidden until at least one product has such a tag.
- Privacy page: `config.policies.privacyFromShopify` switches it to Shopify's own policy. Keep it `false` until the store address and email in Shopify are correct.
- `build.mjs` — `node build.mjs` writes the finished site to `dist/`, with one pre-rendered page per product, plus `sitemap.xml` and `robots.txt`.

## Rules for editing
- Prices, stock, product photos and descriptions are edited in Shopify admin (or through the Shopify connector), never hard-coded here.
- Checkout always goes to Shopify's hosted checkout via `cart.checkoutUrl`.
- Products added in Shopify appear on the site immediately (the browser loads them live). A redeploy adds their pre-rendered page for search engines.
- Keep product card markup in `src/assets/render.js` so build-time and live cards match.
- Run `node build.mjs` after every change and check it finishes without errors before pushing.

## Deploy (Cloudflare Workers, account ash@kulfiii.com)
- `wrangler.jsonc` defines the Worker `navratna`. Its `build.command` runs `node build.mjs`, so `npx wrangler deploy` builds and deploys in one step.
- Static files in `dist/` are served directly. `worker/index.js` runs only for `/product/*` (fallback page for products added after the last deploy) and old Shopify URLs (`/products/*`, `/collections/*`, `/pages/*`, `/policies/*`), which it 301-redirects.
- URLs have no trailing slash (`html_handling: drop-trailing-slash`). Unknown URLs get `404.html`.
- Workers Builds is connected to GitHub `ashkulfiii/navratna`: every push to `main` runs `npx wrangler deploy`. Pushes to other branches create preview URLs.
- Local check: `npx wrangler dev`, then open http://localhost:8787.
