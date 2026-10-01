/* Buna Index: Atlas (home) view */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, money, perLb, by } = B;
  let globe = null;

  function monthsStrip(o, withLabels) {
    const cells = [];
    for (let m = 1; m <= 12; m++) {
      const h = o.harvest && o.harvest.includes(m), f = o.fly && o.fly.includes(m), a = o.arrive && o.arrive.length < 12 && o.arrive.includes(m);
      cells.push(html`<i class="${h && a ? 'ha' : h ? 'h' : f ? 'f' : a ? 'a' : ''}${m === B.NOW_MONTH ? ' now' : ''}" title="${B.MONTHS[m - 1]}"></i>`);
    }
    return html`<div class="months" role="img" aria-label="${harvestText(o)}">${cells}</div>${withLabels ? html`<div class="months lab" aria-hidden="true">${B.MON.map((m) => html`<span>${m[0]}</span>`)}</div>` : ''}`;
  }
  function span(ms) {
    if (!ms || !ms.length) return '';
    if (ms.length === 12) return 'all year';
    return B.MONTHS[ms[0] - 1] + ' to ' + B.MONTHS[ms[ms.length - 1] - 1];
  }
  function harvestText(o) {
    if (!o.harvest) return 'Harvest months are not on record for this origin.';
    return 'Main harvest ' + span(o.harvest) + (o.fly ? '; second harvest ' + span(o.fly) : '') + (o.arrive ? '; fresh crop reaches US warehouses ' + span(o.arrive) : '') + '.';
  }
  B.monthsStrip = monthsStrip; B.harvestText = harvestText;

  function topCities(oid, region) {
    const m = new Map();
    B.coffees.forEach((c) => {
      if (c.o !== oid || !c.listed) return;
      if (region && !(c.rg && c.rg.includes(region))) return;
      const co = c.co; if (!co.pt || !co.city || !co.st) return;
      const k = co.city + ', ' + co.st; m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m.entries()).map((e) => ({ city: B.cityMap.get(e[0]), n: e[1] })).filter((x) => x.city).sort(by((x) => -x.n));
  }

  function intro() {
    const m = B.D.meta.counts;
    const now = B.liveOrigins.filter((o) => o.n_listed > 0 && o.harvest && o.harvest.includes(B.NOW_MONTH));
    return {
      top: html`
        <h1>From the hillside to your street.</h1>
        <p class="lede">Buna Index traces ${int(m.listed)} listed coffees from ${m.origins} origins to the ${int(m.companies)} roasters, cafés and importers that sell them across the United States. Every listing links back to the page it came from.</p>
        <button class="search" id="hero-search" style="text-align:left;max-width:460px"><span class="sr">Search the index</span>${raw(B.I.search)}<span class="input" style="display:flex;align-items:center;color:var(--ink3)">Search a coffee, origin, roaster or city</span></button>`,
      more: html`
        <div class="stack" style="--gap:8px">
          <h3>Picking now, in ${B.MONTHS[B.NOW_MONTH - 1]}</h3>
          <div class="chips">${now.map((o) => html`<button class="chip" data-origin="${o.id}">${o.n} <span class="n">${int(o.n_listed)}</span></button>`)}</div>
          <p class="small muted">Typical harvest windows. Fresh crop lands in US warehouses three to six months after picking.</p>
        </div>
        <div class="stack" style="--gap:6px">
          <div class="head"><h3>All origins</h3><span class="small faint">listed coffees</span></div>
          <div class="origin-list">${B.liveOrigins.map((o) => html`<button data-origin="${o.id}"><b>${o.n}</b><span>${int(o.n_listed)}</span></button>`)}</div>
        </div>`,
    };
  }

  function originPanel(o, st) {
    const roast = B.originSummary(o.id, 'r'), green = B.originSummary(o.id, 'g');
    const r = st.region && o.reg[st.region];
    const cities = topCities(o.id, st.region);
    const nReg = r ? r.listed : o.n_listed;
    const regs = o.rg.slice().sort(by((x) => -x.count));
    const facts = [['Altitude', o.alt ? int(o.alt[0]) + ' to ' + int(o.alt[1]) + ' m' : ''], ['Varieties', o.vars], ['Processing', o.proc], ['In the cup', o.cup], ['Grades', o.grade], ['Export bag', o.bag ? o.bag + ' kg' : '']].filter((f) => f[1]);
    return {
      top: html`
        <div><button class="link small" id="back-world">&larr; All origins</button></div>
        <div class="stack" style="--gap:8px"><div class="small faint" style="font-weight:650">${o.ct}</div>
          <h1 style="font-size:clamp(34px,5vw,60px)">${o.n}</h1>
          <p class="lede">${o.blurb || ''}</p></div>
        <div class="stats">
          <div class="stat"><span class="figure num">${int(o.n_roast)}</span><span class="cap">roasted coffees listed</span></div>
          <div class="stat"><span class="figure num">${int(o.n_green)}</span><span class="cap">green lots listed</span></div>
          <div class="stat"><span class="figure num">${roast && roast.n >= 3 ? money(roast.med, 0) : '—'}</span><span class="cap">${roast && roast.n >= 3 ? 'median per lb, ' + roast.n + ' retail bags' : 'too few priced bags for a median'}</span></div>
          <div class="stat"><span class="figure num">${green && green.n >= 3 ? money(green.med) : '—'}</span><span class="cap">${green && green.n >= 3 ? 'median per lb green, ' + green.n + ' lots' : 'too few priced green lots'}</span></div>
        </div>
        <div class="row">
          <button class="btn primary" data-go="finder" data-params='${JSON.stringify({ reset: true, origins: [o.id], region: st.region || null, kind: 'r' })}'>See ${r ? 'coffees from ' + r.n : 'the ' + int(o.n_roast) + ' coffees'}</button>
          ${o.n_green ? html`<button class="btn ghost" data-go="offers" data-params='${JSON.stringify({ reset: true, origin: o.id })}'>Green lots for roasters</button>` : ''}
        </div>`,
      more: html`
        ${o.harvest ? html`<div class="stack" style="--gap:6px"><h3>Harvest year</h3>${monthsStrip(o, true)}
          <div class="legend"><span><i style="background:var(--cherry)"></i>Main harvest</span>${o.fly ? html`<span><i style="background:var(--c2)"></i>Second harvest</span>` : ''}${o.arrive && o.arrive.length < 12 ? html`<span><i style="background:var(--leaf)"></i>Arrives in the US</span>` : ''}</div>
          <p class="small muted">${harvestText(o)}</p></div>` : ''}
        ${facts.length ? html`<dl class="kv">${facts.map((f) => html`<dt>${f[0]}</dt><dd>${f[1]}</dd>`)}</dl><p class="tiny faint">Field guide: general reference, separate from the indexed records.</p>` : ''}
        <div class="stack" style="--gap:8px">
          <div class="head"><h3>${r ? r.n : 'Where it is sold'}</h3>
            <div class="seg" role="group" aria-label="Map view"><button id="v-reg" aria-pressed="${!st.trace}">Regions</button><button id="v-trace" aria-pressed="${!!st.trace}" ${cities.length ? '' : raw('disabled')}>Trace to US cities</button></div></div>
          ${r && r.note ? html`<p class="muted">${r.note}</p>` : ''}
          ${st.trace ? html`<p class="small muted">${plural(nReg, 'listed coffee')} from ${r ? r.n : o.n}, sold by businesses in ${plural(cities.length, 'mapped US city', 'mapped US cities')}. Arcs run to the seller’s city, not to a storefront.</p>
            <div class="chips">${cities.slice(0, 18).map((c) => html`<button class="chip" data-go="places" data-params='${JSON.stringify({ city: c.city.key })}'>${c.city.key} <span class="n">${c.n}</span></button>`)}</div>` : ''}
        </div>
        ${regs.length ? html`<div class="stack" style="--gap:2px"><div class="head"><h3>Growing regions</h3><span class="small faint">coffees in the index</span></div>
          <div class="region-list">${regs.map((x) => html`<button data-reg="${x.n}" aria-pressed="${st.region === x.n}"><b>${x.n}</b><span class="n">${x.count || '—'}</span>${x.note ? html`<small>${x.note}</small>` : ''}</button>`)}</div>
          <p class="tiny faint">Shaded areas are administrative reference areas and dots are reference points. Neither is a cultivation boundary.</p></div>` : ''}`,
    };
  }

  function picks(o, region) {
    let list = B.coffees.filter((c) => c.k === 'r' && c.listed && !c.fm && (o ? c.o === o.id : true) && (!region || (c.rg && c.rg.includes(region))));
    list.sort(by((c) => (c.s === 'avail' ? 0 : 2) + (c.tn ? 0 : 1) + (c.ppl != null ? 0 : 0.6) - (c.ch === B.TODAY ? 0.2 : 0)));
    if (!o) { const seen = new Set(); list = list.filter((c) => c.tn && c.oo && !seen.has(c.o) && seen.add(c.o)); }
    return list.slice(0, o ? 8 : 4);
  }

  B.views.atlas = {
    render(main, st) {
      if (st.month == null) st.month = B.NOW_MONTH;
      const o = st.origin && B.O[st.origin] && B.O[st.origin].n_all ? B.O[st.origin] : null;
      if (!o) { st.origin = null; st.region = null; st.trace = false; }
      const parts = o ? originPanel(o, st) : intro();
      const cards = picks(o, st.region);
      main.innerHTML = String(html`<div class="wrap">
        <section class="hero">
          <div class="hero-copy h-top">${parts.top}</div>
          <div class="globe-box">
            ${B.geo.ok ? html`<canvas id="globe" tabindex="0" aria-label="A globe showing coffee origin countries. Drag to turn it, or use the arrow keys. Pick an origin from the list beside it."></canvas>
            <div class="globe-ui tl">
              <div class="seg" role="group" aria-label="Globe colouring"><button id="m-index" aria-pressed="${st.mode !== 'harvest'}">Coffees</button><button id="m-harvest" aria-pressed="${st.mode === 'harvest'}">Harvest clock</button></div>
              <div class="panel clock" id="clock" ${st.mode === 'harvest' ? '' : raw('hidden')}>
                <div class="row between"><output id="clock-out">${B.MONTHS[st.month - 1]}</output><span class="tiny faint">drag to change the month</span></div>
                <input type="range" id="clock-in" min="1" max="12" step="1" value="${st.month}" aria-label="Month">
                <div class="legend"><span><i style="background:var(--cherry)"></i>Picking</span><span><i style="background:var(--c2)"></i>Second harvest</span><span><i style="background:var(--leaf)"></i>Arriving in the US</span></div>
              </div>
            </div>
            <div class="globe-ui br"><button class="gbtn" id="z-in" aria-label="Zoom in">+</button><button class="gbtn" id="z-out" aria-label="Zoom out">&minus;</button><button class="gbtn" id="z-reset" aria-label="Show the whole globe" title="Whole globe">&#8962;</button></div>
            <div class="legend" id="g-legend" style="margin-top:6px" ${st.mode === 'harvest' ? raw('hidden') : ''}><span><i style="background:var(--c1)"></i><i style="background:var(--c2)"></i><i style="background:var(--c3)"></i><i style="background:var(--c4)"></i><i style="background:var(--c5)"></i>&nbsp;fewer to more listed coffees</span><span class="faint">Tap a shaded country</span></div>`
            : html`<div class="empty"><b>The map could not load.</b>Everything else works: pick an origin from the list.</div>`}
          </div>
          <div class="hero-copy h-more">${parts.more}</div>
        </section>
        ${cards.length ? html`<section class="stack" style="margin-top:clamp(26px,4vw,44px);--gap:14px">
          <div class="head"><h2>${o ? (st.region ? st.region + ', ' : '') + o.n + ' on the shelf' : 'Four ways to start'}</h2>
            ${o ? html`<button class="link" data-go="finder" data-params='${JSON.stringify({ reset: true, origins: [o.id], region: st.region || null, kind: 'r' })}'>See all</button>` : html`<span class="small muted">One coffee each from four origins, all with tasting notes.</span>`}</div>
          <div class="cards">${cards.map(B.card)}</div></section>` : ''}
        ${o ? '' : html`<nav class="trio" aria-label="Start here">
          <a href="#finder"><h3>Find a coffee</h3><span class="muted">Filter ${int(B.D.meta.counts.listed)} listings by origin, process, roast, flavor and price per pound.</span></a>
          <a href="#flavor"><h3>Start from flavor</h3><span class="muted">Pick what you like to taste and see which coffees and origins match.</span></a>
          <a href="#places"><h3>See who is near you</h3><span class="muted">${int(B.cities.length)} cities with roasters, cafés and importers on the map.</span></a>
          <a href="#notes"><h3>Read the field notes</h3><span class="muted">Harvest calendar, brew ratios, processing and the rest of the coffee plant.</span></a>
        </nav>`}
      </div>`);

      const hs = $('#hero-search', main); if (hs) hs.addEventListener('click', () => B.palette());
      const back = $('#back-world', main); if (back) back.addEventListener('click', () => B.go('atlas', { origin: null, region: null, trace: false }));
      $$('[data-reg]', main).forEach((b) => b.addEventListener('click', () => B.go('atlas', { region: st.region === b.dataset.reg ? null : b.dataset.reg })));
      const vr = $('#v-reg', main), vt = $('#v-trace', main);
      if (vr) vr.addEventListener('click', () => B.go('atlas', { trace: false }));
      if (vt) vt.addEventListener('click', () => B.go('atlas', { trace: true }));

      if (!B.geo.ok) return;
      if (globe) globe.destroy();
      const keep = B.views.atlas._keep;
      globe = B.geo.Globe($('#globe', main), {
        onPick(h) {
          if (h.type === 'origin') B.go('atlas', { origin: h.id, region: null, trace: false });
          else if (h.type === 'region') B.go('atlas', { region: st.region === h.id ? null : h.id });
          else if (h.type === 'city') B.go('places', { city: h.id });
        },
      });
      if (keep) { globe.state.rot = keep.rot; globe.state.k = keep.k; globe.state.spin = false; }
      globe.setMode(st.mode === 'harvest' ? 'harvest' : 'index', st.month);
      if (o) globe.select(o.id, st.region, st.trace ? topCities(o.id, st.region).slice(0, 26) : null);
      else if (keep && keep.k > 1.05) globe.select(null);
      $('#z-in', main).addEventListener('click', () => globe.zoom(1.5));
      $('#z-out', main).addEventListener('click', () => globe.zoom(1 / 1.5));
      $('#z-reset', main).addEventListener('click', () => B.go('atlas', { origin: null, region: null, trace: false }));
      const setMode = (m) => {
        st.mode = m; globe.setMode(m, st.month);
        $('#m-index', main).setAttribute('aria-pressed', m !== 'harvest'); $('#m-harvest', main).setAttribute('aria-pressed', m === 'harvest');
        $('#clock', main).hidden = m !== 'harvest'; $('#g-legend', main).hidden = m === 'harvest';
      };
      $('#m-index', main).addEventListener('click', () => setMode('index'));
      $('#m-harvest', main).addEventListener('click', () => setMode('harvest'));
      $('#clock-in', main).addEventListener('input', (e) => { st.month = +e.target.value; $('#clock-out', main).textContent = B.MONTHS[st.month - 1]; globe.setMode('harvest', st.month); });
    },
    leave() { if (globe) { B.views.atlas._keep = { rot: globe.state.rot.slice(), k: globe.state.k }; globe.destroy(); globe = null; } },
  };
})();
