/* Buna Index: trade world helpers and the Desk */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, money, perLb, by } = B;

  /* ---------- membership preview (no accounts in this build: the tier is a local preview switch) ---------- */
  const TIERS = ['free', 'pro', 'trade'];
  B.TIER_LABEL = { free: 'Free', pro: 'Pro', trade: 'Trade' };
  B.can = (need) => B.WEB || TIERS.indexOf(B.tier()) >= TIERS.indexOf(need);   // on the public site every tool is open until membership exists
  B.gate = function (need, what) {
    if (B.can(need)) return true;
    const el = B.modal(B.TIER_LABEL[need] + ' feature', html`<p>${what} is part of the proposed <b>${B.TIER_LABEL[need]}</b> membership. You are previewing the ${B.TIER_LABEL[B.tier()].toLowerCase()} tier.</p>
      <p class="muted small">Nothing is charged in this preview. Switch tiers to see how the portal behaves for a member.</p>
      <div class="row"><button class="btn primary" id="gate-yes">Preview as ${B.TIER_LABEL[need]}</button><a class="btn ghost" href="#membership" data-close>See membership</a></div>`);
    $('#gate-yes', el).addEventListener('click', () => { B.setTier(need); B.closeOverlay(); B.toast('Previewing the ' + B.TIER_LABEL[need] + ' tier'); B.render(true); });
    return false;
  };
  B.role = () => B.store.get('role', 'roaster');
  B.ROLES = [['roaster', 'I roast'], ['cafe', 'I run a café or shop'], ['importer', 'I import or export']];

  /* ---------- green coffee, warehouses, states ---------- */
  B.G = B.coffees.filter((c) => c.k === 'g' && c.listed);
  B.live = B.G.filter((c) => c.s !== 'sold');
  B.HUBS = { NJ: { n: 'New Jersey', hub: 'Port Newark and Elizabeth', pt: [-74.17, 40.68] }, CA: { n: 'California', hub: 'Bay Area', pt: [-122.12, 37.66] }, LA: { n: 'Louisiana', hub: 'New Orleans', pt: [-90.07, 29.95] },
    TX: { n: 'Texas', hub: 'Houston', pt: [-95.37, 29.76] }, FL: { n: 'Florida', hub: 'Jacksonville', pt: [-81.66, 30.33] }, WA: { n: 'Washington', hub: 'Seattle', pt: [-122.33, 47.61] }, OR: { n: 'Oregon', hub: 'Portland', pt: [-122.68, 45.52] } };
  const stName = {}, stPt = {};
  if (B.geo.ok) B.geo.usStates.forEach((f) => { stName[f.id] = f.properties.n; stPt[f.id] = f.c; });
  B.stName = (s) => stName[s] || s; B.stPt = (s) => stPt[s] || null;
  B.STATES = B.uniq(B.companies.map((c) => c.st).filter(Boolean)).sort((a, b) => (B.stName(a) < B.stName(b) ? -1 : 1));
  const isRoaster = (c) => c.t === 'roaster' || c.t === 'roaster_cafe';
  B.isRoaster = isRoaster;
  const nearestHub = (set, state) => { const p = stPt[state]; if (!p) return null; let best = null; set.forEach((w) => { const h = B.HUBS[w]; if (!h) return; const d = B.miles(p, h.pt); if (!best || d < best.d) best = { w, d }; }); return best; };

  /* ---------- partner matcher ---------- */
  function match(role, state, origin) {
    if (role === 'roaster') {
      const m = new Map();
      B.live.forEach((c) => {
        if (origin && c.o !== origin) return;
        let e = m.get(c.co.i); if (!e) m.set(c.co.i, (e = { co: c.co, lots: 0, spot: 0, pr: [], whs: new Set(), min: Infinity }));
        e.lots++; if (c.pos === 'spot') e.spot++; if (c.ppl != null && !c.d) e.pr.push(c.ppl); if (c.whs) e.whs.add(c.whs); if (c.mlb) e.min = Math.min(e.min, c.mlb);
      });
      return Array.from(m.values()).map((e) => Object.assign(e, { near: state ? nearestHub(e.whs, state) : null, s: B.summary(e.pr) })).sort((a, b) => b.lots - a.lots);
    }
    const rs = B.companies.filter((c) => isRoaster(c) && (!origin || c.om.has(origin)) && (origin || c.coffees.length));
    if (role === 'cafe') {
      const p = stPt[state];
      return rs.map((c) => ({ co: c, n: origin ? c.om.get(origin) : c.coffees.length, d: p && c.pt ? B.miles(p, c.pt) : null, same: state && c.st === state }))
        .sort((a, b) => (b.co.ws || 0) - (a.co.ws || 0) || (b.same ? 1 : 0) - (a.same ? 1 : 0) || (a.d == null ? 1e5 : a.d) - (b.d == null ? 1e5 : b.d) || b.n - a.n);
    }
    return rs.filter((c) => !state || c.st === state).map((c) => ({ co: c, n: origin ? c.om.get(origin) : c.coffees.length })).sort((a, b) => b.n - a.n);
  }
  function matchRows(role, state, origin) {
    const rows = match(role, state, origin), top = rows.slice(0, 6), on = origin ? B.O[origin].n : '';
    if (!rows.length) return html`<div class="empty"><b>No match on record yet.</b>${role === 'roaster' ? 'No importer in the index lists green coffee from ' + on + ' right now.' : 'Try a wider area or another origin.'}</div>`;
    const more = role === 'roaster'
      ? html`<button class="link" data-go="offers" data-params='${JSON.stringify({ reset: true, origin: origin || '' })}'>All ${int(rows.reduce((s, r) => s + r.lots, 0))} lots${on ? ' from ' + on : ''}</button>`
      : html`<button class="link" data-go="directory" data-params='${JSON.stringify({ reset: true, type: 'roaster', origin: origin || '', state: role === 'importer' ? state || '' : '', ws: role === 'cafe' })}'>All ${int(rows.length)} in the directory</button>`;
    return html`<ul class="biz">${top.map((r) => role === 'roaster'
      ? html`<li><button class="name" data-company="${r.co.i}">${r.co.n}</button>
          <span class="row nowrap" style="--gap:6px"><button class="btn ghost sm" data-go="offers" data-params='${JSON.stringify({ reset: true, origin: origin || '', importer: r.co.i })}'>${plural(r.lots, 'lot')}</button></span>
          <span class="sub">${r.spot ? r.spot + ' spot' : 'no spot lots'}${r.s ? ' · ' + (r.s.n > 1 ? money(r.s.min) + ' to ' + money(r.s.max) : money(r.s.med)) + ' per lb' : ' · price on request'}${r.min < Infinity ? ' · from ' + B.fmtLb(r.min) : ''}${r.whs.size ? ' · ships from ' + Array.from(r.whs).join(', ') : ''}${r.near ? html` · <b>${int(Math.round(r.near.d / 10) * 10)} mi</b> from ${B.stName(state)} (${r.near.w})` : ''}</span></li>`
      : html`<li><button class="name" data-company="${r.co.i}">${r.co.n}</button>
          <span class="row nowrap" style="--gap:6px">${r.co.ws ? html`<span class="tag cert">Wholesale</span>` : ''}<button class="btn ghost sm" data-intro="${r.co.i}">Draft an intro</button></span>
          <span class="sub">${r.co.city ? r.co.city + ', ' + r.co.st : 'Location not on record'}${r.d != null ? ' · ' + int(Math.round(r.d / 5) * 5) + ' mi from the middle of ' + B.stName(state) : ''} · ${plural(r.n, 'coffee')}${on ? ' from ' + on : ' recorded'}</span></li>`)}</ul>
      <div class="row between"><span class="small faint">${role === 'roaster' ? 'Sorted by lots on offer. Distance is to the nearest warehouse the importer ships from.' : role === 'cafe' ? 'Wholesale programmes first, then nearest.' : 'Sorted by how many coffees from the origin each roaster lists.'}</span>${more}</div>`;
  }

  /* ---------- desk ---------- */
  const monthAdd = (ym, k) => { const p = ym.split('-').map(Number); const t = p[0] * 12 + (p[1] - 1) + k; return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0'); };
  B.views.trade = {
    render(main, st) {
      const role = B.role(), live = B.live, now = B.TODAY.slice(0, 7);
      st.mo = st.mo || B.liveOrigins.find((o) => o.n_green > 0).id; st.ms = st.ms == null ? (B.home() && B.cityMap.has(B.home()) ? B.cityMap.get(B.home()).st : '') : st.ms;
      const imps = new Set(live.map((c) => c.co.i)), orgs = new Set(live.map((c) => c.o).filter((o) => o && o !== 'BLEND'));
      const med = B.summary(B.G.filter((c) => c.ppl != null && !c.d).map((c) => c.ppl));      // same base as the price index
      const pos = { spot: 0, afloat: 0, forward: 0 }; live.forEach((c) => { if (pos[c.pos] != null) pos[c.pos]++; if (c.pos2 && pos[c.pos2] != null && c.pos2 !== c.pos) pos[c.pos2]++; });
      const months = []; for (let k = -2; k <= 9; k++) months.push(monthAdd(now, k));
      const arr = months.map((ym) => ({ ym, n: live.filter((c) => c.arr === ym).length })), amax = Math.max(1, ...arr.map((a) => a.n));
      const wh = Object.keys(B.HUBS).map((k) => ({ k, n: live.filter((c) => c.whs === k).length })).filter((w) => w.n).sort(by((w) => -w.n));
      const og = B.liveOrigins.map((o) => ({ o, n: live.filter((c) => c.o === o.id).length, s: B.originSummary(o.id, 'g') })).filter((x) => x.n).sort(by((x) => -x.n)).slice(0, 10);
      const small = live.filter((c) => c.mlb && c.mlb <= 5), last = live.filter((c) => c.bags != null && c.bags <= 5 && c.s === 'avail').sort(by((c) => c.bags));
      const fresh = B.liveOrigins.filter((o) => o.arrive && o.arrive.length < 12 && o.arrive.includes(B.NOW_MONTH)).map((o) => ({ o, n: live.filter((c) => c.o === o.id && c.pos === 'spot').length })).filter((x) => x.n).sort(by((x) => -x.n));
      const itab = B.companies.filter((c) => c.nGreen > 0).map((c) => { const ls = c.coffees.filter((x) => x.k === 'g' && x.listed && x.s !== 'sold'); const s = B.summary(ls.filter((x) => x.ppl != null && !x.d).map((x) => x.ppl));
        return { c, n: ls.length, priced: ls.filter((x) => x.ppl != null).length, org: new Set(ls.map((x) => x.o).filter(Boolean)).size, spot: ls.filter((x) => x.pos === 'spot').length, fwd: ls.filter((x) => x.pos === 'afloat' || x.pos === 'forward').length, med: s && s.n >= 3 ? s.med : null }; }).filter((r) => r.n).sort(by((r) => -r.n));
      const quick = { roaster: [['offers', 'Search green offers', int(live.length) + ' lots across ' + imps.size + ' importers, with price, position and warehouse.'], ['prices', 'Benchmark a price', 'See where a quote sits against the range for its origin.'], ['tools', 'Cost a roast', 'Green price to cost per bag, with roast loss and margin.']],
        cafe: [['directory', 'Find a wholesale roaster', 'Roasters with a wholesale programme, by state and by origin.'], ['prices', 'What an origin costs', 'Retail and green medians side by side, per pound.'], ['guide', 'Read the buying guide', 'How wholesale works, what to ask and what the terms mean.']],
        importer: [['directory', 'See who roasts your origins', 'Roasters by state and by the origins already on their menus.'], ['prices', 'Check your prices against the field', 'Listed ranges by origin and by process.'], ['membership', 'Claim your catalog', 'Keep your offers current and receive sample requests.']] }[role];
      const posTotal = pos.spot + pos.afloat + pos.forward;
      main.innerHTML = String(html`<div class="wrap">
        <div class="row between top" style="--gap:16px 30px;margin-bottom:22px">
          <div class="stack" style="--gap:6px;max-width:70ch"><h1 style="font-size:clamp(28px,3.6vw,42px)">The trade desk</h1>
            <p class="lede">Green coffee on offer in the United States, the roasters and cafés who buy and sell it, and the prices in between. Read from public offer lists on ${B.fmtDate(B.TODAY)}.</p></div>
          <div class="field"><span>Set the desk up for</span><div class="seg" role="group" aria-label="Your role">${B.ROLES.map((r) => html`<button data-role="${r[0]}" aria-pressed="${role === r[0]}">${r[1]}</button>`)}</div></div>
        </div>
        <div class="stats" style="margin-bottom:26px">
          <div class="stat"><span class="figure num">${int(live.length)}</span><span class="cap">green lots on offer</span></div>
          <div class="stat"><span class="figure num">${imps.size}</span><span class="cap">importers with lots recorded</span></div>
          <div class="stat"><span class="figure num">${orgs.size}</span><span class="cap">origins on offer</span></div>
          <div class="stat"><span class="figure num">${med ? money(med.med) : '—'}</span><span class="cap">median list price per lb, ${med ? int(med.n) : 0} priced lots</span></div>
          <div class="stat"><span class="figure num">${int(pos.spot)}</span><span class="cap">spot lots in US warehouses</span></div>
          <div class="stat"><span class="figure num">${int(pos.afloat + pos.forward)}</span><span class="cap">afloat or forward</span></div>
        </div>

        <section class="panel pad stack" style="--gap:14px;margin-bottom:16px" id="tm">
          <div class="head"><h2>Find a partner</h2><span class="small muted">Importers, roasters and retailers, matched on what the index has recorded</span></div>
          <div class="row" style="--gap:8px 10px;font-size:16px">
            <span>${role === 'roaster' ? 'I roast in' : role === 'cafe' ? 'I run a café or shop in' : 'I import, and I want roasters in'}</span>
            <select class="select" id="tm-s" style="width:auto;min-width:150px" aria-label="State"><option value="">any state</option>${B.STATES.map((s) => html`<option value="${s}" ${st.ms === s ? raw('selected') : ''}>${B.stName(s)}</option>`)}</select>
            <span>${role === 'roaster' ? 'and I want green coffee from' : role === 'cafe' ? 'and I want a roaster who sells' : 'who already sell'}</span>
            <select class="select" id="tm-o" style="width:auto;min-width:150px" aria-label="Origin">${role === 'roaster' ? '' : html`<option value="">any origin</option>`}${B.liveOrigins.filter((o) => (role === 'roaster' ? live.some((c) => c.o === o.id) : true)).map((o) => html`<option value="${o.id}" ${st.mo === o.id ? raw('selected') : ''}>${o.n}</option>`)}</select>
          </div>
          <div id="tm-out"></div>
        </section>

        <div class="desk">
          <section class="panel pad stack w8" style="--gap:12px"><div class="head"><h3>Landing by month</h3><span class="small muted">lots with a stated arrival month; tap a bar to open them</span></div>
            <div class="cols" role="group" aria-label="Lots by arrival month">${arr.map((a) => { const m = +a.ym.slice(5), past = a.ym <= now; return html`<button class="col${past ? ' past' : ''}" ${a.n ? '' : raw('disabled')} data-go="offers" data-params='${JSON.stringify({ reset: true, arr: a.ym })}' aria-label="${B.fmtMonth(a.ym)}: ${a.n} lots ${past ? 'landed' : 'due'}">
              <span class="v num">${a.n || ''}</span><i style="height:${Math.max(a.n ? 3 : 1, (a.n / amax) * 120)}px"></i><span class="l${a.ym === now ? ' now' : ''}">${B.MON[m - 1]}${m === 1 || a === arr[0] ? html`<br>${a.ym.slice(0, 4)}` : ''}</span></button>`; })}</div>
            <div class="legend"><span><i style="background:var(--line2)"></i>Landed</span><span><i style="background:var(--accent)"></i>Due</span><span class="faint">${int(live.filter((c) => c.arr).length)} of ${int(live.length)} lots state an arrival month</span></div></section>
          <section class="panel pad stack w4" style="--gap:12px"><h3>Position</h3>
            <div class="stackbar" role="img" aria-label="${pos.spot} spot, ${pos.afloat} afloat, ${pos.forward} forward">${[['spot', 'var(--s-spot)'], ['afloat', 'var(--s-afloat)'], ['forward', 'var(--s-forward)']].map((p) => html`<i style="flex:${pos[p[0]]} 1 0;background:${p[1]}"></i>`)}</div>
            <ul class="stack" style="--gap:8px">${[['spot', 'var(--s-spot)', 'In a US warehouse, ready to release'], ['afloat', 'var(--s-afloat)', 'On the water'], ['forward', 'var(--s-forward)', 'Booked from a coming shipment']].map((p) => html`<li class="row between nowrap"><span class="row nowrap" style="--gap:8px"><i class="fdot" style="background:${p[1]}"></i><span><button class="link" data-go="offers" data-params='${JSON.stringify({ reset: true, pos: p[0] })}'>${B.POS[p[0]]}</button> <span class="small muted">${p[2]}</span></span></span><b class="num">${int(pos[p[0]])}</b></li>`)}</ul>
            <p class="small faint">${int(live.length - live.filter((c) => c.pos).length)} lots do not state a position.</p></section>

          <section class="panel pad stack" style="--gap:12px"><div class="head"><h3>Where the coffee sits</h3><span class="small muted">lots by warehouse state</span></div>
            <div class="bars">${wh.map((w) => html`<div class="b"><button data-go="offers" data-params='${JSON.stringify({ reset: true, whs: w.k })}' title="${B.HUBS[w.k].hub}">${B.HUBS[w.k].n}</button><i style="width:${(w.n / wh[0].n) * 100}%"></i><span class="num">${int(w.n)}</span></div>`)}</div>
            <p class="small faint">${int(live.filter((c) => !c.whs).length)} lots do not name a warehouse. Freight is quoted from the warehouse, so distance matters: see <a class="link" href="#tools">Tools</a>.</p></section>
          <section class="panel pad stack" style="--gap:12px"><div class="head"><h3>Origins on offer</h3><span class="small muted">lots, and median per lb where three or more are priced</span></div>
            <div class="bars">${og.map((x) => html`<div class="b"><button data-go="offers" data-params='${JSON.stringify({ reset: true, origin: x.o.id })}'>${x.o.n}</button><i style="width:${(x.n / og[0].n) * 100}%"></i><span class="num">${int(x.n)}${x.s && x.s.n >= 3 ? html` <span class="faint">· ${money(x.s.med)}</span>` : ''}</span></div>`)}</div></section>

          <section class="panel pad stack w4" style="--gap:10px"><h3>Small lots</h3><div class="row" style="--gap:12px;align-items:baseline"><span class="figure num">${int(small.length)}</span><span class="muted">lots sold in packs of 5 lb or less, from ${new Set(small.map((c) => c.co.i)).size} importers</span></div>
            <p class="small muted">For sample roasting, small-batch roasters and home roasters.</p><div style="margin-top:auto"><button class="btn ghost sm" data-go="offers" data-params='{"reset":true,"maxmin":5}'>Open small lots</button></div></section>
          <section class="panel pad stack w4" style="--gap:10px"><h3>Last bags</h3><div class="row" style="--gap:12px;align-items:baseline"><span class="figure num">${int(last.length)}</span><span class="muted">lots listed for sale with five bags or fewer</span></div>
            <ul class="small stack" style="--gap:4px">${last.slice(0, 3).map((c) => html`<li><button class="link" data-coffee="${c.id}" style="font-weight:600">${c.n.length > 44 ? c.n.slice(0, 43) + '…' : c.n}</button> <span class="faint num">${c.bags} left</span></li>`)}</ul>
            <div style="margin-top:auto"><button class="btn ghost sm" data-go="offers" data-params='{"reset":true,"maxbags":5,"sort":"bags","dir":1}'>Open last bags</button></div></section>
          <section class="panel pad stack w4" style="--gap:10px"><h3>Fresh crop, on the spot</h3><p class="small muted">Origins whose new harvest lands in ${B.MONTHS[B.NOW_MONTH - 1]}, with spot lots already listed.</p>
            <div class="chips">${fresh.length ? fresh.map((x) => html`<button class="chip" data-go="offers" data-params='${JSON.stringify({ reset: true, origin: x.o.id, pos: 'spot' })}'>${x.o.n} <span class="n">${x.n}</span></button>`) : html`<span class="muted small">None this month.</span>`}</div></section>

          <section class="panel pad stack w12" style="--gap:12px"><div class="head"><h3>Importers with offers recorded</h3><span class="small muted">${itab.length} of ${B.companies.filter((c) => c.t === 'importer').length} importers in the directory publish lists the index could read</span></div>
            <div class="table-wrap" style="border:0"><table class="t"><thead><tr><th>Importer</th><th class="r">Lots</th><th class="r">Priced</th><th class="r">Origins</th><th class="r">Spot</th><th class="r">Afloat or forward</th><th class="r">Median per lb</th><th></th></tr></thead>
              <tbody>${itab.map((r) => html`<tr><td class="lot"><button data-company="${r.c.i}">${r.c.n}</button><span class="sub">${r.c.city ? r.c.city + ', ' + r.c.st : ''}</span></td><td class="r num">${int(r.n)}</td><td class="r num">${r.priced || ''}</td><td class="r num">${r.org}</td><td class="r num">${r.spot || ''}</td><td class="r num">${r.fwd || ''}</td><td class="r num">${r.med != null ? money(r.med) : ''}</td>
                <td class="r"><button class="link small" data-go="offers" data-params='${JSON.stringify({ reset: true, importer: r.c.i })}'>Lots</button></td></tr>`)}</tbody></table></div>
            <p class="small faint">Counts are what each importer’s public pages showed. A short list here can mean a gated catalog, not a small importer.</p></section>
        </div>

        <nav class="trio" aria-label="Start here" style="margin-top:26px">${quick.map((q) => html`<a href="#${q[0]}"><h3>${q[1]}</h3><span class="muted">${q[2]}</span></a>`)}</nav>
      </div>`);

      const out = $('#tm-out', main);
      const run = () => { out.innerHTML = String(matchRows(role, st.ms, st.mo)); };
      $('#tm-s', main).addEventListener('change', (e) => { st.ms = e.target.value; run(); });
      $('#tm-o', main).addEventListener('change', (e) => { st.mo = e.target.value; run(); });
      if (role !== 'roaster' && st.mo && !B.O[st.mo]) st.mo = '';
      run();
      main.addEventListener('click', (e) => { const t = e.target.closest('[data-role]'); if (t) { B.store.set('role', t.dataset.role); B.go('trade', {}); } });
    },
  };
})();
