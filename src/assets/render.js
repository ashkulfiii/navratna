// Shared markup helpers, used by build.mjs (at build time) and site.js (in the browser),
// so pre-rendered and live product cards are always identical.

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = m => `${m.currencyCode} ${Number(m.amount).toFixed(2)}`;

export const img = (url, w) => (url ? `${url}${url.includes('?') ? '&' : '?'}width=${w}` : '');

export const ICON = {
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>',
};

// Colour comes from product tags written as "Color: Pink" (or "Colour: Pink") in Shopify.
export const colorsOf = p =>
  (p.tags || []).map(t => t.match(/^colou?r\s*:\s*(.+)$/i)?.[1]?.trim()).filter(Boolean);

export function cardHTML(p, { saved = false, width = 900, action = '' } = {}) {
  const image = p.featuredImage || p.images?.nodes?.[0];
  const sold = !p.availableForSale;
  const href = `/product/${esc(p.handle)}`;
  return `<article class="card" data-handle="${esc(p.handle)}">
    <div class="frame">
      <a href="${href}" class="frame-link" tabindex="-1" aria-hidden="true">
        ${image ? `<img src="${esc(img(image.url, width))}" alt="" loading="lazy" width="900" height="1125">` : ''}
        <span class="view">View piece</span>
      </a>
      <button type="button" class="heart" data-heart="${esc(p.handle)}" aria-pressed="${saved}" aria-label="Save ${esc(p.title)} for later">${ICON.heart}</button>
    </div>
    <a href="${href}" class="card-link">
      <div class="row"><h3>${esc(p.title)}</h3><p class="price${sold ? ' sold-out' : ''}">${sold ? 'Sold out' : money(p.priceRange.minVariantPrice)}</p></div>
      <p class="maker">Navratna by Navya</p>
    </a>
    ${action}
  </article>`;
}

export function tilesHTML(list, w) {
  return list.map(p => {
    const i = p.featuredImage || p.images?.nodes?.[0];
    return `<a class="tile" href="/product/${esc(p.handle)}" aria-label="${esc(p.title)}">${i ? `<img src="${esc(img(i.url, w))}" alt="${esc(i.altText || p.title)}" loading="lazy">` : ''}</a>`;
  }).join('');
}

export const EMPTY_GRID = '<p class="lede">New pieces are on the way. Check back soon.</p>';

// Tilted photo collage for the home page. Missing handles are skipped.
export function collageHTML(products, handles = []) {
  const byHandle = Object.fromEntries(products.map(p => [p.handle, p]));
  return handles.map(h => byHandle[h]).filter(Boolean).slice(0, 6).map(p => {
    const i = p.featuredImage || p.images?.nodes?.[0];
    return `<a class="polaroid" href="/product/${esc(p.handle)}">
      ${i ? `<img src="${esc(img(i.url, 700))}" alt="${esc(i.altText || p.title)}" loading="lazy" width="700" height="875">` : ''}
      <span class="cap">${esc(p.title)}</span>
    </a>`;
  }).join('');
}
