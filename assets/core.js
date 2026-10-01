/* Buna Index: core (data prep, helpers, storage, router, shared UI) */
(function () {
  'use strict';
  const D = window.BUNA_DATA;
  const B = (window.B = { views: {}, state: {}, D });
  B.WEB = window.BUNA_ENV === 'web';      // the build served on its own domain, outside the Claude viewer

  /* ---------- tiny DOM + template helpers (every interpolation is escaped) ---------- */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const raw = (s) => ({ __raw: String(s) });
  function val(v) {
    if (v == null || v === false || v === true) return '';
    if (Array.isArray(v)) return v.map(val).join('');
    if (typeof v === 'object' && v.__raw != null) return v.__raw;
    return esc(v);
  }
  function html(strings) {
    let out = '';
    for (let i = 0; i < strings.length; i++) {
      out += strings[i];
      if (i + 1 < arguments.length) { const v = arguments[i + 1]; out += typeof v === 'boolean' && /=["']$/.test(strings[i]) ? String(v) : val(v); }   // booleans print inside attributes, vanish elsewhere
    }
    return { __raw: out, toString() { return out; } };
  }
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '#');
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const debounce = (fn, ms) => { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; };
  const uniq = (a) => Array.from(new Set(a));
  const by = (f, dir) => (a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * (dir || 1); };
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* ---------- formatters ---------- */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const money = (v, d) => (v == null || isNaN(v) ? '' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }));
  const perLb = (v) => (v == null ? '' : money(v) + '/lb');
  const int = (v) => Number(v || 0).toLocaleString('en-US');
  const fmtDate = (s) => { if (!s) return ''; const p = s.split('-'); return MON[+p[1] - 1] + ' ' + +p[2] + ', ' + p[0]; };
  const fmtMonth = (s) => { if (!s) return ''; const p = s.split('-'); return MON[+p[1] - 1] + ' ' + p[0]; };
  const fmtLb = (lb) => {
    if (lb == null) return '';
    if (lb < 1) { const oz = lb * 16; return (Math.abs(oz - Math.round(oz)) < 0.06 ? Math.round(oz) : oz.toFixed(1)) + ' oz'; }
    return (Math.abs(lb - Math.round(lb)) < 0.05 ? Math.round(lb) : lb.toFixed(1)) + ' lb';
  };
  const plural = (n, one, many) => int(n) + ' ' + (n === 1 ? one : many || one + 's');

  /* ---------- stats ---------- */
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function summary(values) {
    const s = values.filter((v) => v != null && !isNaN(v)).sort((a, b) => a - b);
    if (!s.length) return null;
    return { n: s.length, min: s[0], q1: quantile(s, 0.25), med: quantile(s, 0.5), q3: quantile(s, 0.75), max: s[s.length - 1] };
  }
  function miles(a, b) {
    if (!a || !b) return null;
    const R = 3958.8, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  /* ---------- data prep ---------- */
  const TODAY = D.meta.asof;                      // the index date, not the viewer's clock
  const NOW_MONTH = +TODAY.split('-')[1];
  const FAM = D.meta.families.map((f) => ({ id: f[0], label: f[1] }));
  const FAMMAP = {}; FAM.forEach((f) => (FAMMAP[f.id] = f));
  const TYPE_LABEL = { importer: 'Importer', roaster: 'Roaster', roaster_cafe: 'Roaster and café', cafe: 'Café', exporter: 'Exporter' };
  const STATUS = {
    avail: { label: 'Listed for sale', long: 'The seller listed this for sale when we checked.' },
    unc: { label: 'Stock unconfirmed', long: 'Found in the seller’s catalog; current stock was not confirmed.' },
    sold: { label: 'Sold out when checked', long: 'The seller showed this as sold out when we checked.' },
    seen: { label: 'Seen, not rechecked', long: 'Recorded in an earlier audit and not rechecked since.' },
    ref: { label: 'Catalog reference', long: 'A name from the roaster’s range. Price and stock were not verified.' },
  };
  const POS = { spot: 'Spot', afloat: 'Afloat', forward: 'Forward', origin: 'At origin' };

  const origins = D.origins, O = {};
  origins.forEach((o) => { O[o.id] = o; o.reg = {}; o.rg.forEach((r) => { o.reg[r.n] = r; r.o = o; r.key = o.id + '|' + r.n; r.count = 0; r.listed = 0; }); o.n_all = 0; o.n_listed = 0; o.n_green = 0; o.n_roast = 0; o.sellers = new Set(); });
  const companies = D.companies;
  companies.forEach((c, i) => { c.i = i; c.coffees = []; c.nListed = 0; c.nGreen = 0; c.nRoast = 0; c.om = new Map(); });
  const coffees = D.coffees, byId = {};
  coffees.forEach((c, i) => {
    c.i = i; byId[c.id] = c;
    const co = (c.co = companies[c.c]);
    co.coffees.push(c);
    c.listed = c.s !== 'ref';
    c.oo = c.o && c.o !== 'BLEND' ? O[c.o] : null;
    if (c.listed) { co.nListed++; if (c.k === 'g') co.nGreen++; else co.nRoast++; }
    if (c.oo) {
      co.om.set(c.o, (co.om.get(c.o) || 0) + 1);
      c.oo.n_all++; c.oo.sellers.add(co.i);
      if (c.listed) { c.oo.n_listed++; if (c.k === 'g') c.oo.n_green++; else c.oo.n_roast++; }
      (c.rg || []).forEach((r) => { const R = c.oo.reg[r]; if (R) { R.count++; if (c.listed) R.listed++; } });
    }
    c.retail = c.k === 'r' && c.ppl != null && c.lb >= 0.45 && c.lb <= 1.05 && !c.fm;   // 8 to 16 oz bags
    c.text = fold([c.n, co.n, c.oo ? c.oo.n : '', (c.rg || []).join(' '), c.rr, c.p, c.v, c.tn, co.city, co.st].filter(Boolean).join(' '));
  });
  companies.forEach((c) => { c.origins = Array.from(c.om.entries()).sort((a, b) => b[1] - a[1]).map((e) => e[0]); c.text = fold([c.n, c.city, c.st, TYPE_LABEL[c.t]].filter(Boolean).join(' ')); });
  const liveOrigins = origins.filter((o) => o.n_all > 0).sort(by((o) => -o.n_all));

  /* cities (for the US map and the palette) */
  const cityMap = new Map();
  companies.forEach((c) => {
    if (!c.pt || !c.city || !c.st) return;
    const k = c.city + ', ' + c.st;
    let ct = cityMap.get(k);
    if (!ct) cityMap.set(k, (ct = { key: k, city: c.city, st: c.st, pts: [], cos: [] }));
    ct.cos.push(c); ct.pts.push(c.pt);
  });
  const cities = Array.from(cityMap.values());
  cities.forEach((ct) => {
    const cityRef = ct.cos.find((c) => c.pb === 'city');
    ct.pt = cityRef ? cityRef.pt : [ct.pts.reduce((s, p) => s + p[0], 0) / ct.pts.length, ct.pts.reduce((s, p) => s + p[1], 0) / ct.pts.length];
    ct.n = ct.cos.length;
    ct.nCoffee = ct.cos.reduce((s, c) => s + c.nListed, 0);
  });
  cities.sort(by((c) => -c.n));

  /* ---------- storage (per-viewer conveniences only) ---------- */
  const mem = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem('buna.' + k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem('buna.' + k, JSON.stringify(v)); } catch (e) { /* storage is optional */ } },
  };
  const lists = {
    saved: new Set(store.get('saved', [])), stamps: new Set(store.get('stamps', [])),
    short: new Set(store.get('short', [])), compare: new Set(store.get('compare', [])),
  };
  function toggle(list, id) {
    const s = lists[list];
    if (s.has(id)) s.delete(id); else s.add(id);
    store.set(list, Array.from(s));
    updateCounts();
    return s.has(id);
  }
  B.tier = () => store.get('tier', 'free');
  B.setTier = (t) => { store.set('tier', t); };
  B.home = () => store.get('home', null);

  /* ---------- icons ---------- */
  const I = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.600-7 10-7 10Z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 7c-2 3-3 7-3 10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3c0-3-1-7-3-10M8 4h8l-1 3H9Z"/></svg>',
    passport: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 17h6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.500 2.500M15.500 15.500 18 18M6 18l2.500-2.500M15.500 8.500 18 6"/></svg>',
  };

  /* ---------- shared UI ---------- */
  const tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.hidden = true;
  const tip = {
    show(content, x, y) {
      tipEl.innerHTML = String(content); tipEl.hidden = false;
      const w = tipEl.offsetWidth, hgt = tipEl.offsetHeight;
      tipEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 14)) + 'px';
      tipEl.style.top = Math.max(8, y - hgt - 12 < 8 ? y + 18 : y - hgt - 12) + 'px';
    },
    hide() { tipEl.hidden = true; },
  };
  let toastT;
  function toast(msg) {
    let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600);
  }
  async function copy(text, el) {
    try { await navigator.clipboard.writeText(text); toast('Copied'); return true; }
    catch (e) {
      if (el) { try { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e2) { /* selection is a convenience */ } }
      toast(el ? 'Selected. Press copy on your keyboard.' : 'Copying is not available here'); return false;
    }
  }

  /* overlay stack: drawer / modal / palette share one scrim and Escape */
  let overlay = null, lastFocus = null;
  function closeOverlay() {
    if (!overlay) return;
    overlay.scrim.remove(); overlay.el.remove(); overlay = null; tip.hide();
    document.body.style.overflow = '';
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  function openOverlay(cls, inner, label) {
    closeOverlay();
    lastFocus = document.activeElement;
    const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.addEventListener('click', closeOverlay);
    const el = document.createElement('div'); el.className = cls; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', label || 'Details'); el.tabIndex = -1;
    el.innerHTML = String(inner);
    document.body.append(scrim, el); document.body.style.overflow = 'hidden';
    overlay = { scrim, el };
    el.focus();
    return el;
  }
  function drawer(title, body) {
    return openOverlay('drawer', html`<div class="drawer-head"><b class="small muted">${title}</b><button class="icon-btn" data-close aria-label="Close">${raw(I.x)}</button></div><div class="drawer-body">${body}</div>`, title);
  }
  function modal(title, body) {
    return openOverlay('modal', html`<div class="row between nowrap"><h2 style="font-size:22px">${title}</h2><button class="icon-btn" data-close aria-label="Close">${raw(I.x)}</button></div>${body}`, title);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay) { e.preventDefault(); closeOverlay(); }
    else if (e.key === '/' && !overlay && !/input|textarea|select/i.test((e.target.tagName || ''))) { e.preventDefault(); B.palette(); }
  });

  /* ---------- small render pieces ---------- */
  const pill = (c) => html`<span class="pill ${c.s}" title="${STATUS[c.s].long}">${STATUS[c.s].label}</span>`;
  const whereOf = (c) => (c.o === 'BLEND' ? 'Blend' : c.oo ? c.oo.n + (c.rg && c.rg.length ? ' · ' + c.rg[0] : '') : 'Origin not stated');
  const sellerLine = (co) => co.n + (co.city ? ' · ' + co.city + (co.st ? ', ' + co.st : '') : '');
  function tags(c) {
    const t = [];
    if (c.p) t.push(html`<span class="tag">${c.p}</span>`);
    if (c.ro) t.push(html`<span class="tag">${c.ro} roast</span>`);
    (c.g || []).forEach((g) => t.push(html`<span class="tag">${g}</span>`));
    (c.ce || []).forEach((g) => t.push(html`<span class="tag cert">${g}</span>`));
    if (c.d) t.push(html`<span class="tag decaf">${c.d === 'Decaf' ? 'Decaf' : 'Decaf · ' + c.d}</span>`);
    if (c.fm) t.push(html`<span class="tag">${c.fm}</span>`);
    return t;
  }
  const spectrum = (c) => (c.f && c.f.length ? html`<div class="spectrum" aria-hidden="true">${c.f.map((f) => html`<i data-f="${f}"></i>`)}</div>` : html`<div class="spectrum" aria-hidden="true"></div>`);
  function priceLine(c) {
    if (c.k === 'g') {
      if (c.ppl != null) return html`<b class="num">${perLb(c.ppl)}</b><span>${c.mlb ? 'from ' + fmtLb(c.mlb) : 'offer list price'}</span>`;
      if (c.up != null) return html`<b class="num">${money(c.up)}</b><span>per unit, size not captured</span>`;
      return html`<b style="font-size:14px">Price by quote</b><span>${c.bagkg ? c.bagkg + ' kg bags' : ''}</span>`;
    }
    if (c.pr != null) return html`<b class="num">${money(c.pr)}</b><span class="num">${c.lb ? fmtLb(c.lb) : c.sz || ''}${c.ppl != null ? ' · ' + perLb(c.ppl) : ''}</span>`;
    return html`<b style="font-size:14px">${c.s === 'ref' ? 'Not priced here' : 'See seller for price'}</b><span></span>`;
  }
  function card(c) {
    const saved = lists.saved.has(c.id);
    return html`<article class="card">
      ${spectrum(c)}
      <button class="heart save" data-save="${c.id}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from saved' : 'Save'} ${c.n}">${raw(I.heart)}</button>
      <div class="where">${whereOf(c)}${c.k === 'g' ? ' · Green' : ''}</div>
      <h3><button data-coffee="${c.id}">${c.n}</button></h3>
      <div class="by">${sellerLine(c.co)}</div>
      ${tags(c).length ? html`<div class="chips" style="gap:4px">${tags(c)}</div>` : ''}
      ${c.tn ? html`<div class="notes">${c.tn}</div>` : ''}
      <div class="price">${priceLine(c)}</div>
      <div class="meta">${pill(c)}${c.u ? html`<a class="link small ext" href="${safeUrl(c.u)}" target="_blank" rel="noopener">Seller</a>` : ''}</div>
    </article>`;
  }

  /* ---------- coffee detail ---------- */
  function originSummary(oid, kind) {
    const vals = coffees.filter((c) => c.o === oid && c.listed && (kind === 'g' ? c.k === 'g' && c.ppl != null && !c.d : c.retail)).map((c) => c.ppl);
    return summary(vals);
  }
  function openCoffee(id) {
    const c = byId[id]; if (!c) return;
    const co = c.co, o = c.oo;
    const sm = o ? originSummary(o.id, c.k) : null;
    let pos = '';
    if (sm && sm.n >= 5 && c.ppl != null && (c.k === 'g' || c.retail)) {
      const d = (c.ppl - sm.med) / sm.med * 100;
      pos = html`<p class="note">${Math.abs(d) < 4 ? 'Right at' : Math.abs(d).toFixed(0) + '% ' + (d > 0 ? 'above' : 'below')} the median of ${perLb(sm.med)} across ${sm.n} ${c.k === 'g' ? 'priced green lots' : 'bags of 8 to 16 oz'} from ${o.n} in the index.</p>`;
    }
    const similar = coffees.filter((x) => x !== c && x.listed && x.k === c.k && x.o === c.o && c.o && c.o !== 'BLEND' && (!c.rg || !x.rg || x.rg.some((r) => c.rg.includes(r))))
      .sort(by((x) => (x.s === 'avail' ? 0 : 1) + (x.p === c.p ? 0 : 0.5) + (x.co === c.co ? 2 : 0))).slice(0, 4);
    const tiers = c.tr && c.tr.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Pack</th><th class="r">Price</th><th class="r">Per lb</th></tr></thead><tbody>${c.tr.map((t) => html`<tr><td>${fmtLb(t[0])}</td><td class="r num">${money(t[1])}</td><td class="r num">${perLb(t[1] / t[0])}</td></tr>`)}</tbody></table></div>` : '';
    const body = html`
      ${spectrum(c)}
      <div class="stack" style="--gap:6px">
        <div class="where small" style="font-weight:650;color:var(--accent-ink)">${whereOf(c)}${c.oi ? html` <span class="faint" style="font-weight:500">(origin read from the listing name)</span>` : ''}</div>
        <h2>${c.n}</h2>
        <div class="row" style="--gap:8px">${pill(c)}${c.ch ? html`<span class="small faint">Checked ${fmtDate(c.ch)}</span>` : ''}</div>
      </div>
      ${c.k === 'g' ? html`<div class="mark">${[o ? o.id : '', (c.g || [])[0], c.bagkg ? c.bagkg + ' kg' : '', c.d ? 'decaf' : ''].filter(Boolean).join(' / ')}</div>` : ''}
      <div class="row" style="--gap:14px;align-items:baseline"><span class="figure num">${c.k === 'g' ? (c.ppl != null ? perLb(c.ppl) : c.up != null ? money(c.up) : 'By quote') : c.pr != null ? money(c.pr) : '—'}</span>
        <span class="muted small">${c.k === 'g' ? (c.ppl != null ? (c.mlb ? 'best published price; packs from ' + fmtLb(c.mlb) : 'from the importer’s offer list') : c.up != null ? 'per unit; pack size was not captured' : 'the importer quotes on request') : (c.lb ? fmtLb(c.lb) : c.sz || '') + (c.ppl != null ? ' · ' + perLb(c.ppl) : '')}</span></div>
      ${pos}${tiers}
      ${c.tn ? html`<div><div class="label">Seller’s tasting notes</div><p style="font-style:italic">${c.tn}</p>${c.f ? html`<div class="chips" style="margin-top:6px">${c.f.map((f) => html`<span class="chip"><i class="fdot" data-f="${f}"></i>${FAMMAP[f].label}</span>`)}</div>` : ''}</div>` : ''}
      <dl class="kv">
        ${o ? html`<dt>Origin</dt><dd><button class="link" data-origin="${o.id}">${o.n}</button>${c.rg ? ' · ' + c.rg.join(', ') : ''}${c.ri ? html` <span class="faint small">(region read from the name)</span>` : ''}</dd>` : ''}
        ${c.rr && (!c.rg || c.rr !== c.rg[0]) ? html`<dt>Seller’s wording</dt><dd>${c.rr}</dd>` : ''}
        ${c.ws ? html`<dt>Station or site</dt><dd>${c.ws}</dd>` : ''}
        ${c.pd ? html`<dt>Producer</dt><dd>${c.pd}</dd>` : ''}
        ${c.p ? html`<dt>Process</dt><dd>${c.p}${c.pi ? html` <span class="faint small">(from the name)</span>` : ''}</dd>` : ''}
        ${c.v ? html`<dt>Variety</dt><dd>${c.v}</dd>` : ''}
        ${c.el ? html`<dt>Elevation</dt><dd>${c.el} m</dd>` : ''}
        ${c.sc ? html`<dt>Seller’s score</dt><dd class="num">${c.sc}</dd>` : ''}
        ${c.ro ? html`<dt>Roast</dt><dd>${c.ro}</dd>` : ''}
        ${c.ce ? html`<dt>Certifications</dt><dd>${c.ce.join(', ')}</dd>` : ''}
        ${c.d ? html`<dt>Decaf</dt><dd>${c.d}</dd>` : ''}
        ${c.pos ? html`<dt>Position</dt><dd>${POS[c.pos]}${c.pos2 ? ' and ' + POS[c.pos2].toLowerCase() : ''}${c.arr ? ' · ' + (c.arr > TODAY.slice(0, 7) ? 'due ' : 'arrived ') + fmtMonth(c.arr) : ''}</dd>` : ''}
        ${c.bags != null ? html`<dt>Stock shown</dt><dd class="num">${int(c.bags)}${c.bagsplus ? '+' : ''} bags${c.bagkg ? ' of ' + c.bagkg + ' kg' : ''}</dd>` : ''}
        ${c.wh ? html`<dt>Warehouse</dt><dd>${c.wh}</dd>` : ''}
        ${c.smp ? html`<dt>Sample</dt><dd class="num">${money(c.smp)}</dd>` : ''}
      </dl>
      <div class="row">
        ${c.u ? html`<a class="btn primary ext" href="${safeUrl(c.u)}" target="_blank" rel="noopener">${c.k === 'g' ? 'Open the offer' : 'View at ' + (host(c.u) || 'seller')}</a>` : ''}
        ${c.k === 'g' ? html`<button class="btn ghost" data-short="${c.id}">${lists.short.has(c.id) ? 'On your shortlist' : 'Add to shortlist'}</button>` : html`<button class="btn ghost" data-save="${c.id}" aria-pressed="${lists.saved.has(c.id)}">${lists.saved.has(c.id) ? 'Saved' : 'Save'}</button>`}
      </div>
      <hr class="rule">
      <div class="stack" style="--gap:6px"><div class="label">${c.k === 'g' ? 'Offered by' : 'Sold by'}</div>
        <div><button class="link" data-company="${co.i}">${co.n}</button> <span class="muted">· ${TYPE_LABEL[co.t] || 'Seller'}${co.city ? ' · ' + co.city + ', ' + (co.st || '') : ''}</span></div></div>
      <p class="note">${STATUS[c.s].long} Prices and stock change; the seller’s page is the record.</p>
      ${similar.length ? html`<hr class="rule"><div class="stack" style="--gap:8px"><div class="label">More ${c.k === 'g' ? 'green lots' : 'coffees'} from ${c.rg ? c.rg[0] : o.n}</div>
        <ul class="biz">${similar.map((x) => html`<li><button class="name" data-coffee="${x.id}">${x.n}</button><span class="num small">${x.ppl != null ? perLb(x.ppl) : ''}</span><span class="sub">${x.co.n}${x.p ? ' · ' + x.p : ''}</span></li>`)}</ul></div>` : ''}`;
    drawer(c.k === 'g' ? 'Green lot' : 'Coffee', body);
  }

  /* ---------- company detail ---------- */
  function openCompany(i) {
    const co = companies[i]; if (!co) return;
    const trade = document.body.dataset.world === 'trade';
    const listed = co.coffees.filter((c) => c.listed), refs = co.coffees.filter((c) => !c.listed);
    const om = co.origins.slice(0, 8).map((id) => html`<button class="chip" data-origin="${id}">${O[id].n} <span class="n">${co.om.get(id)}</span></button>`);
    const contact = trade ? B.contactBlock(co) : html`<dl class="kv">
        ${co.web ? html`<dt>Website</dt><dd><a class="link ext" href="${safeUrl(co.web)}" target="_blank" rel="noopener">${host(co.web)}</a></dd>` : ''}
        ${co.addr ? html`<dt>Address</dt><dd>${co.addr}</dd>` : co.city ? html`<dt>City</dt><dd>${co.city}, ${co.st || ''}</dd>` : ''}
        ${co.ph ? html`<dt>Phone</dt><dd class="num">${co.ph}</dd>` : ''}</dl>`;
    const body = html`
      <div class="stack" style="--gap:6px"><h2>${co.n}</h2>
        <div class="muted">${TYPE_LABEL[co.t] || 'Seller'}${co.tu ? ' (type not verified)' : ''}${co.city ? ' · ' + co.city + ', ' + (co.st || '') : ''}</div>
        <div class="chips">${co.ws ? html`<span class="tag cert">Wholesale programme</span>` : ''}${co.pl ? html`<span class="tag cert">Private label</span>` : ''}${co.sm ? html`<span class="tag cert">Samples</span>` : ''}${co.visit ? html`<span class="tag">Open to visitors</span>` : ''}</div></div>
      ${contact}
      ${co.t === 'importer' ? html`<p class="note">${co.capnote || ''}${co.cat ? html` <a class="link ext" href="${safeUrl(co.cat)}" target="_blank" rel="noopener">Open the catalog</a>` : ''}</p>` : ''}
      ${om.length ? html`<div class="stack" style="--gap:8px"><div class="label">Origins in the index</div><div class="chips">${om}</div></div>` : ''}
      ${listed.length ? html`<div class="stack" style="--gap:8px"><div class="head"><div class="label">${plural(listed.length, co.t === 'importer' ? 'lot' : 'coffee', co.t === 'importer' ? 'lots' : 'coffees')} recorded</div>
          <button class="link small" data-seller-all="${co.i}">${trade && co.nGreen ? 'Open in Green offers' : 'Open in Finder'}</button></div>
        <ul class="biz">${listed.slice(0, 12).map((x) => html`<li><button class="name" data-coffee="${x.id}">${x.n}</button><span class="num small">${x.ppl != null ? perLb(x.ppl) : x.pr != null ? money(x.pr) : ''}</span><span class="sub">${whereOf(x)}${x.p ? ' · ' + x.p : ''}</span></li>`)}</ul>
        ${listed.length > 12 ? html`<span class="small faint">and ${listed.length - 12} more</span>` : ''}</div>` : ''}
      ${refs.length ? html`<div class="stack" style="--gap:6px"><div class="label">Also in their range (not verified)</div><p class="small muted">${refs.slice(0, 24).map((x) => x.n).join(' · ')}${refs.length > 24 ? ' · and ' + (refs.length - 24) + ' more' : ''}</p></div>` : ''}
      ${!listed.length && !refs.length ? html`<p class="note">We have the business and its location on record. Its menu has not been audited yet.</p>` : ''}
      <p class="small faint">${co.pb === 'addr' ? 'Mapped at its published address.' : co.pt ? 'Mapped at a city reference point, not the storefront.' : 'No map point on record.'}${co.chk ? ' Checked ' + fmtDate(co.chk) + '.' : ''}</p>
      <div class="row"><button class="btn ghost sm" data-claim="${co.i}">This is my business</button><button class="btn ghost sm" data-fix="${co.i}">Report a correction</button></div>`;
    drawer(TYPE_LABEL[co.t] || 'Business', body);
  }

  /* ---------- global click delegation ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-close],[data-coffee],[data-company],[data-origin],[data-save],[data-short],[data-go],[data-seller-all],[data-claim],[data-fix],[data-copy],[data-region]');
    if (!t) return;
    const d = t.dataset;
    if ('close' in d) return closeOverlay();
    if (d.coffee) return openCoffee(d.coffee);
    if (d.company) return openCompany(+d.company);
    if (d.save) {
      const on = toggle('saved', d.save);
      $$('[data-save="' + CSS.escape(d.save) + '"]').forEach((b) => { b.setAttribute('aria-pressed', on); if (b.classList.contains('btn')) b.textContent = on ? 'Saved' : 'Save'; });
      toast(on ? 'Saved to your passport' : 'Removed'); return;
    }
    if (d.short) {
      const on = toggle('short', d.short);
      $$('[data-short="' + CSS.escape(d.short) + '"]').forEach((b) => { if (b.classList.contains('btn')) b.textContent = on ? 'On your shortlist' : 'Add to shortlist'; else if (b.type === 'checkbox') b.checked = on; });
      if (B.onShortlist) B.onShortlist();
      if (!(t.type === 'checkbox')) toast(on ? 'Added to your shortlist' : 'Removed from your shortlist'); return;
    }
    if (d.origin) { closeOverlay(); return go('atlas', { origin: d.origin, region: d.region || null }); }
    if (d.sellerAll) {
      const co = companies[+d.sellerAll]; closeOverlay();
      if (document.body.dataset.world === 'trade' && co.nGreen) return go('offers', { reset: true, q: co.n });
      return go('finder', { reset: true, q: co.n, kind: co.nRoast >= co.nGreen ? 'r' : 'g', refs: true });
    }
    if (d.claim) return B.claim(+d.claim);
    if (d.fix) return B.claim(+d.fix, true);
    if (d.copy) { const el = $(d.copy); if (el) copy(el.textContent, el); return; }
    if (d.go) { e.preventDefault(); closeOverlay(); return go(d.go, d.params ? JSON.parse(d.params) : null); }
  });

  /* ---------- router + shell ---------- */
  const NAV = {
    atlas: [['atlas', 'Atlas'], ['finder', 'Finder'], ['flavor', 'Flavor'], ['places', 'Near you'], ['notes', 'Field notes'], ['passport', 'Passport']],
    trade: [['trade', 'Desk'], ['offers', 'Green offers'], ['prices', 'Price index'], ['directory', 'Directory'], ['tools', 'Tools'], ['guide', 'Buying guide'], ['membership', 'Membership']],
  };
  const WORLD = { atlas: 'atlas', finder: 'atlas', flavor: 'atlas', places: 'atlas', notes: 'atlas', passport: 'atlas', method: 'atlas', trade: 'trade', offers: 'trade', prices: 'trade', directory: 'trade', tools: 'trade', guide: 'trade', membership: 'trade' };
  let current = null, forced = null;
  function route() { if (forced) return forced; const h = (location.hash || '').replace(/^#/, ''); return WORLD[h] ? h : 'atlas'; }
  function go(name, params) {
    if (params) B.state[name] = Object.assign(params.reset ? {} : B.state[name] || {}, params);
    if (route() === name) return render(true);
    forced = null;
    try { location.hash = name; } catch (e) { /* some frames pin the address */ }
    if ((location.hash || '').replace(/^#/, '') !== name) { forced = name; render(); }   // still navigate when the hash cannot change
  }
  function updateCounts() {
    const s = $('#n-saved'), q = $('#n-short');
    if (s) { s.textContent = lists.saved.size; s.hidden = !lists.saved.size; }
    if (q) { q.textContent = lists.short.size; q.hidden = !lists.short.size; }
  }
  function render(keepScroll) {
    const name = route(), world = WORLD[name];
    const sy = keepScroll === true ? window.scrollY : 0;
    if (current && B.views[current] && B.views[current].leave) B.views[current].leave();
    closeOverlay(); tip.hide();
    document.body.dataset.world = world;
    $('#tabs').innerHTML = String(NAV[world].map((n) => html`<a class="tab" href="#${n[0]}" ${n[0] === name ? raw('aria-current="page"') : ''}>${n[1]}</a>`).map(String).join(''));
    $('#brand-tag').hidden = world !== 'trade';
    $('#w-atlas').setAttribute('aria-current', world === 'atlas'); $('#w-trade').setAttribute('aria-current', world === 'trade');
    $('#btn-saved').hidden = world !== 'atlas'; $('#btn-short').hidden = world !== 'trade';
    const mainEl = $('#main');
    mainEl.innerHTML = '';
    const main = document.createElement('div'); mainEl.appendChild(main);   // a fresh root per render, so view listeners never pile up
    const v = B.views[name];
    current = name;
    if (v) v.render(main, B.state[name] || (B.state[name] = {}));
    else main.innerHTML = String(html`<div class="wrap"><div class="empty"><b>This screen is on its way.</b></div></div>`);
    updateCounts();
    const act = $('.tab[aria-current="page"]'); if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    window.scrollTo(0, sy);
    if (B.askSync) B.askSync();
  }
  window.addEventListener('hashchange', () => { forced = null; render(); });
  document.addEventListener('click', (e) => {      // in-page links go through the router, so they work even where the frame ignores hash changes
    const a = e.target.closest('a[href^="#"]'); if (!a || e.defaultPrevented) return;
    const name = a.getAttribute('href').slice(1);
    if (WORLD[name]) { e.preventDefault(); closeOverlay(); go(name); }
  });

  /* ---------- command palette ---------- */
  B.palette = function () {
    const el = openOverlay('palette', html`<label class="search"><span class="sr">Search the index</span>${raw(I.search)}<input class="input" id="pal-q" type="search" autocomplete="off" placeholder="Search coffees, origins, roasters, importers, cities"></label><ul id="pal-r" role="listbox"></ul>`, 'Search');
    const q = $('#pal-q', el), list = $('#pal-r', el);
    let items = [], sel = 0;
    function run() {
      const t = fold(q.value.trim()); items = [];
      if (t.length < 2) {
        items = liveOrigins.slice(0, 6).map((o) => ({ k: 'Origin', t: o.n, s: int(o.n_listed) + ' listed coffees', a: () => go('atlas', { origin: o.id, region: null }) }));
      } else {
        const words = t.split(/\s+/);
        const hit = (s) => words.every((w) => s.includes(w));
        origins.filter((o) => hit(fold(o.n))).slice(0, 4).forEach((o) => items.push({ k: 'Origin', t: o.n, s: int(o.n_listed) + ' listed coffees', a: () => go('atlas', { origin: o.id, region: null }) }));
        origins.forEach((o) => o.rg.forEach((r) => { if (items.length < 9 && hit(fold(r.n))) items.push({ k: 'Region', t: r.n, s: o.n + ' · ' + r.count + ' coffees', a: () => go('atlas', { origin: o.id, region: r.n }) }); }));
        cities.filter((c) => hit(fold(c.key))).slice(0, 4).forEach((c) => items.push({ k: 'City', t: c.key, s: plural(c.n, 'business', 'businesses'), a: () => go('places', { city: c.key }) }));
        companies.filter((c) => hit(c.text)).sort(by((c) => -c.coffees.length)).slice(0, 6).forEach((c) => items.push({ k: TYPE_LABEL[c.t] || 'Seller', t: c.n, s: [c.city && c.city + ', ' + c.st, c.coffees.length && plural(c.coffees.length, 'coffee')].filter(Boolean).join(' · '), a: () => openCompany(c.i) }));
        coffees.filter((c) => hit(c.text)).sort(by((c) => (c.s === 'avail' ? 0 : c.listed ? 1 : 2))).slice(0, 8).forEach((c) => items.push({ k: c.k === 'g' ? 'Green lot' : 'Coffee', t: c.n, s: c.co.n + ' · ' + whereOf(c), a: () => openCoffee(c.id) }));
      }
      sel = 0; draw();
    }
    function draw() {
      list.innerHTML = String(items.length ? items.map((it, i) => html`<li><button class="${i === sel ? 'on' : ''}" data-i="${i}"><span class="k">${it.k}</span><span>${it.t}<small>${it.s}</small></span></button></li>`).map(String).join('') : html`<li class="small muted" style="padding:14px 16px">Nothing matches. Try an origin, a city or a roaster’s name.</li>`);
    }
    q.addEventListener('input', debounce(run, 90));
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && items[sel]) { const a = items[sel].a; closeOverlay(); a(); }
    });
    list.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { const a = items[+b.dataset.i].a; closeOverlay(); a(); } });
    run(); q.focus();
  };

  /* forms never leave the page. Some frames block form submission outright, so the button click and the Enter key are handled too. */
  B.onSubmit = function (form, fn) {
    let last = 0;
    const run = (e) => { if (e) e.preventDefault(); const now = Date.now(); if (now - last < 300) return; last = now; fn(); };
    form.addEventListener('submit', run);
    const btn = form.querySelector('button[type="submit"]'); if (btn) btn.addEventListener('click', run);
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') run(e); });
  };

  /* ---------- claim / correction request (no backend in this build: produces a ready-to-send note) ---------- */
  B.CONTACT_URL = 'https://ethico.store/pages/contact';
  B.claim = function (i, fix) {
    const co = companies[i];
    const el = modal(fix ? 'Report a correction' : 'Claim this listing', html`
      <p class="muted">${fix ? 'Tell us what is wrong and where we can confirm it.' : 'Claiming is free. You confirm the details below and can then keep your coffees, prices and contact details current yourself.'}</p>
      <form id="claim-f" class="stack" style="--gap:12px">
        <div class="two" style="gap:12px"><label class="field"><span>Your name</span><input class="input" id="cl-name" autocomplete="name"></label>
        <label class="field"><span>${fix ? 'How do you know this business?' : 'Your role at ' + co.n}</span><input class="input" id="cl-role"></label></div>
        <label class="field"><span>${fix ? 'What should change, and a page that confirms it' : 'Anything we should correct (address, type, coffees, wholesale terms)'}</span><textarea class="input" id="cl-note" rows="4"></textarea></label>
        <div class="row"><button class="btn primary" type="submit">Prepare the request</button></div>
      </form>
      <div id="claim-out" hidden class="stack" style="--gap:10px">
        <pre class="copy" id="claim-text"></pre>
        <div class="row"><button class="btn primary" data-copy="#claim-text">Copy the request</button><a class="btn ghost ext" href="${B.CONTACT_URL}" target="_blank" rel="noopener">Open the contact page</a></div>
        <p class="small muted">Nothing is sent from this page. Copy the request and paste it into the contact page; self-serve claiming opens with member accounts.</p>
      </div>`);
    B.onSubmit($('#claim-f', el), () => {
      const txt = [fix ? 'CORRECTION REQUEST' : 'LISTING CLAIM', 'Business: ' + co.n, 'Listed as: ' + (TYPE_LABEL[co.t] || '') + (co.city ? ', ' + co.city + ', ' + (co.st || '') : ''), 'Website on record: ' + (co.web || 'none'),
        'From: ' + ($('#cl-name', el).value || '(name)') + ' — ' + ($('#cl-role', el).value || '(role)'), '', $('#cl-note', el).value || '(details)', '', 'Buna Index record ' + co.i + ', index dated ' + fmtDate(TODAY)].join('\n');
      $('#claim-text', el).textContent = txt; $('#claim-out', el).hidden = false;
    });
  };

  Object.assign(B, { $, $$, esc, raw, html, safeUrl, host, debounce, uniq, by, fold, MON, MONTHS, money, perLb, int, fmtDate, fmtMonth, fmtLb, plural, quantile, summary, miles,
    TODAY, NOW_MONTH, FAM, FAMMAP, TYPE_LABEL, STATUS, POS, origins, O, liveOrigins, companies, coffees, byId, cities, cityMap, store, lists, toggle, I, tip, toast, copy,
    drawer, modal, closeOverlay, pill, whereOf, sellerLine, tags, spectrum, priceLine, card, openCoffee, openCompany, originSummary, go, render, route, updateCounts, NAV });

  /* ---------- runtime capabilities: resolved after load; every feature works without them ---------- */
  B.cap = {};
  B.csv = (rows) => rows.map((r) => r.map((v) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(',')).join('\n');
  B.exportFile = async function (filename, text) {
    const dl = B.cap.downloads;
    if (dl) {
      try { await dl.save({ filename, data: text }); toast('Saved ' + filename); return; }
      catch (e) {
        if (e && e.code === 'declined') return;
        if (e && e.code === 'rate_limited') { toast('A save is already waiting. Try again in a moment.'); return; }
      }
    } else if (!window.claude) {      // an ordinary website, outside the Claude viewer: a plain browser download works
      try {
        const url = URL.createObjectURL(new Blob([text], { type: /\.csv$/.test(filename) ? 'text/csv' : 'text/plain' })), a = document.createElement('a');
        a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Saved ' + filename); return;
      } catch (e) { /* fall through to copy */ }
    }
    modal('Copy ' + filename, html`<p class="muted">Saving a file is not available in this view. Copy the text and paste it into a spreadsheet or a text file.</p><pre class="copy" id="exp-text">${text.length > 150000 ? text.slice(0, 150000) + '\n…' : text}</pre><div class="row"><button class="btn primary" data-copy="#exp-text">Copy</button></div>`);
  };

  B.start = function () {
    document.body.appendChild(tipEl);
    if (window.claude && typeof window.claude.use === 'function') {
      ['downloads', 'sample'].forEach((n) => { try { window.claude.use(n).then((ns) => { B.cap[n] = ns || null; if (n === 'sample' && ns && B.askReady) B.askReady(); }).catch(() => {}); } catch (e) { /* not in a viewer */ } });
    }
    $('#btn-search').addEventListener('click', () => B.palette());
    $('#skip').addEventListener('click', (e) => { e.preventDefault(); const m = $('#main'); m.tabIndex = -1; m.focus(); });
    render();
  };
})();
