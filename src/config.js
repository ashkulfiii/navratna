// Single source of truth for store and brand settings.
// Edit here, run `node build.mjs`, push. Everything else reads from this file.

export const config = {
  siteUrl: 'https://navratnanavya.com',
  brand: 'Navratna by Navya',

  shopify: {
    // Tokenless Storefront API: products, collections and cart work without an access token.
    domain: '5rj0jf-xa.myshopify.com',
    apiVersion: '2025-07',
    // Collection shown under "Collection" on the home page. Use 'all' to show every product.
    homeCollection: 'all',
    // Product handles shown in the home page "Bestseller" strip (first 3 used).
    bestsellers: ['jewelry-example-product-1', 'pendant-copy', 'spring-drop-earring'],
    // Product handles for the tilted photo collage on the home page (6 shown).
    homeCollage: ['blush-bouquet-drops', 'honeybee-garden-drops', 'terracotta-rose-pendant', 'noir-tulip-drops', 'mint-garden-drops', 'coral-tulip-drops'],
  },

  assets: {
    logoHeader: 'https://cdn.shopify.com/s/files/1/0777/4509/4855/files/navratna-logo-header.png?v=1790991164',
    logoHero: 'https://cdn.shopify.com/s/files/1/0777/4509/4855/files/navratna-logo-full-hero.png?v=1790991164',
    logoFooter: 'https://cdn.shopify.com/s/files/1/0777/4509/4855/files/navratna-logo-cropped.png?v=1790991164',
    navya1: 'https://cdn.shopify.com/s/files/1/0777/4509/4855/files/navya-1.jpg?v=1790991164',
    navya2: 'https://cdn.shopify.com/s/files/1/0777/4509/4855/files/navya-2.jpg?v=1790991164',
    navya3: 'https://cdn.shopify.com/s/files/1/0777/4509/4855/files/navya-3.jpg?v=1790991164',
    // Social share image. Replace with a 1200x630 image uploaded to Shopify Files when ready.
    shareImage: 'https://cdn.shopify.com/s/files/1/0777/4509/4855/files/navratna-logo-full-hero.png?v=1790991164',
  },

  // Set to true once the store address and contact email in Shopify (Settings → Store details)
  // are correct: the privacy page will then show Shopify's own policy, refreshed on every build.
  policies: { privacyFromShopify: false },

  // Mirrors Shopify's Domestic shipping rule (Settings → Shipping and delivery). Update both together.
  shipping: { freeOverUSD: 70 },

  // Number of pieces shown in the home page collection before the "View all" link.
  homeLimit: 8,

  contact: {
    email: 'hello@navratnanavya.com',
    instagram: 'navratnanavya',
  },

  // Fallback share text used on pages that don't set their own.
  twitterTitle: 'Navratna | Heirloom Jewellery, Handcrafted',
  twitterDescription: 'Heirloom jewellery shaped by nine sacred gems. Handcrafted pendants, earrings and more from the Navratna atelier.',
};
