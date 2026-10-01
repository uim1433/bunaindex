/* Buna Index: Finder (faceted search over every coffee in the index) */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, money, perLb, by, fold } = B;
  const PAGE = 24;
  const SORTS = [['best', 'Best match'], ['pl', 'Price per lb, low to high'], ['ph', 'Price per lb, high to low'], ['new', 'Most recently checked'], ['az', 'Name, A to Z']];
  const PROC = ['Washed', 'Natural', 'Honey', 'Anaerobic & experimental', 'Wet-hulled', 'Monsooned', 'Washed & natural', 'Other'];
  const ROAST = ['Light', 'Light-medium', 'Medium', 'Medium-dark', 'Dark'];
  const CERT = ['Organic', 'Fair Trade', 'Women-produced', 'Bird Friendly', 'Rainforest Alliance'];
  const BANDS = { r: [[null, 20, 'Under $20'], [20, 30, '$20 to $30'], [30, 45, '$30 to $45'], [45, null, '$45 and up']], g: [[null, 6, 'Under $6'], [6, 8, '$6 to $8'], [8, 12, '$8 to $12'], [12, null, '$12 and up']] };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  function defaults(st) {
    ['origins', 'process', 'roast', 'fams', 'certs'].forEach((k) => { if (!Array.isArray(st[k])) st[k] = []; });
    st.kind = st.kind || 'r'; st.decaf = st.decaf || 'any'; st.sort = st.sort || 'best'; st.view = st.view || 'cards'; st.n = st.n || PAGE; st.q = st.q || '';
    if (st.origins.length !== 1) st.region = null;
  }
  function tests(st) {
    const words = fold(st.q.trim()).split(/\s+/).filter(Boolean);
    return {
      q: (c) => words.every((w) => c.text.includes(w)),
      kind: (c) => st.kind === 'all' || c.k === st.kind,
      status: (c) => (c.listed ? c.s !== 'sold' || !!st.sold : !!st.refs),
      origins: (c) => !st.origins.length || st.origins.includes(c.o),
      region: (c) => !st.region || !!(c.rg && c.rg.includes(st.region)),
      process: (c) => !st.process.length || st.process.includes(c.p),
      roast: (c) => !st.roast.length || st.roast.includes(c.ro),
      fams: (c) => !st.fams.length || !!(c.f && st.fams.some((f) => c.f.includes(f))),
      certs: (c) => !st.certs.length || !!(c.ce && st.certs.some((x) => c.ce.includes(x))),
      decaf: (c) => st.decaf === 'any' || (st.decaf === 'only' ? !!c.d : !c.d),
      price: (c) => (st.maxp == null && st.minp == null) || (c.ppl != null && (st.maxp == null || c.ppl < st.maxp) && (st.minp == null || c.ppl >= st.minp)),
      state: (c) => !st.st || c.co.st === st.st,
      notes: (c) => !st.notes || !!c.tn,
    };
  }
  function run(st, skip) { const T = tests(st), keys = Object.keys(T).filter((k) => k !== skip); return B.coffees.filter((c) => keys.every((k) => T[k](c))); }
  function tally(list, f) { const m = new Map(); list.forEach((c) => { const v = f(c); (Array.isArray(v) ? v : [v]).forEach((x) => { if (x != null && x !== '') m.set(x, (m.get(x) || 0) + 1); }); }); return m; }
  const rank = { avail: 0, unc: 1, seen: 2, sold: 3, ref: 4 };
  function sorted(list, st) {
    const s = st.sort;
    if (s === 'pl' || s === 'ph') return list.slice().sort((a, b) => (a.ppl == null) - (b.ppl == null) || (s === 'pl' ? a.ppl - b.ppl : b.ppl - a.ppl));
    if (s === 'new') return list.slice().sort(by((c) => c.ch || '', -1));
    if (s === 'az') return list.slice().sort(by((c) => fold(c.n)));
    return list.slice().sort((a, b) => (rank[a.s] * 10 + (a.tn ? 0 : 2) + (a.ppl != null ? 0 : 1) + (a.oo ? 0 : 1)) - (rank[b.s] * 10 + (b.tn ? 0 : 2) + (b.ppl != null ? 0 : 1) + (b.oo ? 0 : 1)) || (a._h || (a._h = hash(a.id))) - (b._h || (b._h = hash(b.id))));
  }

  const chip = (f, v, label, n, on) => html`<button class="chip" data-f="${f}" data-v="${v}" aria-pressed="${!!on}">${label}${n != null ? html` <span class="n">${int(n)}</span>` : ''}</button>`;

  function facets(st) {
    const out = {};
    const oc = tally(run(st, 'origins'), (c) => c.o);
    let os = B.liveOrigins.filter((o) => oc.get(o.id) || st.origins.includes(o.id)).sort(by((o) => -(oc.get(o.id) || 0)));
    const shown = st.allOrigins ? os : os.filter((o, i) => i < 10 || st.origins.includes(o.id));
    out.origins = html`${shown.map((o) => chip('origins', o.id, o.n, oc.get(o.id) || 0, st.origins.includes(o.id)))}${oc.get('BLEND') ? chip('origins', 'BLEND', 'Blends', oc.get('BLEND'), st.origins.includes('BLEND')) : ''}
      ${os.length > 10 ? html`<button class="link small" data-toggle="allOrigins">${st.allOrigins ? 'Show fewer' : 'All ' + os.length + ' origins'}</button>` : ''}`;
    const one = st.origins.length === 1 && B.O[st.origins[0]];
    if (one) {
      const rc = tally(run(st, 'region'), (c) => c.rg || []);
      const rs = one.rg.filter((r) => rc.get(r.n)).sort(by((r) => -rc.get(r.n)));
      out.region = rs.length ? html`${rs.map((r) => html`<button class="chip" data-set="region" data-v="${r.n}" aria-pressed="${st.region === r.n}">${r.n} <span class="n">${rc.get(r.n)}</span></button>`)}` : '';
    } else out.region = '';
    const pc = tally(run(st, 'process'), (c) => c.p);
    out.process = html`${PROC.filter((p) => pc.get(p) || st.process.includes(p)).map((p) => chip('process', p, p, pc.get(p) || 0, st.process.includes(p)))}`;
    const rc2 = tally(run(st, 'roast'), (c) => c.ro);
    out.roast = st.kind === 'g' ? '' : html`${ROAST.filter((p) => rc2.get(p) || st.roast.includes(p)).map((p) => chip('roast', p, p, rc2.get(p) || 0, st.roast.includes(p)))}`;
    const fc = tally(run(st, 'fams'), (c) => c.f || []);
    out.fams = html`${B.FAM.filter((f) => fc.get(f.id) || st.fams.includes(f.id)).map((f) => html`<button class="chip" data-f="fams" data-v="${f.id}" aria-pressed="${st.fams.includes(f.id)}"><i class="fdot" data-f="${f.id}"></i>${f.label} <span class="n">${fc.get(f.id) || 0}</span></button>`)}`;
    const cc = tally(run(st, 'certs'), (c) => c.ce || []);
    out.certs = html`${CERT.filter((p) => cc.get(p) || st.certs.includes(p)).map((p) => chip('certs', p, p, cc.get(p) || 0, st.certs.includes(p)))}`;
    const sc = tally(run(st, 'state'), (c) => c.co.st);
    out.state = html`<option value="">Any state</option>${Array.from(sc.keys()).sort().map((s) => html`<option value="${s}" ${st.st === s ? raw('selected') : ''}>${s} (${sc.get(s)})</option>`)}`;
    const bands = BANDS[st.kind];
    out.bands = bands ? html`${bands.map((b) => html`<button class="chip" data-band="${b[0] == null ? '' : b[0]},${b[1] == null ? '' : b[1]}" aria-pressed="${st.minp == b[0] && st.maxp == b[1] && (b[0] != null || b[1] != null)}">${b[2]}</button>`)}` : '';
    return out;
  }

  function active(st) {
    const a = [];
    if (st.q.trim()) a.push(html`<button class="chip x" data-clear="q">“${st.q.trim()}”</button>`);
    st.origins.forEach((id) => a.push(html`<button class="chip x" data-f="origins" data-v="${id}">${id === 'BLEND' ? 'Blends' : B.O[id] ? B.O[id].n : id}</button>`));
    if (st.region) a.push(html`<button class="chip x" data-clear="region">${st.region}</button>`);
    st.process.forEach((p) => a.push(html`<button class="chip x" data-f="process" data-v="${p}">${p}</button>`));
    st.roast.forEach((p) => a.push(html`<button class="chip x" data-f="roast" data-v="${p}">${p} roast</button>`));
    st.fams.forEach((p) => a.push(html`<button class="chip x" data-f="fams" data-v="${p}"><i class="fdot" data-f="${p}"></i>${B.FAMMAP[p].label}</button>`));
    st.certs.forEach((p) => a.push(html`<button class="chip x" data-f="certs" data-v="${p}">${p}</button>`));
    if (st.decaf !== 'any') a.push(html`<button class="chip x" data-clear="decaf">${st.decaf === 'only' ? 'Decaf only' : 'No decaf'}</button>`);
    if (st.minp != null || st.maxp != null) a.push(html`<button class="chip x" data-clear="price">${st.minp != null ? money(st.minp, 0) : 'Up'} to ${st.maxp != null ? money(st.maxp, 0) : 'any'} per lb</button>`);
    if (st.st) a.push(html`<button class="chip x" data-clear="st">Sold from ${st.st}</button>`);
    if (st.notes) a.push(html`<button class="chip x" data-clear="notes">With tasting notes</button>`);
    return a;
  }

  function table(list) {
    return html`<div class="table-wrap"><table class="t"><thead><tr><th>Coffee</th><th>Origin</th><th>Process</th><th>Roast</th><th class="r">Price</th><th class="r">Per lb</th><th>Status</th></tr></thead><tbody>
      ${list.map((c) => html`<tr><td class="lot"><button data-coffee="${c.id}">${c.n}</button><span class="sub">${B.sellerLine(c.co)}</span></td>
        <td>${c.o === 'BLEND' ? 'Blend' : c.oo ? c.oo.n : ''}${c.rg ? html`<span class="sub">${c.rg[0]}</span>` : ''}</td><td>${c.p || ''}</td><td>${c.k === 'g' ? 'Green' : c.ro || ''}</td>
        <td class="r num nw">${c.pr != null ? money(c.pr) : ''}${c.lb && c.pr != null ? html`<span class="sub">${B.fmtLb(c.lb)}</span>` : ''}</td><td class="r num nw">${c.ppl != null ? money(c.ppl) : ''}</td><td class="nw">${B.pill(c)}</td></tr>`)}
    </tbody></table></div>`;
  }

  B.views.finder = {
    render(main, st) {
      defaults(st);
      const m = B.D.meta.counts;
      main.innerHTML = String(html`<div class="wrap">
        <div class="stack" style="--gap:6px;margin-bottom:18px"><h1 style="font-size:clamp(28px,3.6vw,42px)">Find a coffee</h1>
          <p class="muted" style="max-width:76ch">${int(m.listed)} listings with a price or a stock check, plus ${int(m.refs)} names recorded from roasters’ ranges. Each listing links to the seller’s own page.</p></div>
        <div class="finder">
          <aside class="filters" id="fx" aria-label="Filters">
            <label class="search"><span class="sr">Search within the finder</span>${raw(B.I.search)}<input class="input" id="fx-q" type="search" placeholder="Name, roaster, region, variety" value="${st.q}" autocomplete="off"></label>
            <div class="seg" role="group" aria-label="Roasted or green"><button data-set="kind" data-v="r">Roasted</button><button data-set="kind" data-v="g">Green</button><button data-set="kind" data-v="all">Both</button></div>
            <fieldset><legend>Origin</legend><div class="chips" id="fx-origins"></div></fieldset>
            <fieldset id="fs-region"><legend>Growing region</legend><div class="chips" id="fx-region"></div></fieldset>
            <fieldset><legend>Process</legend><div class="chips" id="fx-process"></div></fieldset>
            <fieldset id="fs-roast"><legend>Roast</legend><div class="chips" id="fx-roast"></div></fieldset>
            <fieldset><legend>Flavor, from sellers’ tasting notes</legend><div class="chips" id="fx-fams"></div></fieldset>
            <fieldset><legend>Certification</legend><div class="chips" id="fx-certs"></div></fieldset>
            <fieldset><legend>Price per pound</legend><div class="chips" id="fx-bands"></div>
              <div class="row nowrap" style="--gap:8px"><label class="field grow"><span class="sr">From, dollars per pound</span><input class="input num" id="fx-min" type="number" min="0" step="1" inputmode="decimal" placeholder="From $" value="${st.minp == null ? '' : st.minp}"></label>
              <label class="field grow"><span class="sr">To, dollars per pound</span><input class="input num" id="fx-max" type="number" min="0" step="1" inputmode="decimal" placeholder="To $" value="${st.maxp == null ? '' : st.maxp}"></label></div></fieldset>
            <fieldset><legend>Caffeine</legend><div class="seg" role="group" aria-label="Caffeine"><button data-set="decaf" data-v="any">Any</button><button data-set="decaf" data-v="none">Regular</button><button data-set="decaf" data-v="only">Decaf</button></div></fieldset>
            <label class="field"><span>Seller’s state</span><select class="select" id="fx-st"></select></label>
            <fieldset><legend>Also show</legend>
              <label class="check"><input type="checkbox" id="fx-notes" ${st.notes ? raw('checked') : ''}> Only coffees with tasting notes</label>
              <label class="check"><input type="checkbox" id="fx-sold" ${st.sold ? raw('checked') : ''}> Sold out when checked</label>
              <label class="check"><input type="checkbox" id="fx-refs" ${st.refs ? raw('checked') : ''}> Catalog references, not verified</label></fieldset>
          </aside>
          <section aria-label="Results">
            <div class="toolbar">
              <div class="row" style="--gap:10px"><button class="btn ghost sm filters-toggle" id="fx-toggle" aria-expanded="false">Filters</button><b id="fx-count" role="status" aria-live="polite"></b></div>
              <div class="row" style="--gap:8px"><label class="row nowrap" style="--gap:6px"><span class="small muted">Sort</span><select class="select" id="fx-sort" style="min-height:32px;width:auto">${SORTS.map((s) => html`<option value="${s[0]}" ${st.sort === s[0] ? raw('selected') : ''}>${s[1]}</option>`)}</select></label>
                <div class="seg" role="group" aria-label="Layout"><button data-set="view" data-v="cards">Cards</button><button data-set="view" data-v="table">Table</button></div></div>
            </div>
            <div class="chips" id="fx-active" style="margin-bottom:12px"></div>
            <div id="fx-out"></div>
          </section>
        </div></div>`);

      const fx = $('#fx', main);
      function update() {
        defaults(st);
        const f = facets(st);
        ['origins', 'region', 'process', 'roast', 'fams', 'certs', 'bands'].forEach((k) => { $('#fx-' + k, main).innerHTML = String(f[k]); });
        $('#fs-region', main).hidden = !String(f.region); $('#fs-roast', main).hidden = st.kind === 'g';
        $('#fx-st', main).innerHTML = String(f.state);
        $$('[data-set]', main).forEach((b) => b.setAttribute('aria-pressed', String(st[b.dataset.set] || '') === b.dataset.v));
        const list = sorted(run(st), st), act = active(st);
        $('#fx-count', main).textContent = plural(list.length, st.kind === 'g' ? 'green lot' : 'coffee');
        $('#fx-active', main).innerHTML = String(act.length ? html`${act}<button class="link small" data-clear="all" style="align-self:center;margin-left:4px">Clear all</button>` : '');
        const page = list.slice(0, st.n);
        $('#fx-out', main).innerHTML = String(!list.length ? html`<div class="empty"><b>Nothing matches all of that.</b>Take a filter off${st.refs ? '' : html`, or include the ${int(m.refs)} catalog references we have not verified`}.
            <div class="row" style="margin-top:12px">${st.refs ? '' : html`<button class="btn ghost sm" data-toggle="refs">Include catalog references</button>`}<button class="btn ghost sm" data-clear="all">Clear all filters</button></div></div>`
          : html`${st.view === 'table' ? table(page) : html`<div class="cards">${page.map(B.card)}</div>`}
            ${list.length > st.n ? html`<div class="more"><button class="btn ghost" id="fx-more">Show ${Math.min(PAGE * 2, list.length - st.n)} more of ${int(list.length - st.n)}</button></div>` : ''}`);
        const more = $('#fx-more', main); if (more) more.addEventListener('click', () => { st.n += PAGE * 2; update(); });
      }
      const change = () => { st.n = PAGE; update(); };
      main.addEventListener('click', (e) => {
        const t = e.target.closest('[data-f],[data-set],[data-clear],[data-toggle],[data-band]'); if (!t || !main.contains(t)) return;
        const d = t.dataset;
        if (d.f && t.closest('.finder')) { const a = st[d.f], i = a.indexOf(d.v); if (i >= 0) a.splice(i, 1); else a.push(d.v); if (d.f === 'origins') st.region = null; return change(); }
        if (d.set) { st[d.set] = st[d.set] === d.v && d.set === 'region' ? null : d.v; if (d.set === 'kind') { st.minp = st.maxp = null; $('#fx-min', main).value = ''; $('#fx-max', main).value = ''; if (d.v === 'g') st.roast = []; } return change(); }
        if (d.band != null) { const p = d.band.split(',').map((x) => (x === '' ? null : +x)); const same = st.minp == p[0] && st.maxp == p[1]; st.minp = same ? null : p[0]; st.maxp = same ? null : p[1]; $('#fx-min', main).value = st.minp == null ? '' : st.minp; $('#fx-max', main).value = st.maxp == null ? '' : st.maxp; return change(); }
        if (d.toggle) { st[d.toggle] = !st[d.toggle]; const cb = $('#fx-' + d.toggle, main); if (cb) cb.checked = st[d.toggle]; return change(); }
        if (d.clear) {
          const c = d.clear;
          if (c === 'all') { const keep = { kind: st.kind, sort: st.sort, view: st.view }; Object.keys(st).forEach((k) => delete st[k]); Object.assign(st, keep); $('#fx-q', main).value = ''; $('#fx-min', main).value = ''; $('#fx-max', main).value = ''; ['notes', 'sold', 'refs'].forEach((k) => ($('#fx-' + k, main).checked = false)); }
          else if (c === 'q') { st.q = ''; $('#fx-q', main).value = ''; }
          else if (c === 'price') { st.minp = st.maxp = null; $('#fx-min', main).value = ''; $('#fx-max', main).value = ''; }
          else if (c === 'decaf') st.decaf = 'any';
          else if (c === 'notes') { st.notes = false; $('#fx-notes', main).checked = false; }
          else st[c] = null;
          return change();
        }
      });
      $('#fx-q', main).addEventListener('input', B.debounce((e) => { st.q = e.target.value; change(); }, 140));
      const num = (v) => (v === '' || isNaN(+v) ? null : +v);
      $('#fx-min', main).addEventListener('input', B.debounce((e) => { st.minp = num(e.target.value); change(); }, 200));
      $('#fx-max', main).addEventListener('input', B.debounce((e) => { st.maxp = num(e.target.value); change(); }, 200));
      $('#fx-st', main).addEventListener('change', (e) => { st.st = e.target.value || null; change(); });
      $('#fx-sort', main).addEventListener('change', (e) => { st.sort = e.target.value; change(); });
      ['notes', 'sold', 'refs'].forEach((k) => $('#fx-' + k, main).addEventListener('change', (e) => { st[k] = e.target.checked; change(); }));
      $('#fx-toggle', main).addEventListener('click', (e) => { const open = fx.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', open); });
      update();
    },
  };
})();
