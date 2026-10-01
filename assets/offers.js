/* Buna Index: Green offers (cross-importer lot table, shortlist, compare, sample requests, export) */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, money, perLb, by, fold } = B;
  const PAGE = 50;
  const PACKS = [[1.5, '1 lb'], [5, '5 lb'], [25, '25 lb'], [70, 'Half a bag (70 lb)'], [160, 'One bag']];
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rank = { avail: 0, unc: 1, seen: 2, sold: 3 };

  function defaults(st) {
    ['q', 'origin', 'region', 'process', 'pos', 'whs', 'cert', 'decaf', 'arr'].forEach((k) => (st[k] = st[k] || ''));
    if (st.importer == null) st.importer = '';
    st.sort = st.sort || 'best'; st.dir = st.dir || 1; st.n = st.n || PAGE;
    if (!st.origin) st.region = '';
  }
  function filter(st, skip) {
    const words = fold(st.q.trim()).split(/\s+/).filter(Boolean);
    const T = {
      sold: (c) => st.sold || c.s !== 'sold', origin: (c) => !st.origin || c.o === st.origin, region: (c) => !st.region || !!(c.rg && c.rg.includes(st.region)),
      process: (c) => !st.process || c.p === st.process, importer: (c) => st.importer === '' || c.co.i === +st.importer, pos: (c) => !st.pos || c.pos === st.pos || c.pos2 === st.pos,
      whs: (c) => !st.whs || c.whs === st.whs, cert: (c) => !st.cert || !!(c.ce && c.ce.includes(st.cert)), decaf: (c) => (st.decaf === 'only' ? !!c.d : st.decaf === 'none' ? !c.d : true),
      priced: (c) => !st.priced || c.ppl != null, maxp: (c) => st.maxp == null || (c.ppl != null && c.ppl <= st.maxp), maxmin: (c) => st.maxmin == null || !!(c.mlb && c.mlb <= st.maxmin),
      maxbags: (c) => st.maxbags == null || (c.bags != null && c.bags <= st.maxbags && c.s === 'avail'), arr: (c) => !st.arr || c.arr === st.arr, q: (c) => words.every((w) => c.text.includes(w)),
    };
    const keys = Object.keys(T).filter((k) => k !== skip);
    return B.G.filter((c) => keys.every((k) => T[k](c)));
  }
  function sorted(list, st) {
    const d = st.dir, nul = (v) => v == null || v === '';
    const cmp = (f) => (a, b) => { const x = f(a), y = f(b); return (nul(x) ? 1 : 0) - (nul(y) ? 1 : 0) || (x < y ? -1 : x > y ? 1 : 0) * d; };
    const S = { ppl: cmp((c) => c.ppl), mlb: cmp((c) => c.mlb), arr: cmp((c) => c.arr), bags: cmp((c) => c.bags), name: cmp((c) => fold(c.n)), origin: cmp((c) => (c.oo ? c.oo.n : '')), imp: cmp((c) => fold(c.co.n)) };
    if (S[st.sort]) return list.slice().sort(S[st.sort]);
    return list.slice().sort((a, b) => rank[a.s] - rank[b.s] || (a.ppl == null) - (b.ppl == null) || (a._h || (a._h = hash(a.id))) - (b._h || (b._h = hash(b.id))));
  }
  const count = (list, f) => { const m = new Map(); list.forEach((c) => { const v = f(c); (Array.isArray(v) ? v : [v]).forEach((x) => { if (x != null && x !== '') m.set(x, (m.get(x) || 0) + 1); }); }); return m; };
  const opts = (m, cur, label, order) => html`${(order || Array.from(m.keys()).sort((a, b) => m.get(b) - m.get(a))).filter((k) => m.get(k) || String(cur) === String(k)).map((k) => html`<option value="${k}" ${String(cur) === String(k) ? raw('selected') : ''}>${label(k)} (${m.get(k) || 0})</option>`)}`;

  const priceCell = (c) => (c.ppl != null ? html`<b class="num">${money(c.ppl)}</b>` : c.up != null ? html`<span class="num">${money(c.up, 0)}</span><span class="sub">per unit</span>` : html`<span class="faint">On request</span>`);
  const posCell = (c) => (c.pos ? html`${B.POS[c.pos]}${c.pos2 ? ' + ' + B.POS[c.pos2].toLowerCase() : ''}${c.arr ? html`<span class="sub">${c.arr > B.TODAY.slice(0, 7) ? 'due ' : 'landed '}${B.fmtMonth(c.arr)}</span>` : ''}` : c.arr ? B.fmtMonth(c.arr) : '');
  const tagsOf = (c) => html`${(c.g || []).map((g) => html`<span class="tag">${g}</span> `)}${(c.ce || []).map((g) => html`<span class="tag cert">${g}</span> `)}${c.d ? html`<span class="tag decaf">Decaf</span>` : ''}`;

  function table(page, st) {
    const th = (k, label, cls) => html`<th class="${cls || ''}"><button data-sort="${k}" aria-label="Sort by ${label}">${label}${st.sort === k ? (st.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
    return html`<div class="table-wrap"><table class="t"><thead><tr><th><span class="sr">Shortlist</span></th>${th('name', 'Lot')}${th('origin', 'Origin')}<th>Process</th>${th('ppl', 'Per lb', 'r')}${th('mlb', 'Smallest pack', 'r')}${th('arr', 'Position')}<th>Warehouse</th>${th('bags', 'Bags', 'r')}<th>Status</th></tr></thead>
      <tbody>${page.map((c) => html`<tr><td><input type="checkbox" data-short="${c.id}" ${B.lists.short.has(c.id) ? raw('checked') : ''} aria-label="Shortlist ${c.n}" style="width:17px;height:17px;accent-color:var(--accent)"></td>
        <td class="lot"><button data-coffee="${c.id}">${c.n}</button><span class="sub">${c.co.n} ${tagsOf(c)}</span></td>
        <td>${c.oo ? c.oo.n : ''}${c.rg ? html`<span class="sub">${c.rg[0]}</span>` : ''}</td><td>${c.p || ''}</td>
        <td class="r nw">${priceCell(c)}</td><td class="r num nw">${c.mlb ? B.fmtLb(c.mlb) : ''}</td><td class="nw">${posCell(c)}</td><td>${c.wh || (c.whs ? B.HUBS[c.whs].n : '')}</td>
        <td class="r num">${c.bags != null ? int(c.bags) + (c.bagsplus ? '+' : '') : ''}</td><td class="nw">${B.pill(c)}</td></tr>`)}</tbody></table></div>`;
  }
  const list = (page) => html`<ul class="biz">${page.map((c) => html`<li style="grid-template-columns:auto 1fr auto;column-gap:10px"><input type="checkbox" data-short="${c.id}" ${B.lists.short.has(c.id) ? raw('checked') : ''} aria-label="Shortlist ${c.n}" style="width:18px;height:18px;margin-top:3px;accent-color:var(--accent)">
    <button class="name" data-coffee="${c.id}">${c.n}</button><span class="num nw">${c.ppl != null ? perLb(c.ppl) : c.up != null ? money(c.up, 0) : ''}</span>
    <span class="sub" style="grid-column:2 / -1">${c.co.n}${c.oo ? ' · ' + c.oo.n : ''}${c.pos ? ' · ' + B.POS[c.pos] : ''}${c.mlb ? ' · from ' + B.fmtLb(c.mlb) : ''}</span></li>`)}</ul>`;

  /* ---------- shortlist actions ---------- */
  const shortlist = () => Array.from(B.lists.short).map((id) => B.byId[id]).filter(Boolean);
  const csvRows = (ls) => [['Lot', 'Importer', 'Origin', 'Region', 'Process', 'Grade', 'Certifications', 'Decaf', 'Price per lb', 'Unit price', 'Smallest pack (lb)', 'Position', 'Arrival', 'Warehouse', 'Bags shown', 'Bag (kg)', 'Seller score', 'Status', 'Checked', 'Link']]
    .concat(ls.map((c) => [c.n, c.co.n, c.oo ? c.oo.n : '', (c.rg || []).join('; '), c.p, (c.g || []).join('; '), (c.ce || []).join('; '), c.d, c.ppl, c.up, c.mlb, c.pos ? B.POS[c.pos] : '', c.arr, c.wh || c.whs, c.bags, c.bagkg, c.sc, B.STATUS[c.s].label, c.ch, c.u]));
  function compare() {
    const ls = shortlist().slice(0, 4);
    const rows = [['Importer', (c) => c.co.n], ['Origin', (c) => (c.oo ? c.oo.n : '—') + (c.rg ? ', ' + c.rg[0] : '')], ['Process', (c) => c.p || '—'], ['Variety', (c) => c.v || '—'], ['Grade', (c) => (c.g || []).join(', ') || '—'], ['Certifications', (c) => (c.ce || []).join(', ') || '—'],
      ['Per lb', (c) => (c.ppl != null ? money(c.ppl) : c.up != null ? money(c.up, 0) + ' per unit' : 'On request')], ['Smallest pack', (c) => (c.mlb ? B.fmtLb(c.mlb) : '—')], ['Position', (c) => posCell(c) || '—'], ['Warehouse', (c) => c.wh || c.whs || '—'],
      ['Bags shown', (c) => (c.bags != null ? int(c.bags) + (c.bagsplus ? '+' : '') : '—')], ['Seller’s score', (c) => c.sc || '—'], ['Tasting notes', (c) => c.tn || '—'], ['Status', (c) => B.pill(c)]];
    B.modal('Compare lots', html`<div class="table-wrap"><table class="t"><thead><tr><th></th>${ls.map((c) => html`<th style="white-space:normal;min-width:150px;color:var(--ink)">${c.n}</th>`)}</tr></thead>
      <tbody>${rows.map((r) => html`<tr><td class="nw" style="font-weight:650;color:var(--ink2)">${r[0]}</td>${ls.map((c) => html`<td>${r[1](c)}</td>`)}</tr>`)}</tbody></table></div>
      ${B.lists.short.size > 4 ? html`<p class="small muted">Showing the first four of ${B.lists.short.size} shortlisted lots.</p>` : ''}`);
  }
  function request() {
    const ls = shortlist(), me = B.store.get('me', {});
    const groups = new Map(); ls.forEach((c) => { if (!groups.has(c.co.i)) groups.set(c.co.i, []); groups.get(c.co.i).push(c); });
    const el = B.modal('Request samples', html`
      <p class="muted">${plural(ls.length, 'lot')} from ${plural(groups.size, 'importer')}. Fill this in once and the index writes a request for each importer, with the lots and their links.</p>
      <form id="rq-f" class="stack" style="--gap:12px">
        <div class="two" style="gap:12px"><label class="field"><span>Your name</span><input class="input" id="rq-name" autocomplete="name" value="${me.name || ''}"></label>
          <label class="field"><span>Business</span><input class="input" id="rq-biz" autocomplete="organization" value="${me.biz || ''}"></label>
          <label class="field"><span>City and state</span><input class="input" id="rq-city" value="${me.city || ''}" placeholder="Denver, CO"></label>
          <label class="field"><span>Delivery ZIP, for a freight estimate (optional)</span><input class="input" id="rq-zip" inputmode="numeric" value="${me.zip || ''}"></label></div>
        <fieldset style="border:0;padding:0;margin:0" class="row"><legend class="label" style="margin-bottom:6px">Ask for</legend>
          <label class="check"><input type="checkbox" id="rq-s" checked> Samples</label><label class="check"><input type="checkbox" id="rq-p" checked> Current price and stock</label><label class="check"><input type="checkbox" id="rq-t"> Payment terms for a new account</label></fieldset>
        <label class="field"><span>Anything else (roast volume, timing, how you found them)</span><textarea class="input" id="rq-note" rows="2"></textarea></label>
        <div class="row"><button class="btn primary" type="submit">Write the requests</button></div>
      </form>
      <div id="rq-out" class="stack" style="--gap:16px"></div>`);
    B.onSubmit($('#rq-f', el), () => {
      const v = (id) => $(id, el).value.trim(), name = v('#rq-name'), biz = v('#rq-biz'), city = v('#rq-city'), zip = v('#rq-zip'), note = v('#rq-note');
      B.store.set('me', { name, biz, city, zip });
      const want = [$('#rq-s', el).checked && 'samples', $('#rq-p', el).checked && 'current price and stock', $('#rq-t', el).checked && 'your payment terms for a new account'].filter(Boolean);
      const wantText = want.length > 1 ? want.slice(0, -1).join(', ') + ' and ' + want[want.length - 1] : want[0] || 'more information';
      let i = 0;
      $('#rq-out', el).innerHTML = String(html`<hr class="rule">${Array.from(groups.entries()).map((g) => {
        const co = B.companies[g[0]], lots = g[1], id = 'rq-m' + i++;
        const txt = ['Subject: ' + (want[0] === 'samples' ? 'Sample request' : 'Enquiry') + ': ' + plural(lots.length, 'lot'), '', 'Hello ' + co.n + ' team,', '',
          'I am ' + (name || '[your name]') + (biz ? ' at ' + biz : '') + (city ? ', ' + city : '') + '. I would like ' + wantText + ' for ' + (lots.length === 1 ? 'this lot' : 'these lots') + ' on your offer list:', '']
          .concat(lots.map((c, k) => (k + 1) + '. ' + c.n + (c.ppl != null ? ' (listed at ' + perLb(c.ppl) + ')' : '') + '\n   ' + c.u))
          .concat(['', zip ? 'Please include a freight estimate to ' + zip + '.' : null, note || null, (zip || note) ? '' : null, 'Thank you,', name || '[your name]', biz || null].filter((x) => x !== null)).join('\n');
        return html`<div class="stack" style="--gap:8px"><div class="head"><h3>${co.n}</h3><span class="small muted">${plural(lots.length, 'lot')}</span></div><pre class="copy" id="${id}">${txt}</pre>
          <div class="row"><button class="btn primary sm" data-copy="#${id}">Copy</button>${co.cu || co.web ? html`<a class="btn ghost sm ext" href="${B.safeUrl(co.cu || co.web)}" target="_blank" rel="noopener">Open their ${co.cu ? 'contact page' : 'site'}</a>` : ''}</div></div>`;
      })}<p class="small muted">Nothing is sent from here. Copy each request into the importer’s contact form or your own email. With member accounts, requests go to the importer’s inbox on the index and replies come back to yours.</p>`);
      $('#rq-out', el).scrollIntoView({ block: 'nearest' });
    });
  }

  B.views.offers = {
    render(main, st) {
      defaults(st);
      if (!st.view) st.view = window.innerWidth < 760 ? 'list' : 'table';
      const oc = count(filter(st, 'origin'), (c) => c.o), ic = count(filter(st, 'importer'), (c) => c.co.i), pc = count(filter(st, 'process'), (c) => c.p), poc = count(filter(st, 'pos'), (c) => [c.pos, c.pos2]),
        wc = count(filter(st, 'whs'), (c) => c.whs), cc = count(filter(st, 'cert'), (c) => c.ce || []), o = st.origin && B.O[st.origin], rc = o ? count(filter(st, 'region'), (c) => c.rg || []) : null;
      main.innerHTML = String(html`<div class="wrap">
        <div class="stack" style="--gap:6px;margin-bottom:16px"><h1 style="font-size:clamp(28px,3.6vw,42px)">Green offers</h1>
          <p class="muted" style="max-width:80ch">${int(B.live.length)} lots from ${new Set(B.live.map((c) => c.co.i)).size} importers’ public offer lists, in one table. Shortlist the ones you want, compare them, and write one sample request per importer.</p></div>
        <div class="row" style="margin-bottom:10px"><label class="search grow" style="min-width:220px;max-width:520px"><span class="sr">Search lots</span>${raw(B.I.search)}<input class="input" id="of-q" type="search" placeholder="Lot, importer, region, variety, station" value="${st.q}" autocomplete="off"></label>
          <button class="btn ghost fold-toggle" id="of-toggle" aria-expanded="false">Filters</button></div>
        <div class="fbar fold" id="of-f">
          <label class="field"><span>Origin</span><select class="select" id="of-origin" data-k="origin"><option value="">Any origin</option>${opts(oc, st.origin, (k) => (B.O[k] ? B.O[k].n : k), B.liveOrigins.map((x) => x.id))}</select></label>
          ${o && rc.size ? html`<label class="field"><span>Region</span><select class="select" id="of-region" data-k="region"><option value="">Any region</option>${opts(rc, st.region, (k) => k)}</select></label>` : ''}
          <label class="field"><span>Importer</span><select class="select" id="of-importer" data-k="importer"><option value="">Any importer</option>${opts(ic, st.importer, (k) => B.companies[k].n)}</select></label>
          <label class="field"><span>Process</span><select class="select" id="of-process" data-k="process"><option value="">Any process</option>${opts(pc, st.process, (k) => k)}</select></label>
          <label class="field"><span>Position</span><select class="select" id="of-pos" data-k="pos"><option value="">Any position</option>${opts(poc, st.pos, (k) => B.POS[k], ['spot', 'afloat', 'forward', 'origin'])}</select></label>
          <label class="field"><span>Warehouse</span><select class="select" id="of-whs" data-k="whs"><option value="">Any warehouse</option>${opts(wc, st.whs, (k) => B.HUBS[k].n)}</select></label>
          <label class="field"><span>Certification</span><select class="select" id="of-cert" data-k="cert"><option value="">Any</option>${opts(cc, st.cert, (k) => k)}</select></label>
          <label class="field"><span>Sold in packs up to</span><select class="select" id="of-maxmin" data-k="maxmin" data-num><option value="">Any size</option>${PACKS.map((p) => html`<option value="${p[0]}" ${st.maxmin == p[0] ? raw('selected') : ''}>${p[1]}</option>`)}</select></label>
          <label class="field"><span>Price up to, per lb</span><input class="input num" id="of-maxp" type="number" min="0" step="0.5" inputmode="decimal" placeholder="$" value="${st.maxp == null ? '' : st.maxp}"></label>
          <label class="field"><span>Caffeine</span><select class="select" id="of-decaf" data-k="decaf"><option value="">Any</option><option value="none" ${st.decaf === 'none' ? raw('selected') : ''}>Regular only</option><option value="only" ${st.decaf === 'only' ? raw('selected') : ''}>Decaf only</option></select></label>
          <div class="field" style="justify-content:flex-end;gap:6px"><label class="check"><input type="checkbox" data-c="priced" ${st.priced ? raw('checked') : ''}> Priced lots only</label><label class="check"><input type="checkbox" data-c="sold" ${st.sold ? raw('checked') : ''}> Include sold out</label></div>
        </div>
        <div class="toolbar"><div class="row" style="--gap:8px 12px"><b id="of-count" role="status" aria-live="polite"></b><span class="chips" id="of-active"></span></div>
          <div class="row" style="--gap:8px"><div class="seg" role="group" aria-label="Layout"><button data-view="table" aria-pressed="${st.view === 'table'}">Table</button><button data-view="list" aria-pressed="${st.view === 'list'}">List</button></div>
            <button class="btn ghost sm" id="of-export">Export results${B.can('trade') ? '' : html` <span class="tag">Trade</span>`}</button></div></div>
        <div id="of-out"></div>
        <div class="tray" id="of-tray" hidden></div>
      </div>`);

      const out = $('#of-out', main), tray = $('#of-tray', main);
      let rows = [];
      function update() {
        rows = sorted(filter(st), st);
        $('#of-count', main).textContent = plural(rows.length, 'lot');
        const a = [];
        if (st.arr) a.push(html`<button class="chip x" data-clear="arr">Arrival ${B.fmtMonth(st.arr)}</button>`);
        if (st.maxbags != null) a.push(html`<button class="chip x" data-clear="maxbags">${st.maxbags} bags or fewer</button>`);
        const any = ['q', 'origin', 'region', 'process', 'pos', 'whs', 'cert', 'decaf', 'arr'].some((k) => st[k]) || st.importer !== '' || st.maxp != null || st.maxmin != null || st.maxbags != null || st.priced || st.sold;
        if (any) a.push(html`<button class="link small" data-clear="all" style="align-self:center">Clear filters</button>`);
        $('#of-active', main).innerHTML = String(html`${a}`);
        const page = rows.slice(0, st.n);
        out.innerHTML = String(!rows.length ? html`<div class="empty"><b>No lot matches all of that.</b>Loosen a filter, or clear them and start from an origin.<div class="row" style="margin-top:12px"><button class="btn ghost sm" data-clear="all">Clear filters</button></div></div>`
          : html`${st.view === 'list' ? list(page) : table(page, st)}${rows.length > st.n ? html`<div class="more"><button class="btn ghost" id="of-more">Show ${Math.min(PAGE, rows.length - st.n)} more of ${int(rows.length - st.n)}</button></div>` : ''}
            <p class="small faint" style="margin-top:12px">Prices are the importer’s published list price for the best tier shown. Stock and position are as listed on the date checked; confirm before you plan a roast around a lot.</p>`);
        const more = $('#of-more', main); if (more) more.addEventListener('click', () => { st.n += PAGE; update(); });
        drawTray();
      }
      function drawTray() {
        const n = B.lists.short.size; tray.hidden = !n;
        if (n) tray.innerHTML = String(html`<b>${plural(n, 'lot')} shortlisted</b><div class="row" style="--gap:8px"><button class="btn ghost sm" id="tr-compare" ${n < 2 ? raw('disabled') : ''}>Compare</button><button class="btn ghost sm" id="tr-export">Export</button><button class="btn ghost sm" id="tr-cost">Cost a roast</button><button class="btn ghost sm" id="tr-clear">Clear</button><button class="btn primary sm" id="tr-request">Request samples</button></div>`);
      }
      B.onShortlist = drawTray;
      const change = () => { st.n = PAGE; update(); };
      main.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset.k) { const k = t.dataset.k; st[k] = 'num' in t.dataset ? (t.value === '' ? null : +t.value) : k === 'importer' ? (t.value === '' ? '' : +t.value) : t.value; if (k === 'origin') { st.region = ''; return B.go('offers', {}); } return change(); }
        if (t.dataset.c) { st[t.dataset.c] = t.checked; return change(); }
      });
      $('#of-q', main).addEventListener('input', B.debounce((e) => { st.q = e.target.value; change(); }, 140));
      $('#of-maxp', main).addEventListener('input', B.debounce((e) => { st.maxp = e.target.value === '' || isNaN(+e.target.value) ? null : +e.target.value; change(); }, 200));
      main.addEventListener('click', (e) => {
        const t = e.target.closest('[data-sort],[data-clear],[data-view],#of-export,#of-toggle,#tr-compare,#tr-export,#tr-clear,#tr-request,#tr-cost'); if (!t) return;
        const d = t.dataset;
        if (d.sort) { if (st.sort === d.sort) st.dir = -st.dir; else { st.sort = d.sort; st.dir = 1; } return update(); }
        if (d.clear) { if (d.clear === 'all') { const keep = { sort: st.sort, dir: st.dir, view: st.view }; Object.keys(st).forEach((k) => delete st[k]); Object.assign(st, keep); return B.go('offers', {}); } st[d.clear] = d.clear === 'maxbags' ? null : ''; return change(); }
        if (d.view) { st.view = d.view; return B.go('offers', {}); }
        if (t.id === 'of-toggle') { const open = $('#of-f', main).classList.toggle('open'); t.setAttribute('aria-expanded', open); return; }
        if (t.id === 'of-export') { if (B.gate('trade', 'Exporting a full result set')) B.exportFile('buna-index-green-offers.csv', B.csv(csvRows(rows))); return; }
        if (t.id === 'tr-compare') return compare();
        if (t.id === 'tr-export') return B.exportFile('buna-index-shortlist.csv', B.csv(csvRows(shortlist())));
        if (t.id === 'tr-request') return request();
        if (t.id === 'tr-cost') return B.go('tools', { lot: shortlist()[0].id });
        if (t.id === 'tr-clear') { B.lists.short.clear(); B.store.set('short', []); B.updateCounts(); return update(); }
      });
      update();
    },
    leave() { B.onShortlist = null; },
  };
})();
