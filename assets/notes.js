/* Buna Index: Field notes (harvest calendar, brew lab, processing, the whole plant, the ceremony, glossary) */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, by, fold } = B;
  const TABS = [['calendar', 'Harvest calendar'], ['brew', 'Brew lab'], ['process', 'Processing'], ['plant', 'The whole plant'], ['ceremony', 'The coffee ceremony'], ['glossary', 'Glossary']];

  /* ---------------------------------------------------------------- harvest calendar */
  const stateOf = (o, m) => (o.harvest && o.harvest.includes(m) ? 'h' : o.fly && o.fly.includes(m) ? 'f' : o.arrive && o.arrive.length < 12 && o.arrive.includes(m) ? 'a' : '');
  function calendar(st) {
    const m = st.month || B.NOW_MONTH, sort = st.csort || 'now';
    const rows = B.origins.filter((o) => o.harvest && o.n_all > 0);
    const rank = { h: 0, f: 1, a: 2, '': 3 };
    if (sort === 'now') rows.sort((a, b) => rank[stateOf(a, m)] - rank[stateOf(b, m)] || b.n_listed - a.n_listed);
    else if (sort === 'az') rows.sort(by((o) => o.n));
    else rows.sort((a, b) => (a.ct < b.ct ? -1 : a.ct > b.ct ? 1 : b.n_listed - a.n_listed));
    const picking = rows.filter((o) => o.n_listed > 0 && (stateOf(o, m) === 'h' || stateOf(o, m) === 'f')), landing = rows.filter((o) => o.n_listed > 0 && o.arrive && o.arrive.length < 12 && o.arrive.includes(m));
    const cell = (o, i) => { const h = o.harvest.includes(i), f = o.fly && o.fly.includes(i), a = o.arrive && o.arrive.length < 12 && o.arrive.includes(i); return h && a ? 'ha' : h ? 'h' : f ? 'f' : a ? 'a' : ''; };
    return html`
      <div class="two">
        <div class="panel pad stack" style="--gap:10px"><h3>Picking in ${B.MONTHS[m - 1]}</h3>
          <div class="chips">${picking.length ? picking.map((o) => html`<button class="chip" data-origin="${o.id}">${o.n} <span class="n">${int(o.n_listed)}</span></button>`) : html`<span class="muted">No origin in the index is in its main harvest.</span>`}</div>
          <p class="small muted">Cherries are on the trees or on the drying beds. This crop reaches US roasters three to six months from now.</p></div>
        <div class="panel pad stack" style="--gap:10px"><h3>Fresh crop landing in ${B.MONTHS[m - 1]}</h3>
          <div class="chips">${landing.length ? landing.map((o) => html`<button class="chip" data-origin="${o.id}">${o.n} <span class="n">${int(o.n_listed)}</span></button>`) : html`<span class="muted">Nothing new is landing this month.</span>`}</div>
          <p class="small muted">New-harvest lots are arriving at US warehouses. Look for these on roasters’ menus over the next few weeks.</p></div>
      </div>
      <div class="row between" style="margin-top:22px">
        <label class="row nowrap" style="--gap:10px;flex:1 1 280px;max-width:460px"><b style="min-width:86px;font-family:var(--display)">${B.MONTHS[m - 1]}</b><input type="range" id="cal-m" min="1" max="12" step="1" value="${m}" aria-label="Month"></label>
        <div class="seg" role="group" aria-label="Sort the calendar"><button data-csort="now" aria-pressed="${sort === 'now'}">In season first</button><button data-csort="ct" aria-pressed="${sort === 'ct'}">By continent</button><button data-csort="az" aria-pressed="${sort === 'az'}">A to Z</button></div>
      </div>
      <div class="table-wrap" style="margin-top:12px;padding:8px 12px"><table class="cal"><thead><tr><th></th>${B.MON.map((x, i) => html`<th class="${i + 1 === m ? 'now' : ''}">${x}</th>`)}<th style="text-align:right">Listed</th></tr></thead>
        <tbody>${rows.map((o) => html`<tr><th scope="row"><button data-origin="${o.id}">${o.n}</button></th>${B.MON.map((x, i) => html`<td class="${i + 1 === m ? 'now' : ''}"><i class="${cell(o, i + 1)}"></i></td>`)}<td class="num small faint" style="text-align:right">${int(o.n_listed)}</td></tr>`)}</tbody></table></div>
      <div class="legend" style="margin-top:10px"><span><i style="background:var(--cherry)"></i>Main harvest</span><span><i style="background:var(--c2)"></i>Second harvest</span><span><i style="background:var(--leaf)"></i>Fresh crop arrives in the US</span></div>
      <p class="small muted" style="margin-top:8px;max-width:78ch">Typical windows from the field guide. Altitude and weather move them by weeks, and countries that straddle the equator pick somewhere almost all year.</p>`;
  }

  /* ---------------------------------------------------------------- brew lab */
  const METHODS = [
    { id: 'v60', n: 'Pour-over', sub: 'V60, Kalita, Origami', ratio: 16, lo: 14, hi: 18, water: 320, grind: 'Medium-fine, like table salt', temp: '93 to 96 °C (200 to 205 °F)', time: 'About 3 minutes', timed: true,
      steps: [[0, 'Rinse the filter, add {coffee} g of coffee and pour {bloom} g of water to wet it all. Wait.'], [40, 'Pour in slow circles up to {p60} g.'], [75, 'Pour the rest, to {water} g, finishing by 1:45.'], [105, 'Let it drain. It should finish close to 3:00.']],
      fix: 'Past 3:30 or bitter: grind coarser. Thin or sour: grind finer.' },
    { id: 'chemex', n: 'Chemex', sub: 'thick filter, clean cup', ratio: 16, lo: 14, hi: 18, water: 600, grind: 'Medium-coarse, like coarse sand', temp: '93 to 96 °C (200 to 205 °F)', time: '4 to 5 minutes', timed: true,
      steps: [[0, 'Rinse the filter well, add {coffee} g of coffee and pour {bloom} g of water. Wait.'], [45, 'Pour steadily up to {p60} g.'], [105, 'Pour the rest, to {water} g.'], [150, 'Let it drain. Lift the filter out at about 4:30.']],
      fix: 'The thick paper slows the flow; if it stalls, grind coarser.' },
    { id: 'press', n: 'French press', sub: 'full body, no paper', ratio: 15, lo: 12, hi: 17, water: 500, grind: 'Coarse, like sea salt', temp: 'Just off the boil', time: '4 minutes, then press', timed: true,
      steps: [[0, 'Add {coffee} g of coffee, pour all {water} g of water and rest the lid on top.'], [240, 'Stir the crust gently and skim off the foam.'], [270, 'Press slowly, stop before the bottom and pour it all out.']],
      fix: 'Leaving coffee in the press keeps it brewing. Decant what you do not drink.' },
    { id: 'aero', n: 'AeroPress', sub: 'one cup, forgiving', ratio: 14, lo: 11, hi: 16, water: 220, grind: 'Medium-fine', temp: '85 to 93 °C (185 to 200 °F)', time: '2 minutes', timed: true,
      steps: [[0, 'Add {coffee} g of coffee, pour {water} g of water and stir three times.'], [10, 'Fit the plunger to stop the drip. Wait.'], [90, 'Press gently for about 30 seconds and stop at the hiss.']],
      fix: 'Cooler water suits darker roasts; hotter water suits light ones.' },
    { id: 'espresso', n: 'Espresso', sub: 'dose in, weight out', ratio: 2, lo: 1.5, hi: 2.5, water: 18, dose: true, grind: 'Fine', temp: '92 to 94 °C (198 to 201 °F)', time: '25 to 32 seconds', timed: true,
      steps: [[0, 'Dose {coffee} g, level and tamp flat. Start the shot.'], [8, 'First drops should appear about now.'], [25, 'Stop at {water} g in the cup, between 25 and 32 seconds.']],
      fix: 'Fast and sour: grind finer. Slow and bitter: grind coarser. Change one thing at a time.' },
    { id: 'moka', n: 'Moka pot', sub: 'stovetop', ratio: 10, lo: 8, hi: 12, water: 150, grind: 'Medium-fine, coarser than espresso', temp: 'Start with hot water in the base', time: '4 to 5 minutes on medium heat',
      steps: [[0, 'Fill the base with {water} g of hot water, to just below the valve.'], [0, 'Fill the basket level with about {coffee} g of coffee. Do not tamp.'], [0, 'Heat on medium with the lid open.'], [0, 'When the stream turns pale and sputters, take it off and cool the base under the tap.']],
      fix: 'Bitterness usually means too much heat. Lower the flame.' },
    { id: 'cold', n: 'Cold brew', sub: 'concentrate', ratio: 8, lo: 5, hi: 12, water: 800, grind: 'Coarse', temp: 'Cold or room-temperature water', time: '12 to 18 hours',
      steps: [[0, 'Stir {coffee} g of coffee into {water} g of water in a jar.'], [0, 'Cover and leave 12 to 18 hours, in the fridge or on the counter.'], [0, 'Strain through paper or cloth.'], [0, 'Dilute about one to one with water or milk. Keeps a week in the fridge.']],
      fix: 'Chocolatey, low-acid coffees work best. Naturals come out like fruit punch.' },
    { id: 'jebena', n: 'Jebena', sub: 'the Ethiopian clay pot', ratio: 13, lo: 10, hi: 15, water: 500, grind: 'Fine to medium-fine, traditionally pounded by hand', temp: 'Heated in the pot', time: 'About 10 minutes',
      steps: [[0, 'Pour {water} g of water into the jebena and heat until it is close to boiling.'], [0, 'Add {coffee} g of ground coffee through the neck.'], [0, 'Return it to the heat until the coffee rises up the neck, then take it off.'], [0, 'Rest the pot at a tilt for three to five minutes so the grounds settle.'], [0, 'Pour in one thin, unbroken stream into small cups.']],
      fix: 'It is unfiltered and strong. The same grounds are brewed twice more; see the ceremony.' },
  ];
  const fmtT = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  let timer = { on: false, t0: 0, acc: 0, iv: 0 };
  const elapsed = () => timer.acc + (timer.on ? (Date.now() - timer.t0) / 1000 : 0);
  function brewCalc(M, st) {
    const ratio = st.ratio || M.ratio, amt = st.amt || M.water;
    const coffee = M.dose ? amt : amt / ratio, water = M.dose ? amt * ratio : amt;
    const cup = M.dose ? water : Math.max(0, water - coffee * 2);
    return { ratio, amt, coffee, water, cup };
  }
  const fill = (t, c) => t.replace('{coffee}', c.coffee.toFixed(c.coffee < 30 ? 1 : 0).replace(/\.0$/, '')).replace('{water}', Math.round(c.water)).replace('{bloom}', Math.round(c.coffee * 3)).replace('{p60}', Math.round(c.water * 0.6));
  function brew(st) {
    const M = METHODS.find((x) => x.id === st.method) || METHODS[0], c = brewCalc(M, st);
    const t = elapsed();
    let cur = -1; if (M.timed) M.steps.forEach((s, i) => { if (t >= s[0]) cur = i; });
    const range = M.dose ? [14, 22, 0.5] : M.id === 'aero' ? [150, 280, 10] : M.id === 'moka' ? [60, 450, 10] : [150, 1200, 10];
    return html`
      <div class="chips" role="group" aria-label="Brew method">${METHODS.map((x) => html`<button class="chip" data-method="${x.id}" aria-pressed="${x.id === M.id}">${x.n}</button>`)}</div>
      <div class="two" style="margin-top:18px">
        <div class="stack" style="--gap:16px">
          <div class="stack" style="--gap:4px"><h2>${M.n}</h2><span class="muted">${M.sub}</span></div>
          <label class="field"><span>${M.dose ? 'Coffee in the basket' : 'Water'}: <b class="num" id="bw-amt-out">${M.dose ? c.amt + ' g' : Math.round(c.amt) + ' g (' + (c.amt / 29.57).toFixed(1) + ' fl oz)'}</b></span>
            <input type="range" id="bw-amt" min="${range[0]}" max="${range[1]}" step="${range[2]}" value="${c.amt}"></label>
          <label class="field"><span>Strength: <b class="num" id="bw-ratio-out">1 to ${c.ratio}</b> <span class="faint" style="font-weight:500">${M.dose ? '(coffee to espresso)' : '(coffee to water)'}</span></span>
            <input type="range" id="bw-ratio" min="${M.lo}" max="${M.hi}" step="0.5" value="${c.ratio}" style="direction:rtl"></label>
          <div class="out" id="bw-out">
            <div class="stat"><span class="figure num">${c.coffee.toFixed(1).replace(/\.0$/, '')} g</span><span class="cap">coffee, about ${Math.max(1, Math.round(c.coffee / 5.3))} level tablespoons</span></div>
            <div class="stat"><span class="figure num">${Math.round(c.water)} g</span><span class="cap">${M.dose ? 'espresso in the cup' : 'water'}</span></div>
            ${M.dose ? '' : html`<div class="stat"><span class="figure num">${Math.round(c.cup)} g</span><span class="cap">in the cup, about ${(c.cup / 29.57).toFixed(1)} fl oz</span></div>`}
          </div>
          <dl class="kv"><dt>Grind</dt><dd>${M.grind}</dd><dt>Water</dt><dd>${M.temp}</dd><dt>Time</dt><dd>${M.time}</dd></dl>
          <p class="note">${M.fix}</p>
        </div>
        <div class="stack" style="--gap:14px">
          <div class="head"><h3>Steps</h3>${M.timed ? html`<div class="row" style="--gap:8px"><output class="figure num" id="bw-clock" style="font-size:26px">${fmtT(t)}</output>
            <button class="btn ${timer.on ? 'ghost' : 'primary'} sm" id="bw-go">${timer.on ? 'Pause' : t ? 'Resume' : 'Start timer'}</button>${t ? html`<button class="btn ghost sm" id="bw-reset">Reset</button>` : ''}</div>` : ''}</div>
          <ol class="steps" id="bw-steps">${M.steps.map((s, i) => html`<li class="${i === cur && t ? 'cur' : ''}"><div>${M.timed ? html`<b class="num small" style="color:var(--ink3)">${fmtT(s[0])}</b> ` : ''}${fill(s[1], c)}</div></li>`)}</ol>
        </div>
      </div>
      <hr class="rule" style="margin:26px 0 20px">
      <div class="three">
        <div class="stack" style="--gap:6px"><h3>Buy by roast date</h3><p class="muted">Most coffee is at its best from about one to four weeks after roasting. A bag with no roast date gives you nothing to go on.</p></div>
        <div class="stack" style="--gap:6px"><h3>Grind just before brewing</h3><p class="muted">Ground coffee goes flat within the hour. A burr grinder does more for the cup than any other piece of kit.</p></div>
        <div class="stack" style="--gap:6px"><h3>Keep it sealed, cool and dark</h3><p class="muted">The cupboard beats the fridge. For longer than a month, freeze sealed portions and grind them straight from frozen.</p></div>
      </div>`;
  }

  /* ---------------------------------------------------------------- processing */
  const LAYERS = [
    ['skin', 'Skin', 'Red, yellow or orange when ripe. Dried together with the pulp it becomes cascara.'],
    ['pulp', 'Pulp', 'A thin layer of sweet fruit. A pulper strips it off for washed and honey coffees; naturals keep it on until the cherry is dry.'],
    ['mucilage', 'Mucilage', 'A sticky, sugary coat on the parchment. Fermented and rinsed away in washed coffees, left to dry on in honey lots, which is where that name comes from.'],
    ['parchment', 'Parchment', 'A papery hull. Coffee rests in parchment after drying and is hulled shortly before export.'],
    ['silverskin', 'Silverskin', 'A fine membrane on the seed. It comes off in the roaster as chaff.'],
    ['seed', 'Seed', 'The coffee bean. Two grow in each cherry, flat sides together. When only one develops it is round, and is sold as peaberry.'],
  ];
  const PROCS = [
    ['Washed', 'Cherries are pulped within hours of picking, fermented in tanks for 12 to 72 hours to loosen the mucilage, rinsed clean and dried in parchment.', 'Clear acidity, floral and citrus notes. The origin shows through.'],
    ['Natural', 'Whole cherries dry on raised beds or patios for two to four weeks, turned often. The dried fruit is hulled off at the end.', 'Berry and dried fruit, heavier body, wine-like when pushed.'],
    ['Honey', 'Pulped, then dried with some or all of the mucilage still on. Yellow, red and black honey describe how much stays and how slowly it dries.', 'Round and sweet, caramel and stone fruit. Sits between washed and natural.'],
    ['Anaerobic & experimental', 'Fermented in sealed tanks without oxygen, sometimes as whole cherry, sometimes with added yeast or fruit.', 'Tropical fruit, candy, wine, spice. Loud, and divisive.'],
    ['Wet-hulled', 'Giling basah, the Sumatran method. The parchment is hulled while the coffee is still damp and the bare seed finishes drying.', 'Low acidity, heavy body, cedar, spice and earth.'],
    ['Monsooned', 'Green coffee from India’s Malabar coast is laid out in open warehouses through the monsoon. The beans swell and turn pale.', 'Very low acidity, musty-sweet and heavy. A classic in espresso blends.'],
  ];
  const nProc = {}; let nDecaf = 0;
  B.coffees.forEach((c) => { if (c.p) nProc[c.p] = (nProc[c.p] || 0) + 1; if (c.d) nDecaf++; });
  function cherry(sel) {
    const L = (id, inner) => html`<g class="layer${sel === id ? ' on' : ''}" data-layer="${id}">${inner}</g>`;
    const seed = (flip) => {
      const tf = (s) => `translate(${flip ? 219 : 101} 150) scale(${flip ? -s : s} ${s}) translate(-101 -150)`;
      const d = 'M150,62 C92,62 52,104 52,150 C52,196 92,238 150,238 Z';
      return [html`<path d="${d}" transform="${tf(1)}" fill="#E0A63A"/>`, html`<path d="${d}" transform="${tf(0.9)}" fill="#EFE2BF"/>`, html`<path d="${d}" transform="${tf(0.8)}" fill="#B9BFAE"/>`,
        html`<path d="${d}" transform="${tf(0.74)}" fill="#9FB087"/><path d="M134,100 C120,132 146,170 132,202" transform="${tf(0.74)}" fill="none" stroke="#72835F" stroke-width="4" stroke-linecap="round"/>`];
    };
    const a = seed(false), b = seed(true);
    return html`<svg class="cherry-svg${sel ? ' sel' : ''}" viewBox="0 0 320 300" role="img" aria-label="Cross-section of a coffee cherry: skin, pulp, mucilage, parchment, silverskin and two seeds">
      <path d="M160,30 C164,16 176,8 190,6" fill="none" stroke="#5B7A4A" stroke-width="5" stroke-linecap="round"/>
      ${L('skin', html`<ellipse cx="160" cy="154" rx="140" ry="126" fill="#B5152F"/>`)}
      ${L('pulp', html`<ellipse cx="160" cy="154" rx="128" ry="114" fill="#E8909E"/>`)}
      ${L('mucilage', html`${a[0]}${b[0]}`)}${L('parchment', html`${a[1]}${b[1]}`)}${L('silverskin', html`${a[2]}${b[2]}`)}${L('seed', html`${a[3]}${b[3]}`)}
    </svg>`;
  }
  function process(st) {
    const sel = st.layer || 'mucilage', info = LAYERS.find((l) => l[0] === sel);
    return html`
      <div class="two">
        <div class="stack" style="--gap:12px;align-items:flex-start"><h2>Inside the cherry</h2>
          <p class="muted" style="max-width:52ch">Coffee is the seed of a fruit. Processing is the business of getting the seed out and dry, and how it is done decides a good part of what you taste.</p>
          ${cherry(sel)}</div>
        <div class="stack" style="--gap:14px"><div class="chips" role="group" aria-label="Layers of the cherry, outside to inside">${LAYERS.map((l) => html`<button class="chip" data-layer="${l[0]}" aria-pressed="${l[0] === sel}">${l[1]}</button>`)}</div>
          <div class="panel pad stack" style="--gap:6px"><h3>${info[1]}</h3><p>${info[2]}</p></div>
          <p class="small faint">Tap a layer in the drawing or a name above.</p></div>
      </div>
      <h2 style="margin:30px 0 14px">How it is processed</h2>
      <div class="three">${PROCS.map((p) => html`<div class="panel pad stack" style="--gap:8px"><h3>${p[0]}</h3><p class="muted">${p[1]}</p><p><b>In the cup:</b> ${p[2]}</p>
        ${nProc[p[0]] ? html`<div style="margin-top:auto"><button class="link" data-go="finder" data-params='${JSON.stringify({ reset: true, process: [p[0]], kind: 'all' })}'>${plural(nProc[p[0]], 'coffee')} in the index</button></div>` : ''}</div>`)}
        <div class="panel pad stack" style="--gap:8px"><h3>Decaffeinated</h3><p class="muted">Caffeine is taken out of the green coffee before roasting. Swiss Water and Mountain Water use water and carbon filters. Sugarcane decaf uses ethyl acetate made from fermented cane. Others use methylene chloride or pressurised carbon dioxide.</p><p><b>In the cup:</b> A little less acidity and aroma, but a good decaf is hard to pick out blind.</p>
          <div style="margin-top:auto"><button class="link" data-go="finder" data-params='${JSON.stringify({ reset: true, decaf: 'only', kind: 'all' })}'>${plural(nDecaf, 'decaf')} in the index</button></div></div>
      </div>`;
  }

  /* ---------------------------------------------------------------- whole plant */
  function plant() {
    const casc = B.coffees.filter((c) => c.fm === 'cascara');
    return html`
      <div class="stack" style="--gap:8px;max-width:74ch"><h2>The bean is one part of the plant</h2>
        <p class="lede">For most of coffee’s history people have also brewed the fruit, the husk and the leaf. These drinks are older than roasted coffee and most of them never left the places that grow it.</p></div>
      <div class="three" style="margin-top:20px">
        <div class="panel pad stack" style="--gap:8px"><h3>Cascara, the cherry</h3><p class="muted">The dried skin and pulp of the coffee cherry, steeped like tea. It tastes of hibiscus, rosehip, raisin and tamarind, and carries a fraction of the caffeine of brewed coffee.</p>
          <p class="small"><b>Also called</b> hashara in Ethiopia, qishr in Yemen, where it is simmered with ginger, and sultana in Bolivia.</p></div>
        <div class="panel pad stack" style="--gap:8px"><h3>Coffee leaf</h3><p class="muted">Leaves are dried or toasted and brewed as a tisane. In Harar, in eastern Ethiopia, it is kuti, also written koti; in West Sumatra, kawa daun. Grassy-sweet and tea-like, with very little caffeine.</p></div>
        <div class="panel pad stack" style="--gap:8px"><h3>Blossom</h3><p class="muted">Coffee flowers for a few days after the first rains and smells of jasmine. Some farms dry the spent flowers for a delicate tea.</p></div>
        <div class="panel pad stack" style="--gap:8px"><h3>Husk and parchment</h3><p class="muted">Hulling leaves a mountain of dry husk. Mills burn it to run dryers, compost it, or grind it into a high-fibre flour.</p></div>
        <div class="panel pad stack" style="--gap:8px"><h3>Silverskin</h3><p class="muted">The chaff that comes off in the roaster. Roasters give it to gardeners; some bakers and brewers now use it too.</p></div>
        <div class="panel pad stack" style="--gap:8px"><h3>Why it matters</h3><p class="muted">The bean is a small share of the fruit a farmer grows. Every other part that finds a buyer is income from the same harvest and less waste at the mill.</p></div>
      </div>
      <div class="two" style="margin-top:26px">
        <div class="stack" style="--gap:10px"><h3>Brew cascara</h3>
          <ol class="steps"><li><div><b>Hot.</b> 20 g of cascara to 350 g of water just off the boil. Steep four to five minutes and strain.</div></li>
            <li><div><b>Cold.</b> 30 g to 500 g of cold water. Leave it in the fridge overnight and strain.</div></li>
            <li><div><b>Qishr style.</b> Simmer the hot brew for five minutes with sliced ginger and a little sugar or cinnamon.</div></li></ol></div>
        <div class="stack" style="--gap:10px"><div class="head"><h3>In the index</h3><span class="small faint">${plural(casc.length, 'cascara listing')}</span></div>
          ${casc.length ? html`<ul class="biz">${casc.map((c) => html`<li><button class="name" data-coffee="${c.id}">${c.n}</button><span>${B.pill(c)}</span><span class="sub">${B.sellerLine(c.co)}</span></li>`)}</ul>` : html`<p class="muted">No cascara listings yet.</p>`}
          <p class="small muted">Few US roasters list cherry or leaf products, and the index has only begun to record them. If you sell one, <a class="link" href="#membership">add your listing</a>.</p></div>
      </div>`;
  }

  /* ---------------------------------------------------------------- ceremony */
  const ROUNDS = [['Abol', 'አቦል', 'The first pour and the strongest. Guests are served in order of age, eldest first.', 1], ['Tona', 'ቶና', 'Water is added to the same grounds and the pot goes back on the coals. Lighter, and the talk is well under way.', 0.66], ['Baraka', 'በረካ', 'The third round is the blessing. It is the lightest cup, and custom says you stay for it.', 0.4]];
  function ceremony(st) {
    const r = st.round || 0, R = ROUNDS[r];
    return html`
      <div class="two">
        <div class="stack" style="--gap:14px">
          <div class="stack" style="--gap:8px"><h2>Buna tetu: come, drink coffee</h2>
            <p class="lede">In Ethiopia and Eritrea coffee is roasted, ground and brewed in front of the guests, start to finish. It takes an hour or more, and that is the point.</p></div>
          <ol class="steps">
            <li><div><b>The room is set.</b> Fresh grass is spread on the floor, incense is lit, and small handleless cups, sini, are laid out on a low tray called the rekebot.</div></li>
            <li><div><b>Green coffee is washed and roasted</b> in a flat pan over charcoal until it is dark and glossy. The host carries the smoking pan round so each guest can draw the aroma in.</div></li>
            <li><div><b>It is ground by hand</b> with a wooden mortar and a pestle, the mukecha and zenezena.</div></li>
            <li><div><b>It is brewed in the jebena</b>, <span lang="am">ጀበና</span>, a round clay pot with a narrow neck. The coffee comes to the boil, then the pot rests at a tilt so the grounds settle.</div></li>
            <li><div><b>It is poured from a height</b> in one unbroken stream across all the cups.</div></li>
            <li><div><b>It is served three times</b>, with popcorn, roasted barley or bread, and sugar. In some regions it is taken with salt, butter or a sprig of rue.</div></li>
          </ol>
        </div>
        <div class="stack" style="--gap:14px">
          <h3>The three rounds</h3>
          <div class="seg" role="group" aria-label="The three rounds" style="align-self:flex-start">${ROUNDS.map((x, i) => html`<button data-round="${i}" aria-pressed="${i === r}">${x[0]}</button>`)}</div>
          <div class="panel pad stack" style="--gap:10px">
            <div class="row" style="--gap:12px;align-items:baseline"><span class="figure">${R[0]}</span><span lang="am" style="font-size:22px;color:var(--ink2)">${R[1]}</span></div>
            <p>${R[2]}</p>
            <div class="stack" style="--gap:4px"><span class="small faint">Strength of the cup</span><div style="height:10px;border-radius:5px;background:var(--sunk);overflow:hidden"><div style="height:100%;width:${R[3] * 100}%;background:var(--cherry);border-radius:5px"></div></div></div>
          </div>
          <p class="muted">Buna, <span lang="am">ቡና</span>, is the Amharic word for coffee. The index takes its name from it.</p>
          <div class="row"><button class="btn ghost" data-go="notes" data-params='{"tab":"brew","method":"jebena","amt":null,"ratio":null}'>Brew with a jebena</button><button class="btn ghost" data-origin="ETH">Explore Ethiopia</button></div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- glossary */
  B.GLOSS = [
    ['Arabica', 'Coffea arabica, the species behind almost all specialty coffee. It grows at altitude and is sweeter and more acidic than robusta.'],
    ['Robusta', 'Coffea canephora. Hardier and higher in caffeine, with a heavier, more bitter cup. Carefully processed “fine robusta” is a small but growing niche.'],
    ['Single origin', 'Coffee from one country, and usually one region, cooperative or farm, rather than a blend.'],
    ['Microlot', 'A small lot kept separate through processing, often one farm, one variety or one day’s picking.'],
    ['Washing station', 'Where smallholders deliver cherry to be pulped, fermented and dried. In Ethiopia, Rwanda and Burundi, lots are usually named for the station.'],
    ['Cooperative', 'A farmer-owned group that processes and sells its members’ coffee together.'],
    ['Variety', 'A cultivated type of arabica such as Bourbon, Typica, Gesha, SL28 or Caturra. It shapes flavor the way a grape does in wine.'],
    ['Landrace, heirloom', 'Catch-all names for Ethiopia’s thousands of local arabica types, most of them never formally catalogued.'],
    ['Peaberry', 'A cherry that grew one round seed instead of two flat ones. Sorted out and sold on its own.'],
    ['G1, G2', 'Ethiopian grades, set by defect count. Grade 1 and Grade 2 are the specialty grades.'],
    ['AA, AB', 'Kenyan grades by bean size. AA is the largest. Size is not a quality score.'],
    ['SHB, SHG, HG', 'Strictly Hard Bean, Strictly High Grown and High Grown: Central American and Mexican grades for altitude. The cut-off varies by country and starts at roughly 1,200 m.'],
    ['Supremo, Excelso', 'Colombian grades by bean size. Supremo is screen 17 and larger; Excelso is screen 15 to 16.'],
    ['EP', 'European Preparation: hand-sorted to a tighter defect limit.'],
    ['Cupping score', 'A quality score out of 100 given by trained tasters. Eighty and above is specialty grade. Scores shown in the index are the seller’s own.'],
    ['Crop year', 'The harvest a coffee comes from. Stored well, green coffee keeps its character for about a year.'],
    ['Roast date', 'The day the coffee was roasted. Most taste best from about one to four weeks after.'],
    ['Swiss Water, Mountain Water', 'Decaffeination with water and carbon filters, with no added solvent.'],
    ['Sugarcane decaf (EA)', 'Decaffeination with ethyl acetate made from fermented sugarcane. Common in Colombia.'],
    ['Cascara', 'The dried skin and pulp of the coffee cherry, brewed as a fruit tea.'],
    ['Jebena', 'The clay pot used to brew coffee in Ethiopia and Eritrea.'],
    ['Green coffee', 'Unroasted coffee, as it is traded and shipped.'],
  ];
  function glossary(st) {
    const q = fold(st.gq || ''), rows = B.GLOSS.filter((g) => !q || fold(g[0] + ' ' + g[1]).includes(q)).sort(by((g) => fold(g[0])));
    return html`<label class="search" style="max-width:420px;display:block"><span class="sr">Search the glossary</span>${raw(B.I.search)}<input class="input" id="gl-q" type="search" placeholder="Search ${B.GLOSS.length} terms" value="${st.gq || ''}" autocomplete="off"></label>
      <dl class="gloss" id="gl-list">${glossRows(rows)}</dl>
      <p class="small muted" style="margin-top:18px">Buying green coffee? The <a class="link" href="#guide">buying guide</a> covers trade terms: spot, afloat, FOB, differentials and samples.</p>`;
  }
  const glossRows = (rows) => (rows.length ? html`${rows.map((g) => html`<dt>${g[0]}</dt><dd>${g[1]}</dd>`)}` : html`<dd class="muted" style="margin-top:14px">No term matches. Try a shorter word.</dd>`);

  /* ---------------------------------------------------------------- view */
  B.views.notes = {
    render(main, st) {
      st.tab = TABS.some((t) => t[0] === st.tab) ? st.tab : 'calendar';
      const body = { calendar, brew, process, plant, ceremony, glossary }[st.tab](st);
      main.innerHTML = String(html`<div class="wrap">
        <div class="stack" style="--gap:6px;margin-bottom:16px"><h1 style="font-size:clamp(28px,3.6vw,42px)">Field notes</h1>
          <p class="muted" style="max-width:70ch">What is in season, how to brew it, how it was processed, and what else the coffee plant gives.</p></div>
        <div class="subtabs" role="group" aria-label="Sections of the field notes">${TABS.map((t) => html`<button class="chip" data-tab="${t[0]}" aria-pressed="${t[0] === st.tab}">${t[1]}</button>`)}</div>
        <section id="nt-body">${body}</section></div>`);
      const rerender = () => B.go('notes', {});
      main.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab],[data-csort],[data-method],[data-layer],[data-round],#bw-go,#bw-reset'); if (!t) return;
        const d = t.dataset;
        if (d.tab) { st.tab = d.tab; window.scrollTo(0, 0); return rerender(); }
        if (d.csort) { st.csort = d.csort; return rerender(); }
        if (d.method) { stop(); timer.acc = 0; st.method = d.method; st.amt = null; st.ratio = null; return rerender(); }
        if (d.layer) { st.layer = d.layer; return rerender(); }
        if (d.round) { st.round = +d.round; return rerender(); }
        if (t.id === 'bw-go') { if (timer.on) stop(); else start(); return rerender(); }
        if (t.id === 'bw-reset') { stop(); timer.acc = 0; return rerender(); }
      });
      function stop() { if (timer.on) { timer.acc = elapsed(); timer.on = false; } clearInterval(timer.iv); timer.iv = 0; }
      function start() { timer.on = true; timer.t0 = Date.now(); tick(); }
      function tick() {
        clearInterval(timer.iv);
        timer.iv = setInterval(() => {
          const clock = $('#bw-clock', main); if (!clock) return;
          const t = elapsed(), M = METHODS.find((x) => x.id === st.method) || METHODS[0];
          clock.textContent = fmtT(t);
          let cur = -1; M.steps.forEach((s, i) => { if (t >= s[0]) cur = i; });
          $$('#bw-steps li', main).forEach((li, i) => li.classList.toggle('cur', i === cur));
        }, 250);
      }
      if (timer.on && st.tab === 'brew') tick();
      B.views.notes._stop = () => { clearInterval(timer.iv); timer.iv = 0; };
      const cm = $('#cal-m', main); if (cm) cm.addEventListener('change', (e) => { st.month = +e.target.value; rerender(); });
      const amt = $('#bw-amt', main), ratio = $('#bw-ratio', main);
      if (amt) amt.addEventListener('change', (e) => { st.amt = +e.target.value; rerender(); });
      if (ratio) ratio.addEventListener('change', (e) => { st.ratio = +e.target.value; rerender(); });
      const live = () => {     // update figures while dragging, without rebuilding the sliders
        const M = METHODS.find((x) => x.id === st.method) || METHODS[0], c = brewCalc(M, { amt: +amt.value, ratio: +ratio.value });
        $('#bw-amt-out', main).textContent = M.dose ? c.amt + ' g' : Math.round(c.amt) + ' g (' + (c.amt / 29.57).toFixed(1) + ' fl oz)';
        $('#bw-ratio-out', main).textContent = '1 to ' + c.ratio;
        const f = $$('#bw-out .figure', main); f[0].textContent = c.coffee.toFixed(1).replace(/\.0$/, '') + ' g'; f[1].textContent = Math.round(c.water) + ' g'; if (f[2]) f[2].textContent = Math.round(c.cup) + ' g';
      };
      if (amt) { amt.addEventListener('input', live); ratio.addEventListener('input', live); }
      const gq = $('#gl-q', main);
      if (gq) gq.addEventListener('input', () => { st.gq = gq.value; const q = fold(st.gq); $('#gl-list', main).innerHTML = String(glossRows(B.GLOSS.filter((g) => !q || fold(g[0] + ' ' + g[1]).includes(q)).sort(by((g) => fold(g[0]))))); });
    },
    leave() { if (B.views.notes._stop) B.views.notes._stop(); },
  };
})();
