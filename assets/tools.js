/* Buna Index: Tools (roast cost and margin, bag math, warehouse distance) */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, money, perLb, by } = B;
  const DEF = { freight: 0.3, loss: 15, prod: 2.5, oz: 12, pack: 0.85, whole: 13.5, retail: 19, target: 60, bags: 1, kg: 60, loss2: 15, oz2: 12 };
  const KGS = [[30, '30 kg box'], [45.4, '100 lb (Hawaii)'], [60, '60 kg (most origins)'], [69, '69 kg (Central America)'], [70, '70 kg (Colombia)']];
  const num = (v, d) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
  const pctf = (v) => (isFinite(v) ? Math.round(v * 100) + '%' : '—');

  function cost(st) {
    const comps = st.comps.filter((c) => num(c.p, null) != null && num(c.w, 0) > 0), wsum = comps.reduce((s, c) => s + num(c.w, 0), 0);
    const green = wsum ? comps.reduce((s, c) => s + num(c.p, 0) * num(c.w, 0), 0) / wsum : null;
    if (green == null) return null;
    const loss = Math.min(40, Math.max(0, num(st.loss, DEF.loss))) / 100, lbBag = num(st.oz, DEF.oz) / 16;
    const greenRoasted = (green + num(st.freight, 0)) / (1 - loss), perLbAll = greenRoasted + num(st.prod, 0), bag = perLbAll * lbBag + num(st.pack, 0);
    const whole = num(st.whole, null), retail = num(st.retail, null), target = Math.min(95, Math.max(0, num(st.target, DEF.target))) / 100;
    return { green, greenRoasted, perLbAll, bag, whole, retail, mW: whole ? (whole - bag) / whole : NaN, mR: retail ? (retail - bag) / retail : NaN, priceAt: bag / (1 - target), target, greenShare: (greenRoasted * lbBag) / bag };
  }

  B.views.tools = {
    render(main, st) {
      Object.keys(DEF).forEach((k) => { if (st[k] == null) st[k] = DEF[k]; });
      const short = Array.from(B.lists.short).map((id) => B.byId[id]).filter((c) => c && c.ppl != null);
      if (st.lot && B.byId[st.lot] && B.byId[st.lot].ppl != null) { st.comps = [{ p: B.byId[st.lot].ppl, w: 100, id: st.lot }]; st.lot = null; }
      if (!st.comps) st.comps = [{ p: 7.4, w: 100 }];
      st.ws = st.ws == null ? (B.home() && B.cityMap.has(B.home()) ? B.cityMap.get(B.home()).st : 'CO') : st.ws;
      const field = (k, label, step, unit) => html`<label class="field"><span>${label}</span><input class="input num" id="tl-${k}" data-k="${k}" type="number" min="0" step="${step}" inputmode="decimal" value="${st[k]}" aria-label="${label}${unit ? ', ' + unit : ''}"></label>`;
      main.innerHTML = String(html`<div class="wrap">
        <div class="stack" style="--gap:6px;margin-bottom:20px"><h1 style="font-size:clamp(28px,3.6vw,42px)">Tools</h1>
          <p class="muted" style="max-width:76ch">Working numbers for a roastery: what a green price becomes in the bag, how far a bag of green goes, and how far away the coffee is sitting.</p></div>

        <section class="panel pad stack" style="--gap:16px">
          <div class="head"><h2>Cost a roast</h2><span class="small muted">Change any number. Nothing here is saved or sent.</span></div>
          <div class="two">
            <div class="stack" style="--gap:14px">
              <div class="stack" style="--gap:8px"><div class="label">Green coffee${st.comps.length > 1 ? ', as a blend' : ''}</div>
                <div class="stack" style="--gap:8px" id="tl-comps">${st.comps.map((c, i) => html`<div class="row nowrap" style="--gap:8px;align-items:flex-end">
                  <label class="field" style="flex:1 1 110px"><span>${i ? 'Component ' + (i + 1) : 'Price'} per lb, $</span><input class="input num" data-comp="${i}" data-f="p" type="number" min="0" step="0.05" inputmode="decimal" value="${c.p}"></label>
                  ${st.comps.length > 1 ? html`<label class="field" style="flex:0 1 90px"><span>Share, %</span><input class="input num" data-comp="${i}" data-f="w" type="number" min="0" max="100" step="5" inputmode="decimal" value="${c.w}"></label>` : ''}
                  ${short.length ? html`<label class="field" style="flex:2 1 150px"><span>From your shortlist</span><select class="select" data-pick="${i}"><option value="">Choose a lot</option>${short.map((x) => html`<option value="${x.id}" ${c.id === x.id ? raw('selected') : ''}>${x.n.length > 38 ? x.n.slice(0, 37) + '…' : x.n} (${perLb(x.ppl)})</option>`)}</select></label>` : ''}
                  ${st.comps.length > 1 ? html`<button class="icon-btn" data-del="${i}" aria-label="Remove component ${i + 1}">${raw(B.I.x)}</button>` : ''}</div>`)}</div>
                <div class="row">${st.comps.length < 4 ? html`<button class="link small" id="tl-add">Add a blend component</button>` : ''}${short.length ? '' : html`<span class="small faint">Shortlist priced lots in <a class="link" href="#offers">Green offers</a> to pull their prices in here.</span>`}</div></div>
              <div class="calc">${field('freight', 'Freight and handling per lb, $', 0.05)}${field('loss', 'Roast loss, %', 0.5)}${field('prod', 'Roasting cost per roasted lb, $', 0.1)}</div>
              <div class="calc">${field('oz', 'Bag size, oz', 1)}${field('pack', 'Bag and label, $', 0.05)}${field('whole', 'Wholesale price per bag, $', 0.25)}${field('retail', 'Retail price per bag, $', 0.25)}${field('target', 'Margin you want, %', 1)}</div>
            </div>
            <div class="stack" style="--gap:12px"><div class="out" id="tl-out"></div><div id="tl-note"></div></div>
          </div>
        </section>

        <div class="two" style="margin-top:16px">
          <section class="panel pad stack" style="--gap:14px"><h2>Bag math</h2>
            <div class="calc">${field('bags', 'Bags of green', 1)}<label class="field"><span>Bag weight</span><select class="select" id="tl-kg" data-k="kg">${KGS.map((k) => html`<option value="${k[0]}" ${+st.kg === k[0] ? raw('selected') : ''}>${k[1]}</option>`)}</select></label>${field('loss2', 'Roast loss, %', 0.5)}${field('oz2', 'Retail bag, oz', 1)}</div>
            <div class="out" id="tl-bag"></div></section>
          <section class="panel pad stack" style="--gap:14px"><div class="head"><h2>How far is the coffee?</h2>
            <label class="row nowrap" style="--gap:8px"><span class="small muted">From</span><select class="select" id="tl-ws" style="width:auto" aria-label="Your state">${B.STATES.map((s) => html`<option value="${s}" ${st.ws === s ? raw('selected') : ''}>${B.stName(s)}</option>`)}</select></label></div>
            <div id="tl-wh"></div>
            <p class="small muted">Straight-line miles from the middle of your state to each warehouse hub. Green coffee ships by pallet on a freight truck, priced by distance and weight; ask the importer for a quote and whether you need a liftgate.</p></section>
        </div>
      </div>`);

      function draw() {
        const c = cost(st), out = $('#tl-out', main);
        out.innerHTML = String(!c ? html`<p class="muted">Enter a green price to begin.</p>` : html`
          <div class="stat"><span class="figure num">${money(c.bag)}</span><span class="cap">cost per ${st.oz} oz bag</span></div>
          <div class="stat"><span class="figure num">${money(c.perLbAll)}</span><span class="cap">cost per roasted lb, ${money(c.greenRoasted)} of it green</span></div>
          <div class="stat"><span class="figure num">${pctf(c.mW)}</span><span class="cap">margin at ${c.whole ? money(c.whole) : '—'} wholesale</span></div>
          <div class="stat"><span class="figure num">${pctf(c.mR)}</span><span class="cap">margin at ${c.retail ? money(c.retail) : '—'} retail</span></div>
          <div class="stat"><span class="figure num">${money(c.priceAt)}</span><span class="cap">price per bag for a ${Math.round(c.target * 100)}% margin</span></div>
          ${st.comps.length > 1 ? html`<div class="stat"><span class="figure num">${money(c.green)}</span><span class="cap">blended green price per lb</span></div>` : ''}`);
        $('#tl-note', main).innerHTML = String(c ? html`<p class="note">Green coffee is ${pctf(c.greenShare)} of the cost of this bag. ${c.mW < 0.25 && isFinite(c.mW) ? 'Wholesale margin is thin at that price.' : ''} Margin here is gross: it leaves out rent, sales, shipping to the customer and your own time.</p>` : '');
        const kg = num(st.kg, 60), bags = num(st.bags, 1), green = bags * kg * 2.20462, roasted = green * (1 - Math.min(40, num(st.loss2, 15)) / 100), n = Math.floor(roasted / (num(st.oz2, 12) / 16));
        $('#tl-bag', main).innerHTML = String(html`<div class="stat"><span class="figure num">${int(Math.round(green))} lb</span><span class="cap">green coffee</span></div><div class="stat"><span class="figure num">${int(Math.round(roasted))} lb</span><span class="cap">roasted</span></div><div class="stat"><span class="figure num">${int(n)}</span><span class="cap">bags of ${st.oz2} oz</span></div>`);
        const p = B.stPt(st.ws);
        const rows = Object.keys(B.HUBS).map((k) => ({ k, h: B.HUBS[k], d: p ? B.miles(p, B.HUBS[k].pt) : null, n: B.live.filter((c) => c.whs === k).length, spot: B.live.filter((c) => c.whs === k && c.pos === 'spot').length })).sort(by((r) => (r.d == null ? 0 : r.d)));
        $('#tl-wh', main).innerHTML = String(html`<div class="table-wrap" style="border:0"><table class="t"><thead><tr><th>Warehouse hub</th><th class="r">Miles</th><th class="r">Lots there</th><th class="r">Spot</th><th></th></tr></thead><tbody>${rows.map((r) => html`<tr><td><b>${r.h.hub}</b><span class="sub">${r.h.n}</span></td><td class="r num">${r.d == null ? '—' : int(Math.round(r.d / 10) * 10)}</td><td class="r num">${int(r.n)}</td><td class="r num">${int(r.spot)}</td><td class="r"><button class="link small" data-go="offers" data-params='${JSON.stringify({ reset: true, whs: r.k })}'>Lots</button></td></tr>`)}</tbody></table></div>`);
      }
      main.addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset.k) { st[t.dataset.k] = t.value; return draw(); }
        if (t.dataset.comp != null && t.dataset.f) { st.comps[+t.dataset.comp][t.dataset.f] = t.value; if (t.dataset.f === 'p') st.comps[+t.dataset.comp].id = null; return draw(); }
      });
      main.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset.pick != null) { const c = B.byId[t.value]; if (c) { st.comps[+t.dataset.pick].p = c.ppl; st.comps[+t.dataset.pick].id = c.id; B.go('tools', {}); } return; }
        if (t.id === 'tl-ws') { st.ws = t.value; return draw(); }
        if (t.dataset.k === 'kg') { st.kg = t.value; return draw(); }
      });
      main.addEventListener('click', (e) => {
        const t = e.target.closest('#tl-add,[data-del]'); if (!t) return;
        if (t.id === 'tl-add') { if (st.comps.length === 1) st.comps[0].w = 50; st.comps.push({ p: '', w: st.comps.length === 1 ? 50 : 25 }); return B.go('tools', {}); }
        if (t.dataset.del != null) { st.comps.splice(+t.dataset.del, 1); if (st.comps.length === 1) st.comps[0].w = 100; return B.go('tools', {}); }
      });
      draw();
    },
  };
})();
