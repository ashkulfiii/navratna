// Builds the static site into ./dist
// Usage: node build.mjs
// - Pulls live products from Shopify at build time (falls back to src/data/products.snapshot.json)
// - Renders every page in src/pages with the shared header, footer and cart drawer
// - Pre-renders one page per product so each has its own title, meta and share card
// The browser then refreshes prices and stock live, so nothing goes stale between builds.

import { readFile, writeFile, mkdir, readdir, cp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { config } from './src/config.js';

const SRC = 'src';
const OUT = 'dist';
const API = `https://${config.shopify.domain}/api/${config.shopify.apiVersion}/graphql.json`;

import { esc, money, img, cardHTML, EMPTY_GRID } from './src/assets/render.js';
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

/* ---------- data ---------- */
const PRODUCT_FIELDS = `
  id handle title description descriptionHtml availableForSale vendor updatedAt createdAt tags
  seo { title description }
  featuredImage { url altText width height }
  images(first: 10) { nodes { url altText width height } }
  options { name optionValues { name } }
  variants(first: 50) { nodes { id title availableForSale selectedOptions { name value } price { amount currencyCode } } }
  priceRange { minVariantPrice { amount currencyCode } }
`;

async function loadProducts() {
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ products(first: 100, sortKey: CREATED_AT) { nodes { ${PRODUCT_FIELDS} } } }` }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    const products = json.data.products.nodes;
    await writeFile(join(SRC, 'data/products.snapshot.json'), JSON.stringify(products, null, 2));
    console.log(`✓ ${products.length} products from Shopify`);
    return products;
  } catch (e) {
    console.warn(`! Shopify unreachable at build (${e.message}). Using snapshot.`);
    return JSON.parse(await readFile(join(SRC, 'data/products.snapshot.json'), 'utf8'));
  }
}

/* ---------- partial renderers (shared with the browser via src/assets/render.js) ---------- */
function picks(products) {
  const byHandle = Object.fromEntries(products.map(p => [p.handle, p]));
  const chosen = config.shopify.bestsellers.map(h => byHandle[h]).filter(Boolean);
  return (chosen.length ? chosen : products).slice(0, 3);
}

function head({ title, description, path, ogTitle, ogDescription, image, jsonld, robots }) {
  const url = config.siteUrl + (path === '/' ? '' : path);
  const share = image || config.assets.shareImage;
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="Navratna">
${robots ? `<meta name="robots" content="${esc(robots)}">` : ''}
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.brand)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(ogDescription || description)}">
<meta property="og:image" content="${esc(share)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(config.twitterTitle)}">
<meta name="twitter:description" content="${esc(config.twitterDescription)}">
<meta name="twitter:image" content="${esc(share)}">
<meta name="theme-color" content="#f8f6f2">
<link rel="icon" type="image/png" href="${esc(img(config.assets.logoHeader, 64))}">
<link rel="apple-touch-icon" href="${esc(img(config.assets.logoHeader, 180))}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://cdn.shopify.com" crossorigin>
<link rel="preconnect" href="https://${config.shopify.domain}" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Poppins:wght@300;400;500;600&display=swap">
<link rel="stylesheet" href="/assets/site.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
<script>window.NAVRATNA=${JSON.stringify({ shopify: config.shopify, shipping: config.shipping, homeLimit: config.homeLimit }).replace(/</g, '\\u003c')};</script>`;
}

/* ---------- templating ---------- */
function render(tpl, ctx) {
  return tpl.replace(/\{\{\s*([\w.:-]+)\s*\}\}/g, (_, key) => {
    const v = key in ctx ? ctx[key] : get(ctx, key);
    if (v === undefined) throw new Error(`Unknown template key {{${key}}}`);
    return typeof v === 'function' ? v() : v;
  });
}

function parsePage(raw) {
  const m = raw.match(/^<!--\s*page\s*([\s\S]*?)-->\s*/);
  if (!m) throw new Error('Page is missing its <!-- page {...} --> header');
  return { meta: JSON.parse(m[1]), body: raw.slice(m[0].length) };
}

async function write(path, html) {
  const file = join(OUT, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}

/* ---------- build ---------- */
const products = await loadProducts();

async function loadPrivacy() {
  if (!config.policies?.privacyFromShopify) return null;
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ shop { privacyPolicy { body } } }' }), signal: AbortSignal.timeout(15000) });
    const body = (await res.json()).data?.shop?.privacyPolicy?.body;
    return body ? `<div class="prose policy">${body}</div>` : null;
  } catch { return null; }
}
const shopPrivacy = await loadPrivacy();
const best = picks(products);

const partials = {};
for (const f of await readdir(join(SRC, 'layout'))) partials[f.replace('.html', '')] = await readFile(join(SRC, 'layout', f), 'utf8');

const ctx = {
  ...config,
  year: String(new Date().getFullYear()),
  grid: products.map(p => cardHTML(p)).join('') || EMPTY_GRID,
  homeGrid: products.slice(0, config.homeLimit).map(p => cardHTML(p)).join('') || EMPTY_GRID,
  viewAllHidden: products.length > config.homeLimit ? '' : 'hidden',
  count: `${products.length} ${products.length === 1 ? 'piece' : 'pieces'}`,
  bestsellers: best.map(p => cardHTML(p)).join(''),
  featurePair: best.slice(0, 2).map(p => cardHTML(p, { width: 1400 })).join(''),
};
for (const [k, v] of Object.entries(partials)) ctx[k] = () => render(v, ctx);
ctx.privacy = shopPrivacy || ctx['privacy-default'];

await rm(OUT, { recursive: true, force: true });
await cp(join(SRC, 'assets'), join(OUT, 'assets'), { recursive: true });

const urls = [];
for (const f of (await readdir(join(SRC, 'pages'))).filter(f => f.endsWith('.html'))) {
  const { meta, body } = parsePage(await readFile(join(SRC, 'pages', f), 'utf8'));
  if (meta.template === 'product') continue;
  const html = `<!doctype html><html lang="en"><head>${head(meta)}</head><body>${render(body, ctx)}</body></html>`;
  await write(meta.out, html);
  if (meta.sitemap !== false) urls.push(meta.path);
}

// Product pages: one static page per product, plus a fallback for products added after the last build.
const { meta: pMeta, body: pBody } = parsePage(await readFile(join(SRC, 'pages', 'product.html'), 'utf8'));
const productPage = (p) => {
  const image = p?.featuredImage || p?.images?.nodes?.[0];
  const v = p?.variants.nodes.find(x => x.availableForSale) || p?.variants.nodes[0];
  const title = p ? `${p.seo?.title || p.title} | Navratna` : 'The Collection | Navratna';
  const description = p ? (p.seo?.description || p.description).slice(0, 155) : pMeta.description;
  const jsonld = p && {
    '@context': 'https://schema.org', '@type': 'Product', name: p.title, description: p.description,
    image: p.images.nodes.map(i => i.url), brand: { '@type': 'Brand', name: config.brand },
    offers: { '@type': 'Offer', priceCurrency: v.price.currencyCode, price: Number(v.price.amount).toFixed(2),
      availability: `https://schema.org/${p.availableForSale ? 'InStock' : 'OutOfStock'}`,
      url: `${config.siteUrl}/product/${p.handle}` },
  };
  const pctx = {
    ...ctx,
    pdp: {
      prerendered: p ? esc(JSON.stringify({ variants: p.variants, options: p.options })) : '',
      image: image ? `<img src="${esc(img(image.url, 1400))}" alt="${esc(image.altText || p.title)}">` : '<div class="skeleton" style="width:100%;height:100%"></div>',
      title: p ? esc(p.title) : '&nbsp;',
      price: v ? money(v.price) : '&nbsp;',
      desc: p ? (p.descriptionHtml || esc(p.description)) : '',
    },
  };
  return `<!doctype html><html lang="en"><head>${head({ title, description, path: p ? `/product/${p.handle}` : '/product', image: image?.url, jsonld })}</head><body>${render(pBody, pctx)}</body></html>`;
};
for (const p of products) { await write(`product/${p.handle}/index.html`, productPage(p)); urls.push(`/product/${p.handle}`); }
await write('product/index.html', productPage(null));

await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${config.siteUrl}${u === '/' ? '/' : u}</loc></url>`).join('\n')}\n</urlset>\n`);
await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${config.siteUrl}/sitemap.xml\n`);

console.log(`✓ Built ${urls.length} pages into ${OUT}/`);
