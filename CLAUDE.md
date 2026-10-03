# Navratna by Navya — storefront

Custom storefront for navratnanavya.com. Shopify holds products, inventory, orders and checkout. Everything the customer sees is code in this repo, edited through Claude.

## How it works
- `src/config.js` — store domain, brand assets (hosted in Shopify Files), contact details, bestseller picks.
- `src/pages/*.html` — one file per page. The `<!-- page {...} -->` header sets the URL, title bar and meta description.
- `src/layout/` — header, footer and cart drawer shared by every page.
- `src/assets/site.css` — all styles. Colour and font tokens sit at the top in `:root`.
- `src/assets/site.js` — live products and cart from Shopify's Storefront API (tokenless, no keys), cart drawer, product pages.
- `build.mjs` — `node build.mjs` writes the finished site to `dist/`, with one pre-rendered page per product, plus `sitemap.xml` and `robots.txt`.

## Rules for editing
- Prices, stock, product photos and descriptions are edited in Shopify admin (or through the Shopify connector), never hard-coded here.
- Checkout always goes to Shopify's hosted checkout via `cart.checkoutUrl`.
- Products added in Shopify appear on the site immediately (the browser loads them live). A redeploy adds their pre-rendered page for search engines.
- Keep the two card renderers in `build.mjs` and `site.js` in step, so live data swaps in without a layout jump.
- Run `node build.mjs` after every change and check it finishes without errors before pushing.

## Deploy
Vercel builds from `main` using `vercel.json` (build `node build.mjs`, output `dist`). Every push to `main` goes live.
