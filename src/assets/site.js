// Navratna storefront runtime.
// Talks to Shopify's Storefront API (tokenless) for live products and the cart.
// Checkout is Shopify's own hosted checkout (cart.checkoutUrl).

const CFG = window.NAVRATNA;
const API = `https://${CFG.shopify.domain}/api/${CFG.shopify.apiVersion}/graphql.json`;
const CART_KEY = 'navratna_cart_id';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = m => `${m.currencyCode} ${Number(m.amount).toFixed(2)}`;
const img = (url, w) => (url ? `${url}${url.includes('?') ? '&' : '?'}width=${w}` : '');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify responded ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

/* ---------- product data ---------- */
const PRODUCT_FIELDS = `
  id handle title description descriptionHtml availableForSale vendor
  seo { title description }
  featuredImage { url altText width height }
  images(first: 10) { nodes { url altText width height } }
  options { name optionValues { name } }
  variants(first: 50) { nodes { id title availableForSale selectedOptions { name value } price { amount currencyCode } } }
  priceRange { minVariantPrice { amount currencyCode } }
`;

const fetchProducts = async () =>
  (await gql(`{ products(first: 100, sortKey: CREATED_AT) { nodes { ${PRODUCT_FIELDS} } } }`)).products.nodes;

const fetchCollection = async handle =>
  (await gql(`query($h: String!) { collection(handle: $h) { title products(first: 100) { nodes { ${PRODUCT_FIELDS} } } } }`, { h: handle })).collection;

const fetchProduct = async handle =>
  (await gql(`query($h: String!) { product(handle: $h) { ${PRODUCT_FIELDS} } }`, { h: handle })).product;

/* ---------- renderers (mirror build.mjs so live data swaps in without a layout shift) ---------- */
function cardHTML(p) {
  const image = p.featuredImage || p.images?.nodes?.[0];
  const sold = !p.availableForSale;
  return `<a href="/product/${esc(p.handle)}" class="card">
    <div class="frame">
      ${image ? `<img src="${esc(img(image.url, 900))}" alt="${esc(image.altText || p.title)}" loading="lazy" width="900" height="1125">` : ''}
      <span class="view">View piece</span>
    </div>
    <div class="row"><h3>${esc(p.title)}</h3><p class="price${sold ? ' sold-out' : ''}">${sold ? 'Sold out' : money(p.priceRange.minVariantPrice)}</p></div>
    <p class="maker">Navratna by Navya</p>
  </a>`;
}

async function hydrateGrids() {
  const grids = document.querySelectorAll('[data-grid]');
  const strip = $('[data-bestsellers]');
  const pair = $('[data-feature-pair]');
  if (!grids.length && !strip && !pair) return;
  let products;
  try {
    const src = CFG.shopify.homeCollection;
    products = src && src !== 'all' && $('[data-grid="home"]')
      ? (await fetchCollection(src))?.products.nodes
      : await fetchProducts();
    if (!products) products = await fetchProducts();
  } catch (e) {
    console.warn('Live products unavailable, keeping build-time grid.', e);
    return;
  }
  grids.forEach(g => {
    g.innerHTML = products.length
      ? products.map(cardHTML).join('')
      : '<p class="lede">New pieces are on the way. Check back soon.</p>';
  });
  const byHandle = Object.fromEntries(products.map(p => [p.handle, p]));
  const picks = CFG.shopify.bestsellers.map(h => byHandle[h]).filter(Boolean);
  const list = (picks.length ? picks : products).slice(0, 3);
  if (strip) {
    strip.innerHTML = list.map(p => {
      const i = p.featuredImage || p.images.nodes[0];
      return `<a class="tile" href="/product/${esc(p.handle)}" aria-label="${esc(p.title)}">${i ? `<img src="${esc(img(i.url, 900))}" alt="${esc(i.altText || p.title)}" loading="lazy">` : ''}</a>`;
    }).join('');
  }
  if (pair) {
    pair.innerHTML = list.slice(0, 2).map(p => {
      const i = p.featuredImage || p.images.nodes[0];
      return `<a class="tile" href="/product/${esc(p.handle)}" aria-label="${esc(p.title)}">${i ? `<img src="${esc(img(i.url, 1400))}" alt="${esc(i.altText || p.title)}" loading="lazy">` : ''}</a>`;
    }).join('');
  }
}

/* ---------- product page ---------- */
async function renderProductPage() {
  const root = $('[data-pdp]');
  if (!root) return;
  const handle = decodeURIComponent(location.pathname.replace(/^\/product\/?/, '').replace(/\/$/, ''));
  if (!handle) { location.replace('/shop'); return; }

  let p;
  try { p = await fetchProduct(handle); } catch (e) {
    if (root.dataset.prerendered) { wirePdp(root, JSON.parse(root.dataset.prerendered)); return; }
    $('[data-pdp-title]').textContent = 'We could not load this piece';
    $('[data-pdp-desc]').textContent = 'Please refresh the page. If it keeps happening, email us and we will help you order it.';
    return;
  }
  if (!p) {
    document.title = 'Piece not found | Navratna';
    root.innerHTML = `<div class="notfound"><h1>Piece not found</h1><p>This piece may have found its wearer already.</p><a class="btn" href="/shop">Browse the collection</a></div>`;
    return;
  }

  document.title = `${p.seo?.title || p.title} | Navratna`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.content = p.seo?.description || p.description.slice(0, 155);

  const images = p.images.nodes.length ? p.images.nodes : (p.featuredImage ? [p.featuredImage] : []);
  $('[data-pdp-image]').innerHTML = images[0] ? `<img src="${esc(img(images[0].url, 1400))}" alt="${esc(images[0].altText || p.title)}">` : '';
  $('[data-pdp-thumbs]').innerHTML = images.length > 1
    ? images.map((im, i) => `<button type="button" data-thumb="${i}" aria-label="Show image ${i + 1}" aria-current="${i === 0}"><img src="${esc(img(im.url, 300))}" alt=""></button>`).join('')
    : '';
  $('[data-pdp-title]').textContent = p.title;
  $('[data-pdp-desc]').innerHTML = p.descriptionHtml || esc(p.description);
  root.querySelectorAll('[data-thumb]').forEach(b => b.addEventListener('click', () => {
    const im = images[+b.dataset.thumb];
    $('[data-pdp-image]').innerHTML = `<img src="${esc(img(im.url, 1400))}" alt="${esc(im.altText || p.title)}">`;
    root.querySelectorAll('[data-thumb]').forEach(x => x.setAttribute('aria-current', x === b));
  }));
  wirePdp(root, p);
}

function wirePdp(root, p) {
  const variants = p.variants.nodes;
  const realOptions = (p.options || []).filter(o => !(o.name === 'Title' && o.optionValues.length === 1 && o.optionValues[0].name === 'Default Title'));
  const selected = Object.fromEntries((variants.find(v => v.availableForSale) || variants[0]).selectedOptions.map(o => [o.name, o.value]));
  const box = $('[data-pdp-variants]');
  const btn = $('[data-add]');
  const priceEl = $('[data-pdp-price]');

  const current = () => variants.find(v => v.selectedOptions.every(o => selected[o.name] === o.value));

  function paint() {
    const v = current();
    priceEl.textContent = v ? money(v.price) : '';
    btn.disabled = !v || !v.availableForSale;
    btn.textContent = !v ? 'Unavailable' : v.availableForSale ? 'Add to bag' : 'Sold out';
    if (box) box.querySelectorAll('[data-opt]').forEach(b => b.setAttribute('aria-pressed', selected[b.dataset.opt] === b.dataset.val));
  }

  if (box) {
    box.innerHTML = realOptions.map(o => `<div><p class="label" style="color:var(--muted-foreground)">${esc(o.name)}</p>
      <div class="opts">${o.optionValues.map(v => `<button type="button" class="opt" data-opt="${esc(o.name)}" data-val="${esc(v.name)}">${esc(v.name)}</button>`).join('')}</div></div>`).join('');
    box.hidden = !realOptions.length;
    box.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => { selected[b.dataset.opt] = b.dataset.val; paint(); }));
  }

  btn.onclick = async () => {
    const v = current();
    if (!v) return;
    btn.disabled = true; btn.textContent = 'Adding…';
    try { await cart.add(v.id, 1); openDrawer(); }
    catch (e) { $('[data-notice]').textContent = 'That did not go through. Please try again.'; console.error(e); }
    paint();
  };
  paint();
}

/* ---------- cart ---------- */
const CART_FIELDS = `
  id checkoutUrl totalQuantity
  cost { subtotalAmount { amount currencyCode } }
  lines(first: 100) { nodes { id quantity
    cost { totalAmount { amount currencyCode } }
    merchandise { ... on ProductVariant { id title image { url altText }
      product { title handle featuredImage { url altText } } } } } }
`;

const cart = {
  data: null,
  async load() {
    const id = store.get(CART_KEY);
    if (!id) return this.render(null);
    try {
      const d = await gql(`query($id: ID!) { cart(id: $id) { ${CART_FIELDS} } }`, { id });
      if (!d.cart) store.del(CART_KEY);
      this.render(d.cart);
    } catch (e) { console.warn(e); this.render(null); }
  },
  async add(merchandiseId, quantity) {
    const id = store.get(CART_KEY);
    let c;
    if (id) {
      const d = await gql(`mutation($id: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $id, lines: $lines) { cart { ${CART_FIELDS} } userErrors { message } } }`, { id, lines: [{ merchandiseId, quantity }] });
      c = d.cartLinesAdd.cart;
    }
    if (!c) {
      const d = await gql(`mutation($lines: [CartLineInput!]) { cartCreate(input: { lines: $lines }) { cart { ${CART_FIELDS} } userErrors { message } } }`, { lines: [{ merchandiseId, quantity }] });
      if (d.cartCreate.userErrors.length) throw new Error(d.cartCreate.userErrors[0].message);
      c = d.cartCreate.cart;
      store.set(CART_KEY, c.id);
    }
    this.render(c);
  },
  async update(lineId, quantity) {
    const id = store.get(CART_KEY);
    const d = quantity > 0
      ? (await gql(`mutation($id: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $id, lines: $lines) { cart { ${CART_FIELDS} } } }`, { id, lines: [{ id: lineId, quantity }] })).cartLinesUpdate
      : (await gql(`mutation($id: ID!, $ids: [ID!]!) { cartLinesRemove(cartId: $id, lineIds: $ids) { cart { ${CART_FIELDS} } } }`, { id, ids: [lineId] })).cartLinesRemove;
    this.render(d.cart);
  },
  render(c) {
    this.data = c;
    const n = c?.totalQuantity || 0;
    document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = n; el.hidden = !n; });
    const bag = $('[data-cart-btn]');
    if (bag) bag.setAttribute('aria-label', n ? `Open bag, ${n} ${n === 1 ? 'piece' : 'pieces'}` : 'Open bag');
    const lines = c?.lines.nodes || [];
    $('[data-drawer-count]').textContent = `${n} ${n === 1 ? 'piece' : 'pieces'}`;
    $('[data-drawer-empty]').hidden = lines.length > 0;
    $('[data-drawer-lines]').hidden = !lines.length;
    $('[data-drawer-foot]').hidden = !lines.length;
    $('[data-drawer-lines]').innerHTML = lines.map(l => {
      const m = l.merchandise;
      const im = m.image || m.product.featuredImage;
      return `<li class="line">
        <a class="thumb" href="/product/${esc(m.product.handle)}">${im ? `<img src="${esc(img(im.url, 200))}" alt="${esc(im.altText || m.product.title)}">` : ''}</a>
        <div class="body">
          <div class="top">
            <div><h4>${esc(m.product.title)}</h4><p class="variant">${m.title === 'Default Title' ? '' : esc(m.title)}</p></div>
            <button class="remove" type="button" data-line="${esc(l.id)}" data-q="0" aria-label="Remove ${esc(m.product.title)}">${ICON.x}</button>
          </div>
          <div class="bottom">
            <div class="qty">
              <button type="button" data-line="${esc(l.id)}" data-q="${l.quantity - 1}" aria-label="One less">${ICON.minus}</button>
              <span>${l.quantity}</span>
              <button type="button" data-line="${esc(l.id)}" data-q="${l.quantity + 1}" aria-label="One more">${ICON.plus}</button>
            </div>
            <span class="line-price">${money(l.cost.totalAmount)}</span>
          </div>
        </div>
      </li>`;
    }).join('');
    if (c) $('[data-subtotal]').textContent = money(c.cost.subtotalAmount);
  },
};

const ICON = {
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>',
};

/* ---------- drawer ---------- */
let lastFocus = null;
function openDrawer() {
  lastFocus = document.activeElement;
  const d = $('[data-drawer]'), b = $('[data-backdrop]');
  b.hidden = false; d.hidden = false;
  requestAnimationFrame(() => { b.classList.add('open'); d.classList.add('open'); });
  document.body.classList.add('no-scroll');
  $('[data-cart-btn]')?.setAttribute('aria-expanded', 'true');
  setTimeout(() => d.querySelector('.close')?.focus(), 50);
}
function closeDrawer() {
  const d = $('[data-drawer]'), b = $('[data-backdrop]');
  d.classList.remove('open'); b.classList.remove('open');
  document.body.classList.remove('no-scroll');
  $('[data-cart-btn]')?.setAttribute('aria-expanded', 'false');
  setTimeout(() => { d.hidden = true; b.hidden = true; }, 400);
  lastFocus?.focus?.();
}

function wireChrome() {
  $('[data-cart-btn]')?.addEventListener('click', openDrawer);
  $('[data-backdrop]')?.addEventListener('click', closeDrawer);
  $('[data-drawer] .close')?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('[data-drawer]').classList.contains('open')) closeDrawer(); });
  $('[data-drawer-lines]')?.addEventListener('click', async e => {
    const b = e.target.closest('[data-line]');
    if (!b) return;
    b.disabled = true;
    try { await cart.update(b.dataset.line, +b.dataset.q); } catch (err) { console.error(err); b.disabled = false; }
  });
  $('[data-checkout]')?.addEventListener('click', () => { if (cart.data?.checkoutUrl) location.href = cart.data.checkoutUrl; });

  const menuBtn = $('[data-menu-btn]'), mobile = $('[data-mobile-nav]');
  menuBtn?.addEventListener('click', () => {
    const open = mobile.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open);
  });

  const here = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav a, .mobile-nav a').forEach(a => {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });
}

wireChrome();
cart.load();
hydrateGrids();
renderProductPage();
