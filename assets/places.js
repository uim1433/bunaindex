/* Buna Index: Near you (US map of roasters, cafés and importers, by city) */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, by, fold } = B;
  const TYPES = [['', 'Everyone'], ['roaster', 'Roasters'], ['cafe', 'Cafés'], ['importer', 'Importers']];
  const typeOk = (c, t) => !t || (t === 'roaster' ? c.t === 'roaster' || c.t === 'roaster_cafe' : t === 'cafe' ? c.t === 'cafe' || c.t === 'roaster_cafe' : c.t === 'importer' || c.t === 'exporter');
  const noun = (t, n) => (t === 'roaster' ? (n === 1 ? 'roaster' : 'roasters') : t === 'cafe' ? (n === 1 ? 'café' : 'cafés') : t === 'importer' ? (n === 1 ? 'importer' : 'importers') : n === 1 ? 'business' : 'businesses');
  const stateName = {};
  if (B.geo.ok) B.geo.usStates.forEach((f) => (stateName[f.id] = f.properties.n));

  function groups(st) {
    const m = new Map();
    B.companies.forEach((c) => {
      if (!c.pt || !c.city || !c.st || !typeOk(c, st.type) || (st.origin && !c.om.has(st.origin))) return;
      const k = c.city + ', ' + c.st; let g = m.get(k);
      if (!g) m.set(k, (g = { key: k, city: c.city, st: c.st, pt: B.cityMap.get(k).pt, cos: [] }));
      g.cos.push(c);
    });
    const list = Array.from(m.values()); list.forEach((g) => (g.v = g.cos.length));
    return list.sort(by((g) => -g.v));
  }
  const bizRow = (c, st) => {
    const n = st.origin ? c.om.get(st.origin) : c.coffees.length;
    return html`<li><button class="name" data-company="${c.i}">${c.n}</button><span class="small faint num">${n ? plural(n, 'coffee') : ''}</span>
      <span class="sub">${B.TYPE_LABEL[c.t] || 'Seller'}${c.origins.length ? ' · ' + c.origins.slice(0, 3).map((id) => B.O[id].n).join(', ') : ''}${c.visit ? html` · <span class="tag">Open to visitors</span>` : ''}${c.ws ? html` <span class="tag cert">Wholesale</span>` : ''}</span></li>`;
  };

  B.views.places = {
    render(main, st) {
      st.type = st.type || ''; st.origin = st.origin || '';
      if (st.city && B.cityMap.has(st.city)) st.state = B.cityMap.get(st.city).st; else st.city = null;
      const mapped = B.companies.filter((c) => c.pt && c.city && c.st).length;
      main.innerHTML = String(html`<div class="wrap">
        <div class="stack" style="--gap:6px;margin-bottom:16px"><h1 style="font-size:clamp(28px,3.6vw,42px)">Coffee near you</h1>
          <p class="muted" style="max-width:78ch">${int(mapped)} roasters, cafés and importers in ${int(B.cities.length)} US cities. Pick a city, or ask where a particular origin is sold.</p></div>
        <div class="fbar">
          <div class="field wide"><span>Show</span><div class="seg" role="group" aria-label="Type of business" style="align-self:flex-start">${TYPES.map((t) => html`<button data-type="${t[0]}" aria-pressed="${st.type === t[0]}">${t[1]}</button>`)}</div></div>
          <label class="field"><span>That sell coffee from</span><select class="select" id="pl-origin"><option value="">Any origin</option>${B.liveOrigins.map((o) => html`<option value="${o.id}" ${st.origin === o.id ? raw('selected') : ''}>${o.n}</option>`)}</select></label>
          <label class="field"><span>Go to a city</span><input class="input" id="pl-q" list="pl-cities" placeholder="Denver, CO" autocomplete="off"><datalist id="pl-cities">${B.cities.map((c) => html`<option value="${c.key}"></option>`)}</datalist></label>
        </div>
        <div class="places">
          <div class="stack" style="--gap:8px">
            <div class="map-box panel" id="pl-map" style="padding:6px">
              ${B.geo.ok ? html`<div class="globe-ui br" style="bottom:10px;right:10px"><button class="gbtn" id="pl-in" aria-label="Zoom in">+</button><button class="gbtn" id="pl-out" aria-label="Zoom out">&minus;</button><button class="gbtn" id="pl-reset" aria-label="Show the whole country" title="Whole country">&#8962;</button></div>` : html`<div class="empty"><b>The map could not load.</b>Use the city list beside it.</div>`}
            </div>
            <div class="legend"><span><i style="border-radius:50%;background:var(--accent);opacity:.8"></i>A city; larger means more businesses</span><span><i style="border-radius:50%;background:var(--honey);border:1px solid var(--ink)"></i>A published address, shown when you zoom in</span><span class="faint">Drag to move. Pinch, or use the buttons, to zoom.</span></div>
          </div>
          <aside id="pl-side" class="stack" style="--gap:18px" aria-live="polite"></aside>
        </div></div>`);

      let map = null, G = [];
      const side = $('#pl-side', main);
      function sheet() {
        const filterText = (st.type ? noun(st.type, 2) : 'businesses') + (st.origin ? ' selling coffee from ' + B.O[st.origin].n : '');
        const home = B.home();
        if (st.city) {
          const g = G.find((x) => x.key === st.city), all = B.cityMap.get(st.city);
          const d = home && home !== st.city && B.cityMap.has(home) ? B.miles(B.cityMap.get(home).pt, all.pt) : null;
          const near = G.filter((x) => x.key !== st.city).map((x) => ({ x, d: B.miles(all.pt, x.pt) })).filter((x) => x.d < 75).sort(by((x) => x.d)).slice(0, 6);
          const cos = g ? g.cos.slice().sort((a, b) => (st.origin ? (b.om.get(st.origin) || 0) - (a.om.get(st.origin) || 0) : b.nListed - a.nListed) || b.coffees.length - a.coffees.length || (a.n < b.n ? -1 : 1)) : [];
          return html`<div><button class="link small" data-back="state">&larr; ${stateName[st.state] || st.state}</button></div>
            <div class="stack" style="--gap:6px"><h2>${st.city}</h2>
              <div class="muted">${g ? plural(g.v, noun(st.type, 1), noun(st.type, 2)) + (st.origin ? ' selling coffee from ' + B.O[st.origin].n : '') : 'No ' + filterText + ' here'}${d != null ? ' · ' + int(Math.round(d)) + ' miles from ' + home : ''}</div>
              <div class="row">${home === st.city ? html`<span class="tag cert">Your city</span>` : html`<button class="btn ghost sm" id="pl-home">Make this my city</button>`}
                ${st.origin || st.type ? html`<button class="link small" id="pl-clearf">Show everyone here</button>` : ''}</div></div>
            ${cos.length ? html`<ul class="biz">${cos.map((c) => bizRow(c, st))}</ul>` : html`<div class="empty"><b>Nothing here under those filters.</b>${plural(all.n, 'business', 'businesses')} in ${all.city} are on record in total.</div>`}
            ${near.length ? html`<div class="stack" style="--gap:8px"><h3>Within 75 miles</h3><div class="chips">${near.map((n) => html`<button class="chip" data-city="${n.x.key}">${n.x.key} <span class="n">${n.x.v}</span></button>`)}</div></div>` : ''}
            <p class="tiny faint">Most businesses are mapped at a city reference point, not a storefront. Check the address on the seller’s site before you visit.</p>`;
        }
        if (st.state) {
          const inState = G.filter((g) => g.st === st.state), total = inState.reduce((s, g) => s + g.v, 0);
          return html`<div><button class="link small" data-back="all">&larr; All states</button></div>
            <div class="stack" style="--gap:6px"><h2>${stateName[st.state] || st.state}</h2><div class="muted">${plural(total, noun(st.type, 1), noun(st.type, 2))}${st.origin ? ' selling coffee from ' + B.O[st.origin].n : ''} in ${plural(inState.length, 'city', 'cities')}</div></div>
            ${inState.length ? html`<ul class="biz">${inState.map((g) => html`<li><button class="name" data-city="${g.key}">${g.city}</button><span class="small faint num">${g.v}</span><span class="sub">${g.cos.slice(0, 3).map((c) => c.n).join(' · ')}${g.v > 3 ? ' · and ' + (g.v - 3) + ' more' : ''}</span></li>`)}</ul>`
              : html`<div class="empty"><b>No ${filterText} on record here yet.</b>Try another origin, or show everyone.</div>`}`;
        }
        const states = new Map(); G.forEach((g) => states.set(g.st, (states.get(g.st) || 0) + g.v));
        const homeG = home && G.find((g) => g.key === home);
        const closest = home && B.cityMap.has(home) ? G.filter((g) => g.key !== home).map((g) => ({ g, d: B.miles(B.cityMap.get(home).pt, g.pt) })).sort(by((x) => x.d)).slice(0, 5) : [];
        const total = G.reduce((s, g) => s + g.v, 0);
        return html`
          <div class="stack" style="--gap:4px"><h2>${st.origin ? 'Where ' + B.O[st.origin].n + ' is sold' : 'Where to look'}</h2>
            <div class="muted">${plural(total, noun(st.type, 1), noun(st.type, 2))}${st.origin ? ' with coffee from ' + B.O[st.origin].n : ''} in ${plural(G.length, 'city', 'cities')}</div></div>
          ${home ? html`<div class="panel pad stack" style="--gap:8px"><div class="label">Your city</div>
            <div class="row between"><button class="link" data-city="${home}" style="font-size:17px">${home}</button><span class="muted small">${homeG ? plural(homeG.v, noun(st.type, 1), noun(st.type, 2)) : 'none under these filters'}</span></div>
            ${closest.length ? html`<div class="small muted">Closest others: ${closest.map((c, i) => html`${i ? ', ' : ''}<button class="link" data-city="${c.g.key}">${c.g.city}</button> (${int(Math.round(c.d))} mi)`)}</div>` : ''}</div>`
            : html`<p class="note">Open your city and choose “Make this my city” to get distances and a shortcut here.</p>`}
          <div class="stack" style="--gap:4px"><h3>Cities with the most</h3>
            <ul class="biz">${G.slice(0, 10).map((g) => html`<li><button class="name" data-city="${g.key}">${g.key}</button><span class="small faint num">${g.v}</span></li>`)}</ul></div>
          <div class="stack" style="--gap:8px"><h3>By state</h3><div class="chips">${Array.from(states.entries()).sort((a, b) => b[1] - a[1]).map((s) => html`<button class="chip" data-state="${s[0]}">${s[0]} <span class="n">${s[1]}</span></button>`)}</div></div>`;
      }
      function update(refocus) {
        G = groups(st);
        if (map) {
          map.set(G.map((g) => ({ key: g.key, pt: g.pt, v: g.v })), B.companies.filter((c) => c.pb === 'addr' && typeOk(c, st.type) && (!st.origin || c.om.has(st.origin))));
          map.select(st.city, st.state);
          if (refocus) { if (st.city) map.focusPoint(B.cityMap.get(st.city).pt, 7); else if (st.state) map.focusState(st.state); else map.reset(); }
        }
        side.innerHTML = String(sheet());
        $$('[data-type]', main).forEach((b) => b.setAttribute('aria-pressed', st.type === b.dataset.type));
      }
      const pickCity = (key) => { if (!B.cityMap.has(key)) return; st.city = key; st.state = B.cityMap.get(key).st; update(true); };
      if (B.geo.ok) {
        map = B.geo.USMap($('#pl-map', main), {
          onState: (id) => { st.state = st.state === id && !st.city ? null : id; st.city = null; update(true); },
          stateTip: (id) => { const n = G.filter((g) => g.st === id).reduce((s, g) => s + g.v, 0); return n ? plural(n, noun(st.type, 1), noun(st.type, 2)) : 'Nothing on record yet'; },
          onCity: pickCity,
          cityTip: (c) => plural(c.v, noun(st.type, 1), noun(st.type, 2)),
        });
        $('#pl-in', main).addEventListener('click', () => map.zoomBy(1.7));
        $('#pl-out', main).addEventListener('click', () => map.zoomBy(1 / 1.7));
        $('#pl-reset', main).addEventListener('click', () => { st.city = null; st.state = null; update(true); });
      }
      main.addEventListener('click', (e) => {
        const t = e.target.closest('[data-type],[data-city],[data-state],[data-back],#pl-home,#pl-clearf'); if (!t) return;
        const d = t.dataset;
        if (t.id === 'pl-home') { B.store.set('home', st.city); B.toast(st.city + ' is now your city'); return update(false); }
        if (t.id === 'pl-clearf') { st.type = ''; st.origin = ''; $('#pl-origin', main).value = ''; return update(false); }
        if ('type' in d) { st.type = d.type; return update(false); }
        if (d.city) return pickCity(d.city);
        if (d.state) { st.state = d.state; st.city = null; return update(true); }
        if (d.back) { if (d.back === 'all') st.state = null; st.city = null; return update(true); }
      });
      $('#pl-origin', main).addEventListener('change', (e) => { st.origin = e.target.value; update(false); });
      $('#pl-q', main).addEventListener('change', (e) => {
        const q = fold(e.target.value.trim()); if (!q) return;
        const hit = B.cities.find((c) => fold(c.key) === q) || B.cities.find((c) => fold(c.key).startsWith(q)) || B.cities.find((c) => fold(c.key).includes(q));
        if (hit) { e.target.value = ''; pickCity(hit.key); } else B.toast('No city by that name in the index yet');
      });
      update(!!(st.city || st.state));
    },
  };
})();
