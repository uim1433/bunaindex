/* Buna Index: Price index (green and retail price per pound by origin, the spread between them, quote check) */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, money, perLb, by } = B;

  /* external reference prices, each with its source; shown as context, never mixed into the index's own medians */
  const REF = {
    c: { v: 2.88, label: 'Commodity futures (ICE “C”)', when: 'about $2.88 on Oct 1, 2026', src: 'https://tradingeconomics.com/commodity/coffee', by: 'Trading Economics' },
    fob: { v: 4.39, label: 'Specialty contracts at origin (FOB)', when: 'median $4.39 for the 2024/25 harvest', src: 'https://perfectdailygrind.com/2026/04/why-coffee-roasters-are-explaining-price-increases/', by: 'Specialty Coffee Transaction Guide, as reported by Perfect Daily Grind' },
    retail: { v: 35.98, label: 'Specialty Coffee Retail Price Index', when: '$35.98 per lb at the end of June 2026, across 55 North American roasters', src: 'https://www.transactionguide.coffee/reports/2026q2', by: 'Specialty Coffee Transaction Guide' },
  };

  const greenVals = (f) => B.coffees.filter((c) => c.k === 'g' && c.listed && c.ppl != null && !c.d && (!f || f(c)));
  const retailVals = (f) => B.coffees.filter((c) => c.retail && c.listed && (!f || f(c)));
  function byOrigin(list, minN) {
    const m = new Map(); list.forEach((c) => { if (!c.oo) return; if (!m.has(c.o)) m.set(c.o, []); m.get(c.o).push(c.ppl); });
    return Array.from(m.entries()).map((e) => ({ o: B.O[e[0]], s: B.summary(e[1]), vals: e[1].sort((a, b) => a - b) })).filter((r) => r.s.n >= minN);
  }
  function scale(rows) {
    const all = [].concat.apply([], rows.map((r) => r.vals)).sort((a, b) => a - b), top = B.quantile(all, 0.97);
    const step = [1, 2, 3, 5, 10, 20, 25].find((s) => top / s <= 6.5) || 50, max = Math.ceil(top / step) * step, ticks = [];
    for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
    return { max, ticks, n: ticks.length - 1 };
  }
  const pct = (v, max) => Math.max(0, Math.min(100, (v / max) * 100)).toFixed(2);
  const tipText = (r, unit) => `<b>${B.esc(r.o.n)}</b>${r.s.n} ${unit}<br>Low ${money(r.s.min)} · middle half ${money(r.s.q1)} to ${money(r.s.q3)} · high ${money(r.s.max)}`;

  function rangePlot(rows, sc, color, kind, refs) {
    return html`<div class="rp" style="--ticks:${sc.n};--rp:${color}">
      <div class="rp-axis"><span class="small faint">priced ${kind === 'g' ? 'lots' : 'bags'}</span><div class="rp-scale">${sc.ticks.map((v) => html`<span style="left:${pct(v, sc.max)}%">${money(v, 0)}</span>`)}</div><span class="rp-v small faint" style="font-weight:500">median</span></div>
      ${rows.map((r) => html`<button class="rp-row" data-go="${kind === 'g' ? 'offers' : 'finder'}" data-params='${JSON.stringify(kind === 'g' ? { reset: true, origin: r.o.id, priced: true, sort: 'ppl', dir: 1 } : { reset: true, origins: [r.o.id], kind: 'r', sort: 'pl' })}' data-tip="${tipText(r, kind === 'g' ? 'priced green lots' : 'retail bags of 8 to 16 oz')}" aria-label="${r.o.n}: median ${money(r.s.med)} per pound across ${r.s.n}, from ${money(r.s.min)} to ${money(r.s.max)}">
        <span class="rp-l">${r.o.n}<small>${r.s.n}</small></span>
        <span class="rp-t"><i class="rp-range" style="left:${pct(r.s.min, sc.max)}%;width:${(pct(Math.min(r.s.max, sc.max), sc.max) - pct(r.s.min, sc.max)).toFixed(2)}%"></i><i class="rp-box" style="left:${pct(r.s.q1, sc.max)}%;width:${(pct(r.s.q3, sc.max) - pct(r.s.q1, sc.max)).toFixed(2)}%"></i><i class="rp-med" style="left:${pct(r.s.med, sc.max)}%"></i>${r.s.max > sc.max ? html`<i class="rp-over"></i>` : ''}</span>
        <span class="rp-v">${money(r.s.med)}</span></button>`)}
      ${(refs || []).map((x, i) => html`<i class="rp-ref${i ? ' b' : ''}" style="--x:${(x.v / sc.max).toFixed(4)}"></i>`)}
    </div>`;
  }
  function spreadPlot(rows, max, ticks) {
    return html`<div class="rp" style="--ticks:${ticks.length - 1}">
      <div class="rp-axis"><span></span><div class="rp-scale">${ticks.map((v) => html`<span style="left:${pct(v, max)}%">${money(v, 0)}</span>`)}</div><span class="rp-v small faint" style="font-weight:500">multiple</span></div>
      ${rows.map((r) => html`<button class="rp-row" data-origin="${r.o.id}" data-tip="<b>${B.esc(r.o.n)}</b>Green ${money(r.g.med)} per lb (${r.g.n} lots)<br>Roasted ${money(r.r.med)} per lb (${r.r.n} bags)" aria-label="${r.o.n}: green median ${money(r.g.med)}, roasted retail median ${money(r.r.med)} per pound, ${r.x.toFixed(1)} times">
        <span class="rp-l">${r.o.n}</span>
        <span class="rp-t"><i class="rp-link" style="left:${pct(r.g.med, max)}%;width:${(pct(r.r.med, max) - pct(r.g.med, max)).toFixed(2)}%"></i><i class="rp-dot" style="left:${pct(r.g.med, max)}%;background:var(--s-green)"></i><i class="rp-dot" style="left:${pct(r.r.med, max)}%;background:var(--s-roast)"></i></span>
        <span class="rp-v">${r.x.toFixed(1)}×</span></button>`)}
    </div>`;
  }
  const dataTable = (rows, unit) => html`<div class="table-wrap"><table class="t"><thead><tr><th>Origin</th><th class="r">${unit}</th><th class="r">Low</th><th class="r">Lower quarter</th><th class="r">Median</th><th class="r">Upper quarter</th><th class="r">High</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr><td><button class="link" data-origin="${r.o.id}" style="color:var(--ink)">${r.o.n}</button></td><td class="r num">${r.s.n}</td><td class="r num">${money(r.s.min)}</td><td class="r num">${money(r.s.q1)}</td><td class="r num"><b>${money(r.s.med)}</b></td><td class="r num">${money(r.s.q3)}</td><td class="r num">${money(r.s.max)}</td></tr>`)}</tbody></table></div>`;

  B.views.prices = {
    render(main, st) {
      st.tab = st.tab || 'spread'; st.sort = st.sort || 'med'; st.qk = st.qk || 'g'; st.qo = st.qo || 'ETH';
      const G = byOrigin(greenVals(), 5), R = byOrigin(retailVals(), 5);
      const gAll = B.summary(greenVals().map((c) => c.ppl)), rAll = B.summary(retailVals().map((c) => c.ppl));
      const sorter = st.sort === 'n' ? by((r) => -r.s.n) : st.sort === 'az' ? by((r) => r.o.n) : by((r) => -r.s.med);
      G.sort(sorter); R.sort(sorter);
      const gm = new Map(G.map((r) => [r.o.id, r])), S = R.filter((r) => gm.has(r.o.id)).map((r) => ({ o: r.o, g: gm.get(r.o.id).s, r: r.s, x: r.s.med / gm.get(r.o.id).s.med }));
      S.sort(st.sort === 'az' ? by((r) => r.o.n) : st.sort === 'n' ? by((r) => -(r.g.n + r.r.n)) : by((r) => -r.x));
      const gs = scale(G), rs = scale(R);
      const small = B.summary(greenVals((c) => c.mlb && c.mlb <= 5).map((c) => c.ppl)), bag = B.summary(greenVals((c) => c.mlb > 50).map((c) => c.ppl));
      const tiered = B.coffees.filter((c) => c.k === 'g' && c.tr && c.tr.length > 1), disc = B.summary(tiered.map((c) => 1 - (c.tr[c.tr.length - 1][1] / c.tr[c.tr.length - 1][0]) / (c.tr[0][1] / c.tr[0][0])));
      const procOf = (list) => { const m = new Map(); list.forEach((c) => { if (!c.p) return; if (!m.has(c.p)) m.set(c.p, []); m.get(c.p).push(c.ppl); }); return Array.from(m.entries()).map((e) => ({ p: e[0], s: B.summary(e[1]) })).filter((x) => x.s.n >= 5).sort(by((x) => -x.s.med)); };
      const pg = procOf(greenVals()), prr = procOf(retailVals());
      const ladder = [[REF.c.label, REF.c.v, REF.c.when, 'var(--s-green)'], [REF.fob.label, REF.fob.v, REF.fob.when, 'var(--s-green)'], ['US importers’ list prices, this index', gAll.med, 'median of ' + int(gAll.n) + ' priced green lots', 'var(--s-green)'], ['Roasted, on the shelf, this index', rAll.med, 'median of ' + int(rAll.n) + ' bags of 8 to 16 oz', 'var(--s-roast)']];
      const lmax = 32;
      const tab = st.tab;
      main.innerHTML = String(html`<div class="wrap">
        <div class="stack" style="--gap:6px;margin-bottom:20px"><h1 style="font-size:clamp(28px,3.6vw,42px)">Price index</h1>
          <p class="lede">What a pound of coffee is listed for, green and roasted, origin by origin. Built from ${int(gAll.n)} priced green lots and ${int(rAll.n)} retail bags on ${B.fmtDate(B.TODAY)}.</p></div>

        <section class="panel pad stack" style="--gap:14px;margin-bottom:16px">
          <div class="head"><h2>One pound of coffee, four prices</h2><div class="legend"><span><i style="background:var(--s-green);border-radius:50%"></i>Green coffee</span><span><i style="background:var(--s-roast);border-radius:50%"></i>Roasted coffee</span></div></div>
          <div class="bars ladder">${ladder.map((l) => html`<div class="b"><span><b>${l[0]}</b><br><span class="small muted">${l[2]}</span></span><i style="width:${Math.min(100, (l[1] / lmax) * 100)}%;background:${l[3]}"></i><span class="num"><b>${money(l[1])}</b></span></div>`)}</div>
          <p class="small muted" style="max-width:86ch">The first two are other people’s figures, cited below. The last two are this index’s own medians. They are not the same coffees and the steps between them are not one company’s margin: freight, import, warehousing, roast loss of about 15 percent, packaging, labor and rent all sit in the gaps.</p>
        </section>

        <div class="toolbar" style="margin-top:26px"><div class="seg" role="group" aria-label="Chart">${[['spread', 'Green to shelf'], ['green', 'Green coffee'], ['retail', 'Roasted, retail']].map((t) => html`<button data-tab="${t[0]}" aria-pressed="${tab === t[0]}">${t[1]}</button>`)}</div>
          <div class="row" style="--gap:8px"><label class="row nowrap" style="--gap:6px"><span class="small muted">Order</span><select class="select" id="px-sort" style="min-height:32px;width:auto"><option value="med" ${st.sort === 'med' ? raw('selected') : ''}>${tab === 'spread' ? 'Widest gap first' : 'Highest median first'}</option><option value="n" ${st.sort === 'n' ? raw('selected') : ''}>Most records first</option><option value="az" ${st.sort === 'az' ? raw('selected') : ''}>A to Z</option></select></label>
            ${tab === 'spread' ? '' : html`<div class="seg" role="group" aria-label="Chart or table"><button data-table="0" aria-pressed="${!st.table}">Chart</button><button data-table="1" aria-pressed="${!!st.table}">Table</button></div>`}</div></div>
        <section class="panel pad stack" style="--gap:12px">
          ${tab === 'green' ? html`<div class="head"><h3>Green coffee, list price per pound</h3><span class="small muted">line: low to high · bar: the middle half · dot: median</span></div>
              ${st.table ? dataTable(G, 'Lots') : rangePlot(G, gs, 'var(--s-green)', 'g', [REF.c, REF.fob])}
              ${st.table ? '' : html`<div class="legend"><span><i class="keyline"></i>${REF.c.label}, ${REF.c.when}</span><span><i class="keyline b"></i>${REF.fob.label}, ${REF.fob.when}</span></div>`}
              <p class="small muted" style="max-width:86ch">Origins with five or more priced lots. Decaf is left out. Only importers who publish prices are here, and most of them sell in small packs, so these sit above what a container buyer pays. Tap a row to open its lots.</p>`
          : tab === 'retail' ? html`<div class="head"><h3>Roasted coffee, retail price per pound</h3><span class="small muted">line: low to high · bar: the middle half · dot: median</span></div>
              ${st.table ? dataTable(R, 'Bags') : rangePlot(R, rs, 'var(--s-roast)', 'r')}
              <p class="small muted" style="max-width:86ch">Bags of 8 to 16 oz, price divided by weight. Origins with five or more priced bags. For comparison, the ${REF.retail.label} stood at ${REF.retail.when}. Tap a row to open its coffees.</p>`
          : html`<div class="head"><h3>From green to the shelf, by origin</h3><div class="legend"><span><i style="background:var(--s-green);border-radius:50%"></i>Green, median list price</span><span><i style="background:var(--s-roast);border-radius:50%"></i>Roasted, median retail</span></div></div>
              ${spreadPlot(S, rs.max, rs.ticks)}
              <p class="small muted" style="max-width:86ch">Origins with at least five priced green lots and five priced retail bags. The multiple is retail median divided by green median. It takes about 1.18 lb of green coffee to make a pound of roasted, so the true cost multiple is a little lower.</p>`}
        </section>

        <div class="two" style="margin-top:16px">
          <section class="panel pad stack" style="--gap:12px"><h3>Check a quote</h3>
            <div class="row" style="--gap:8px"><div class="seg" role="group" aria-label="Green or roasted"><button data-qk="g" aria-pressed="${st.qk === 'g'}">Green</button><button data-qk="r" aria-pressed="${st.qk === 'r'}">Roasted bag</button></div>
              <select class="select" id="px-qo" style="width:auto;flex:1 1 140px" aria-label="Origin">${(st.qk === 'g' ? G : R).slice().sort(by((r) => r.o.n)).map((r) => html`<option value="${r.o.id}" ${st.qo === r.o.id ? raw('selected') : ''}>${r.o.n}</option>`)}</select>
              <label class="row nowrap" style="--gap:6px;flex:1 1 120px"><span class="sr">Price per pound</span><input class="input num" id="px-qp" type="number" min="0" step="0.05" inputmode="decimal" placeholder="$ per lb" value="${st.qp || ''}"></label></div>
            <div id="px-qout"></div></section>
          <section class="panel pad stack" style="--gap:12px"><h3>What pack size does to a green price</h3>
            <div class="stats"><div class="stat"><span class="figure num">${small ? money(small.med) : '—'}</span><span class="cap">median per lb in packs of 5 lb or less, ${small ? small.n : 0} lots</span></div>
              <div class="stat"><span class="figure num">${bag ? money(bag.med) : '—'}</span><span class="cap">median per lb sold by the bag, ${bag ? bag.n : 0} lots</span></div>
              <div class="stat"><span class="figure num">${disc ? Math.round(disc.med * 100) + '%' : '—'}</span><span class="cap">typical saving from the smallest to the largest pack, ${disc ? disc.n : 0} lots with tiers</span></div></div>
            <p class="small muted">Different lots sit in each group, so this is a guide, not a like-for-like test.</p></section>
        </div>

        <section class="panel pad stack" style="--gap:14px;margin-top:16px"><div class="head"><h3>Median price by process</h3><span class="small muted">processes with five or more priced records</span></div>
          <div class="two"><div class="stack" style="--gap:8px"><div class="label">Green, per lb</div><div class="bars wide">${pg.map((x) => html`<div class="b"><button data-go="offers" data-params='${JSON.stringify({ reset: true, process: x.p, priced: true })}'>${x.p}</button><i style="width:${(x.s.med / pg[0].s.med) * 100}%;background:var(--s-green)"></i><span class="num">${money(x.s.med)} <span class="faint">· ${x.s.n}</span></span></div>`)}</div></div>
            <div class="stack" style="--gap:8px"><div class="label">Roasted, per lb at retail</div><div class="bars wide">${prr.map((x) => html`<div class="b"><button data-go="finder" data-params='${JSON.stringify({ reset: true, process: [x.p], kind: 'r' })}'>${x.p}</button><i style="width:${(x.s.med / prr[0].s.med) * 100}%;background:var(--s-roast)"></i><span class="num">${money(x.s.med)} <span class="faint">· ${x.s.n}</span></span></div>`)}</div></div></div>
          <p class="small muted">Process and origin travel together (most wet-hulled coffee is Indonesian, most anaerobic lots are microlots), so read these as what each style is listed for, not what the process alone adds.</p></section>

        <section class="lock" style="margin-top:16px"><span><b>This is the first dated index, so there is no trend line yet.</b> From the next one, members can follow an origin or a lot and be told when its price moves.</span><a class="btn ghost sm" href="#membership">See membership</a></section>

        <section class="stack" style="--gap:6px;margin-top:26px"><h3>Sources for the reference prices</h3>
          <ul class="small stack" style="--gap:4px">${[REF.c, REF.fob, REF.retail].map((x) => html`<li>${x.label}: ${x.when}. <a class="link ext" href="${x.src}" target="_blank" rel="noopener">${x.by}</a></li>`)}</ul>
          <p class="small muted">How the index’s own figures are worked out is on the <a class="link" href="#method">method page</a>.</p></section>
      </div>`);

      function quote() {
        const rows = st.qk === 'g' ? G : R, r = rows.find((x) => x.o.id === st.qo) || rows.slice().sort(by((x) => x.o.n))[0], sc = st.qk === 'g' ? gs : rs, p = parseFloat(st.qp);
        if (!r) return;
        st.qo = r.o.id;
        const below = isNaN(p) ? 0 : r.vals.filter((v) => v < p).length, unit = st.qk === 'g' ? 'priced green lots' : 'retail bags';
        $('#px-qout', main).innerHTML = String(html`<div class="rp" style="--ticks:${sc.n};--lab:0px;--val:0px;--rp:${st.qk === 'g' ? 'var(--s-green)' : 'var(--s-roast)'}"><div class="rp-axis"><span></span><div class="rp-scale">${sc.ticks.map((v) => html`<span style="left:${pct(v, sc.max)}%">${money(v, 0)}</span>`)}</div><span></span></div>
          <div class="rp-row" style="pointer-events:none"><span></span><span class="rp-t"><i class="rp-range" style="left:${pct(r.s.min, sc.max)}%;width:${(pct(Math.min(r.s.max, sc.max), sc.max) - pct(r.s.min, sc.max)).toFixed(2)}%"></i><i class="rp-box" style="left:${pct(r.s.q1, sc.max)}%;width:${(pct(r.s.q3, sc.max) - pct(r.s.q1, sc.max)).toFixed(2)}%"></i><i class="rp-med" style="left:${pct(r.s.med, sc.max)}%"></i>${isNaN(p) ? '' : html`<i class="rp-you" style="left:${pct(p, sc.max)}%"></i>`}</span><span></span></div></div>
          <p>${isNaN(p) ? html`<span class="muted">${r.o.n}: median ${money(r.s.med)} per lb across ${r.s.n} ${unit}; the middle half runs ${money(r.s.q1)} to ${money(r.s.q3)}. Enter a price to place it.</span>`
            : html`<b>${money(p)}</b> is ${below === 0 ? 'below every one' : below === r.s.n ? 'above every one' : 'above ' + below} of the ${r.s.n} ${unit} from ${r.o.n} in the index${below === 0 || below === r.s.n ? '' : ' and below ' + (r.s.n - below)}. ${p < r.s.q1 ? 'That is in the cheapest quarter.' : p > r.s.q3 ? 'That is in the dearest quarter.' : 'That is inside the middle half, ' + money(r.s.q1) + ' to ' + money(r.s.q3) + '.'}`}</p>
          <p class="small faint">${st.qk === 'g' ? 'List prices, mostly for small packs. A full-bag or contract quote should come in lower.' : 'Bags of 8 to 16 oz.'}</p>`);
      }
      quote();
      main.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab],[data-table],[data-qk]'); if (!t) return;
        if (t.dataset.tab) { st.tab = t.dataset.tab; return B.go('prices', {}); }
        if (t.dataset.table) { st.table = t.dataset.table === '1'; return B.go('prices', {}); }
        if (t.dataset.qk) { st.qk = t.dataset.qk; st.qp = ''; return B.go('prices', {}); }
      });
      $('#px-sort', main).addEventListener('change', (e) => { st.sort = e.target.value; B.go('prices', {}); });
      $('#px-qo', main).addEventListener('change', (e) => { st.qo = e.target.value; quote(); });
      $('#px-qp', main).addEventListener('input', (e) => { st.qp = e.target.value; quote(); });
      main.addEventListener('pointermove', (e) => { const r = e.target.closest('[data-tip]'); if (r) B.tip.show(r.dataset.tip, e.clientX, e.clientY); else B.tip.hide(); });
      main.addEventListener('pointerleave', () => B.tip.hide());
      main.addEventListener('focusin', (e) => { const r = e.target.closest('[data-tip]'); if (r) { const b = r.getBoundingClientRect(); B.tip.show(r.dataset.tip, b.left + b.width / 2, b.top); } });
      main.addEventListener('focusout', () => B.tip.hide());
    },
  };
})();
