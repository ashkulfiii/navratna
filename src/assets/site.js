// Navratna storefront runtime.
// Talks to Shopify's Storefront API (tokenless) for live products and the cart.
// Checkout is Shopify's own hosted checkout (cart.checkoutUrl).

import { esc, money, img, ICON, colorsOf, cardHTML, EMPTY_GRID } from './render.js';

const CFG = window.NAVRATNA;
const API = `https://${CFG.shopify.domain}/api/${CFG.shopify.apiVersion}/graphql.json`;
const CART_KEY = 'navratna_cart_id';
const SAVED_KEY = 'navratna_saved';
const VIEW_KEY = 'navratna_view';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const announce = msg => { const el = $('[data-announce]'); if (el) { el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); } };

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
  id handle title description descriptionHtml availableForSale vendor createdAt tags
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

async function fetchByHandles(handles) {
  if (!handles.length) return [];
  const fields = handles.map((_, i) => `p${i}: product(handle: $h${i}) { ${PRODUCT_FIELDS} }`).join('\n');
  const vars = handles.map((_, i) => `$h${i}: String!`).join(', ');
  const d = await gql(`query(${vars}) { ${fields} }`, Object.fromEntries(handles.map((h, i) => [`h${i}`, h])));
  return handles.map((_, i) => d[`p${i}`]).filter(Boolean);
}

/* ---------- saved for later (stored in this browser) ---------- */
const saved = {
  list() { try { return JSON.parse(store.get(SAVED_KEY) || '[]'); } catch { return []; } },
  has(h) { return this.list().includes(h); },
  write(list) { store.set(SAVED_KEY, JSON.stringify(list)); this.paint(); },
  add(h) { if (!this.has(h)) this.write([h, ...this.list()]); },
  remove(h) { this.write(this.list().filter(x => x !== h)); },
  toggle(h) { this.has(h) ? this.remove(h) : this.add(h); return this.has(h); },
  paint() {
    const list = this.list();
    $$('[data-saved-count]').forEach(el => { el.textContent = list.length; el.hidden = !list.length; });
    const link = $('[data-saved-link]');
    if (link) link.setAttribute('aria-label', list.length ? `Saved pieces, ${list.length}` : 'Saved pieces');
    $$('[data-heart]').forEach(b => b.setAttribute('aria-pressed', list.includes(b.dataset.heart)));
    const pdpSave = $('[data-save]');
    if (pdpSave) {
      const on = list.includes(pdpSave.dataset.save);
      pdpSave.setAttribute('aria-pressed', on);
      pdpSave.textContent = on ? 'Saved for later' : 'Save for later';
    }
  },
};

document.addEventListener('click', async e => {
  const mv = e.target.closest('[data-move]');
  if (mv) {
    mv.disabled = true; mv.textContent = 'Adding…';
    try {
      await cart.add(mv.dataset.move, 1);
      saved.remove(mv.dataset.handle);
      mv.closest('.card')?.remove();
      renderSavedEmpty();
      openDrawer();
    } catch (err) { console.error(err); mv.disabled = false; mv.textContent = 'Try again'; }
    return;
  }
  const b = e.target.closest('[data-heart]');
  if (!b) return;
  e.preventDefault();
  const on = saved.toggle(b.dataset.heart);
  announce(on ? 'Saved for later' : 'Removed from saved pieces');
  if (!on && b.closest('[data-saved-grid]')) b.closest('.card')?.remove(), renderSavedEmpty();
});

/* ---------- collection grid: sort, colour filter and view switch ---------- */
const SORTS = {
  featured: list => list,
  newest: list => [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
  oldest: list => [...list].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')),
  'price-asc': list => [...list].sort((a, b) => a.priceRange.minVariantPrice.amount - b.priceRange.minVariantPrice.amount),
  'price-desc': list => [...list].sort((a, b) => b.priceRange.minVariantPrice.amount - a.priceRange.minVariantPrice.amount),
};

function setView(view) {
  $$('[data-grid]').forEach(g => { g.dataset.view = view; });
  $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === view));
  store.set(VIEW_KEY, view);
}

function wireToolbar(products) {
  const grid = $('[data-grid]');
  const bar = $('[data-toolbar]');
  if (!grid || !bar) return;
  const sortEl = $('[data-sort]', bar);
  const colorEl = $('[data-color]', bar);
  const countEl = $('[data-count]', bar);

  const colors = [...new Set(products.flatMap(colorsOf))].sort();
  if (colors.length) {
    colorEl.innerHTML = '<option value="">All colors</option>' + colors.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('[data-color-wrap]', bar).hidden = false;
  }

  const paint = () => {
    const color = colorEl.value;
    const all = SORTS[sortEl.value](products).filter(p => !color || colorsOf(p).includes(color));
    const limit = grid.dataset.grid === 'home' ? CFG.homeLimit : Infinity;
    const list = all.slice(0, limit);
    const viewAll = $('[data-view-all]');
    if (viewAll) viewAll.hidden = all.length <= limit;
    grid.innerHTML = list.length ? list.map(p => cardHTML(p, { saved: saved.has(p.handle) })).join('') : (products.length ? '<p class="lede">No pieces in this color yet.</p>' : EMPTY_GRID);
    countEl.textContent = all.length > list.length ? `Showing ${list.length} of ${all.length} pieces` : `${all.length} ${all.length === 1 ? 'piece' : 'pieces'}`;
  };
  sortEl.onchange = paint;
  colorEl.onchange = paint;
  $$('[data-view]', bar).forEach(b => { b.onclick = () => setView(b.dataset.view); });
  paint();
}

async function hydrateGrids() {
  const grid = $('[data-grid]');
  const strip = $('[data-bestsellers]');
  const pair = $('[data-feature-pair]');
  if (!grid && !strip && !pair) return;
  setView(store.get(VIEW_KEY) || 'gallery');
  let products;
  try {
    const src = CFG.shopify.homeCollection;
    products = src && src !== 'all' && $('[data-grid="home"]')
      ? (await fetchCollection(src))?.products.nodes
      : await fetchProducts();
    if (!products) products = await fetchProducts();
  } catch (e) {
    console.warn('Live products unavailable, keeping build-time grid.', e);
    $$('[data-toolbar]').forEach(t => { t.hidden = true; });
    saved.paint();
    return;
  }
  if (grid) wireToolbar(products);
  const byHandle = Object.fromEntries(products.map(p => [p.handle, p]));
  const picks = CFG.shopify.bestsellers.map(h => byHandle[h]).filter(Boolean);
  const list = (picks.length ? picks : products).slice(0, 3);
  if (strip) strip.innerHTML = list.map(p => cardHTML(p, { saved: saved.has(p.handle) })).join('');
  if (pair) pair.innerHTML = list.slice(0, 2).map(p => cardHTML(p, { saved: saved.has(p.handle), width: 1400 })).join('');
  saved.paint();
}

/* ---------- saved page ---------- */
function renderSavedEmpty() {
  const g = $('[data-saved-grid]');
  if (g && !g.querySelector('.card')) {
    g.hidden = true;
    $('[data-saved-empty]').hidden = false;
  }
}

async function renderSavedPage() {
  const g = $('[data-saved-grid]');
  if (!g) return;
  const handles = saved.list();
  if (!handles.length) { renderSavedEmpty(); return; }
  try {
    const products = await fetchByHandles(handles);
    const action = p => {
      const buyable = p.variants.nodes.filter(v => v.availableForSale);
      if (!buyable.length) return '<button type="button" class="btn btn-block card-action" disabled>Sold out</button>';
      if (p.variants.nodes.length > 1) return `<a class="btn btn-outline btn-block card-action" href="/product/${esc(p.handle)}">Choose options</a>`;
      return `<button type="button" class="btn btn-block card-action" data-move="${esc(buyable[0].id)}" data-handle="${esc(p.handle)}">Move to bag</button>`;
    };
    g.innerHTML = products.map(p => cardHTML(p, { saved: true, action: action(p) })).join('');
    g.hidden = false;
    $('[data-saved-empty]').hidden = true;
    // Drop pieces that no longer exist in the store.
    const live = products.map(p => p.handle);
    if (live.length !== handles.length) saved.write(handles.filter(h => live.includes(h)));
    renderSavedEmpty();
  } catch (e) {
    g.innerHTML = '<p class="lede">We could not load your saved pieces. Please refresh the page.</p>';
    g.hidden = false;
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
    if (root.dataset.prerendered) { wirePdp(root, { handle, ...JSON.parse(root.dataset.prerendered) }); return; }
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
  const saveBtn = $('[data-save]');
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
    box.innerHTML = realOptions.map(o => `<div><p class="label muted">${esc(o.name)}</p>
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

  if (saveBtn) {
    saveBtn.dataset.save = p.handle;
    saveBtn.onclick = () => {
      const on = saved.toggle(p.handle);
      $('[data-notice]').innerHTML = on ? 'Saved. <a href="/saved">See your saved pieces</a>' : 'Removed from your saved pieces.';
    };
  }
  paint();
  saved.paint();
}

/* ---------- cart ---------- */
const CART_FIELDS = `
  id checkoutUrl totalQuantity
  discountCodes { code applicable }
  discountAllocations { discountedAmount { amount currencyCode } }
  cost { subtotalAmount { amount currencyCode } }
  lines(first: 100) { nodes { id quantity
    discountAllocations { discountedAmount { amount currencyCode } }
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
  async setCodes(codes) {
    const id = store.get(CART_KEY);
    const d = await gql(`mutation($id: ID!, $codes: [String!]!) { cartDiscountCodesUpdate(cartId: $id, discountCodes: $codes) { cart { ${CART_FIELDS} } userErrors { message } } }`, { id, codes });
    if (d.cartDiscountCodesUpdate.userErrors.length) throw new Error(d.cartDiscountCodesUpdate.userErrors[0].message);
    this.render(d.cartDiscountCodesUpdate.cart);
    return d.cartDiscountCodesUpdate.cart;
  },
  render(c) {
    this.data = c;
    const n = c?.totalQuantity || 0;
    $$('[data-cart-count]').forEach(el => { el.textContent = n; el.hidden = !n; });
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
          <button type="button" class="line-save" data-save-line="${esc(l.id)}" data-handle="${esc(m.product.handle)}">Save for later</button>
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
    if (!c) return;

    $('[data-subtotal]').textContent = money(c.cost.subtotalAmount);
    const allocations = [...c.discountAllocations, ...lines.flatMap(l => l.discountAllocations)];
    const off = allocations.reduce((s, a) => s + Number(a.discountedAmount.amount), 0);
    $('[data-discount-row]').hidden = !(off > 0);
    if (off > 0) $('[data-discount-amount]').textContent = `−${money({ amount: off, currencyCode: c.cost.subtotalAmount.currencyCode })}`;
    const free = CFG.shipping?.freeOverUSD;
    const net = Number(c.cost.subtotalAmount.amount) - off;
    const note = $('[data-ship-note]');
    if (note && free) note.textContent = net >= free
      ? 'Your order ships free within the US.'
      : `Add ${money({ amount: free - net, currencyCode: c.cost.subtotalAmount.currencyCode })} more for free US shipping.`;
    $('[data-codes]').innerHTML = c.discountCodes.map(d => `<li class="code${d.applicable ? '' : ' bad'}">
        <span>${esc(d.code)} ${d.applicable ? 'applied' : 'does not apply to this bag'}</span>
        <button type="button" data-drop-code="${esc(d.code)}" aria-label="Remove code ${esc(d.code)}">${ICON.x}</button>
      </li>`).join('');
  },
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
    const keep = e.target.closest('[data-save-line]');
    if (keep) {
      keep.disabled = true;
      saved.add(keep.dataset.handle);
      try { await cart.update(keep.dataset.saveLine, 0); announce('Moved to saved pieces'); } catch (err) { console.error(err); keep.disabled = false; }
      return;
    }
    const b = e.target.closest('[data-line]');
    if (!b) return;
    b.disabled = true;
    try { await cart.update(b.dataset.line, +b.dataset.q); } catch (err) { console.error(err); b.disabled = false; }
  });

  const form = $('[data-discount-form]');
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('#discount-code');
    const code = input.value.trim();
    const msg = $('[data-discount-msg]');
    if (!code) { msg.textContent = 'Enter a code first.'; return; }
    const btn = form.querySelector('button');
    btn.disabled = true; msg.textContent = '';
    try {
      const existing = (cart.data?.discountCodes || []).map(d => d.code);
      await cart.setCodes([...new Set([...existing, code])]);
      input.value = '';
    } catch (err) { msg.textContent = 'We could not check that code. Please try again.'; console.error(err); }
    btn.disabled = false;
  });
  $('[data-codes]')?.addEventListener('click', async e => {
    const b = e.target.closest('[data-drop-code]');
    if (!b) return;
    b.disabled = true;
    try { await cart.setCodes((cart.data?.discountCodes || []).map(d => d.code).filter(c => c !== b.dataset.dropCode)); } catch (err) { console.error(err); b.disabled = false; }
  });

  $('[data-checkout]')?.addEventListener('click', () => { if (cart.data?.checkoutUrl) location.href = cart.data.checkoutUrl; });

  const menuBtn = $('[data-menu-btn]'), mobile = $('[data-mobile-nav]');
  menuBtn?.addEventListener('click', () => {
    const open = mobile.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open);
  });

  const here = location.pathname.replace(/\/$/, '') || '/';
  $$('.nav a, .mobile-nav a').forEach(a => {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });
}

wireChrome();
saved.paint();
cart.load();
hydrateGrids();
renderProductPage();
renderSavedPage();
