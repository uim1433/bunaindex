/* Buna Index: Buying guide (how the green trade works, for roasters, cafés and importers) */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, by, fold } = B;
  const TRADE_GLOSS = [
    ['Spot', 'Coffee already in a warehouse in the buyer’s country, ready to release.'],
    ['Afloat', 'Coffee on a ship, sold with an estimated arrival.'],
    ['Forward', 'Coffee contracted now from a shipment that has not left origin.'],
    ['FOB', 'Free on board: the price at the port of origin with the coffee loaded. Ocean freight, import costs and the importer’s margin are not in it.'],
    ['EXW, ex-warehouse', 'The price at the importer’s warehouse. Freight from there to the buyer is extra. Most US offer lists are quoted this way.'],
    ['Landed', 'What the coffee has cost by the time it reaches a US warehouse: FOB plus freight, insurance, duties and fees.'],
    ['C price', 'The ICE Coffee “C” futures price for washed arabica, in US cents per pound. The reference most contracts are priced against.'],
    ['Differential', 'A premium or discount to the C price, in cents per pound. A contract at “plus 80” costs the C price plus 80 cents.'],
    ['Outright', 'A fixed price per pound with no link to the futures market. Usual for small lots and microlots.'],
    ['Price to be fixed', 'A contract that sets the differential now and lets one side fix the C price later.'],
    ['Offer sample', 'A sample of a lot on an importer’s list, sent so a roaster can cup it before buying.'],
    ['Pre-shipment sample (PSS)', 'A sample drawn from the actual lot at origin before it ships.'],
    ['SAS, NANS', 'Subject to approval of sample; no approval, no sale. The buyer can walk away if the sample does not match.'],
    ['Arrival sample', 'A sample drawn when the coffee lands, to confirm it matches what was approved.'],
    ['GrainPro', 'A brand of sealed liner used inside a jute bag. Often used to mean any hermetic liner.'],
    ['Carry', 'Storage and finance charges on coffee a buyer has booked but not yet taken.'],
    ['Release', 'The instruction to the warehouse to hand bags over to a carrier.'],
    ['LTL', 'Less-than-truckload freight: pallets sharing a truck. How most roasters receive green coffee.'],
    ['Liftgate', 'A platform on the truck that lowers a pallet to the ground. Needed where there is no loading dock.'],
    ['Screen size', 'Bean size, measured in 64ths of an inch. Screen 17 and 18 are large.'],
    ['Defect count', 'The number of faulty beans in a 350 g sample. Specialty grade allows no primary defects and no more than five full defects in all.'],
    ['Moisture and water activity', 'Green coffee should hold roughly 10 to 12 percent moisture, with water activity under 0.70. Outside that it fades or spoils faster.'],
    ['Past crop', 'Coffee from the previous harvest. It is cheaper and usually flatter in the cup.'],
    ['Q grader', 'A taster licensed to score arabica on the 100-point scale.'],
    ['Private label', 'Coffee roasted by one business and sold under another’s brand.'],
  ];
  const CAFE_Q = ['A wholesale price list and the minimum order', 'Delivery or shipping days, and what they cost', 'How many days pass between roasting and delivery', 'Training, equipment and repair support', 'Whether they supply anyone else on your street', 'A house blend or private label under your name', 'Payment terms once you are established', 'Samples of two or three coffees before you commit'];
  const IMP_Q = ['Say what you roast, how much a month, and on what machine', 'Name the lots you want, with their reference numbers', 'Ask for three to six samples, not the whole list', 'Give the delivery address and whether you have a dock', 'Ask how a new account pays, and what the minimum is'];
  const SECS = [['chain', 'How coffee reaches a roaster'], ['offer', 'Reading an offer list'], ['samples', 'Samples'], ['price', 'How green coffee is priced'], ['terms', 'Accounts and minimums'], ['freight', 'Release and freight'], ['storage', 'Storing green coffee'], ['cafe', 'For cafés and shops'], ['importer', 'For importers'], ['glossary', 'Glossary']];

  const glossRows = (rows) => (rows.length ? html`${rows.map((g) => html`<dt>${g[0]}</dt><dd>${g[1]}</dd>`)}` : html`<dd class="muted" style="margin-top:14px">No term matches. Try a shorter word.</dd>`);
  const checklist = (id, items, done) => html`<ul class="stack" style="--gap:8px">${items.map((t, i) => html`<li><label class="check" style="align-items:flex-start"><input type="checkbox" data-chk="${id}:${i}" ${done[id + ':' + i] ? raw('checked') : ''} style="margin-top:3px"> <span>${t}</span></label></li>`)}</ul>`;

  B.views.guide = {
    render(main, st) {
      const live = B.live, share = (f) => Math.round((live.filter(f).length / live.length) * 100);
      const done = B.store.get('chk', {}), all = TRADE_GLOSS.concat(B.GLOSS || []).sort(by((g) => fold(g[0])));
      const role = B.role(), order = role === 'cafe' ? ['cafe'].concat(SECS.map((s) => s[0]).filter((s) => s !== 'cafe')) : role === 'importer' ? ['importer'].concat(SECS.map((s) => s[0]).filter((s) => s !== 'importer')) : SECS.map((s) => s[0]);
      const T = Object.fromEntries(SECS);
      const body = {
        chain: html`<p>Coffee changes hands five or six times between the tree and the cup. Each step adds cost, and each one is a place where quality is kept or lost.</p>
          <ol class="steps"><li><div><b>Farm.</b> Ripe cherries are picked by hand, usually over several passes.</div></li>
            <li><div><b>Washing station or mill.</b> The fruit comes off and the coffee is dried, then rested in parchment. A dry mill hulls, sorts and bags it.</div></li>
            <li><div><b>Exporter.</b> Buys or gathers lots, and handles grading, paperwork and the container.</div></li>
            <li><div><b>Importer.</b> Pays for the shipment, clears it, stores it in a US warehouse and sells it by the bag. This is who a roaster buys from.</div></li>
            <li><div><b>Roaster.</b> Buys green coffee, roasts it, and sells to drinkers, cafés and shops.</div></li>
            <li><div><b>Café or shop.</b> Buys roasted coffee wholesale and serves or sells it.</div></li></ol>
          <p class="muted">The index records the last three steps and ties them back to the first: which regions, through which importers, to which roasters, in which cities.</p>`,
        offer: html`<dl class="gloss" style="margin-top:-12px">
            <dt>Position</dt><dd>Spot coffee is in a US warehouse and can ship this week. Afloat is on the water with an arrival estimate. Forward is booked from a shipment that has not sailed: you commit now for coffee later.</dd>
            <dt>Price basis</dt><dd>Most US lists quote ex-warehouse: the price at the importer’s warehouse, with freight to you on top. FOB is the price at the port of origin, which is why FOB figures look low next to an offer list.</dd>
            <dt>Bag size</dt><dd>60 kg is standard for Brazil, East Africa and Asia, 69 kg for much of Central America, 70 kg for Colombia. Microlots often come in 30 kg boxes. Lists usually show price per pound and stock in bags.</dd>
            <dt>Grade and preparation</dt><dd>Each origin grades its own way: by defect count in Ethiopia, by bean size in Kenya and Colombia, by altitude in Central America. EP means hand-sorted to a tighter standard.</dd>
            <dt>Crop year</dt><dd>Ask which harvest it is. Past-crop coffee is cheaper for a reason.</dd>
            <dt>Packaging</dt><dd>A sealed liner inside the jute keeps coffee fresh for months longer than jute alone.</dd></dl>
          <div><a class="btn ghost" href="#offers">See ${int(live.length)} live lots in Green offers</a></div>`,
        samples: html`<p>Ask for a sample before you buy anything by the bag. Importers expect it.</p>
          <dl class="gloss" style="margin-top:-6px"><dt>Offer sample</dt><dd>A sample of a lot on the list. Roast it light, cup it within a day or two, and taste lots side by side.</dd>
            <dt>Pre-shipment sample</dt><dd>Drawn from the actual lot at origin before it ships. A forward contract is usually subject to your approval of this sample.</dd>
            <dt>Arrival sample</dt><dd>Drawn when the coffee lands, to confirm it matches what you approved.</dd></dl>
          <div class="panel pad stack" style="--gap:10px"><h4>Before you write to an importer</h4>${checklist('imp', IMP_Q, done)}
            <p class="small muted">Shortlist lots in Green offers and the index writes the request for you, one per importer.</p></div>`,
        price: html`<p><b>Outright or differential.</b> Small lots are sold at an outright price per pound. Larger contracts are often written as a differential: so many cents over or under the “C” futures price, fixed on a day the buyer chooses.</p>
          <p><b>Price breaks.</b> Many importers publish tiers. The per-pound price falls as you move from a 1 lb sample pack to a box and then to a full bag.</p>
          <p><b>What moves it.</b> Cup quality, scarcity, certification, processing, and the futures market underneath everything.</p>
          <div><a class="btn ghost" href="#prices">Open the price index</a></div>`,
        terms: html`<p><b>Opening an account</b> takes a short application and, in some states, a resale certificate. Expect to prepay or pay by card for your first orders.</p>
          <p><b>Credit.</b> After a credit check many importers offer 30-day terms.</p>
          <p><b>Minimums.</b> One bag is the usual minimum on spot coffee. Some importers split bags or sell boxes: ${int(live.filter((c) => c.mlb && c.mlb <= 70).length)} lots in the index are sold in packs of half a bag or less.</p>
          <p><b>Booked coffee.</b> If you contract coffee and leave it in the importer’s warehouse, storage and finance charges begin after an agreed free period.</p>`,
        freight: html`<p><b>Release.</b> When you are ready, you ask the importer to release your bags. The warehouse prepares them, usually for a small fee.</p>
          <p><b>Freight.</b> Bags travel on pallets by LTL freight. The quote depends on weight, distance and what the driver has to do at your door: a liftgate if you have no dock, a delivery appointment, a residential address.</p>
          <p><b>On delivery.</b> Count the bags and write any damage on the delivery receipt before you sign it.</p>
          <div><a class="btn ghost" href="#tools">Check the distance to each warehouse</a></div>`,
        storage: html`<p>Keep green coffee cool, dry and steady: off the floor, out of the sun, away from anything that smells.</p>
          <p>It should arrive at roughly 10 to 12 percent moisture, with water activity under 0.70. Plan to roast it within about a year of harvest. A sealed liner stretches that; a hot stockroom shortens it.</p>`,
        cafe: html`<p>A café’s coffee is only as good as its roaster’s consistency and support. Price per pound matters less than whether the coffee arrives fresh, on time, and with someone to call when the grinder drifts.</p>
          <div class="panel pad stack" style="--gap:10px"><h4>Ask a roaster for</h4>${checklist('cafe', CAFE_Q, done)}</div>
          <div class="row"><button class="btn ghost" data-go="directory" data-params='{"reset":true,"type":"roaster","ws":true}'>Roasters with a wholesale programme</button><a class="btn ghost" href="#trade">Match by state and origin</a></div>`,
        importer: html`<p>Roasters compare what they can see. Across the ${int(live.length)} lots on offer in the index:</p>
          <div class="stats"><div class="stat"><span class="figure num">${share((c) => c.ppl != null)}%</span><span class="cap">show a price per pound</span></div><div class="stat"><span class="figure num">${share((c) => c.pos)}%</span><span class="cap">state a position</span></div>
            <div class="stat"><span class="figure num">${share((c) => c.wh || c.whs)}%</span><span class="cap">name a warehouse</span></div><div class="stat"><span class="figure num">${share((c) => c.bags != null)}%</span><span class="cap">show bags in stock</span></div>
            <div class="stat"><span class="figure num">${share((c) => c.tn || c.sc)}%</span><span class="cap">carry a score or tasting notes</span></div></div>
          <p>A lot with a price, a position and a warehouse can be shortlisted, costed and requested in a minute. A lot with only a name sends the roaster to a contact form.</p>
          <div><a class="btn ghost" href="#membership">Claim your catalog and keep it current</a></div>`,
        glossary: html`<label class="search" style="max-width:420px;display:block"><span class="sr">Search the glossary</span>${raw(B.I.search)}<input class="input" id="gd-q" type="search" placeholder="Search ${all.length} terms" autocomplete="off"></label><dl class="gloss" id="gd-list">${glossRows(all)}</dl>`,
      };
      main.innerHTML = String(html`<div class="wrap">
        <div class="stack" style="--gap:6px;margin-bottom:18px"><h1 style="font-size:clamp(28px,3.6vw,42px)">Buying guide</h1>
          <p class="lede">How green coffee is offered, sampled, priced and shipped in the United States, and what to ask before you buy.</p></div>
        <div class="guide">
          <nav class="toc" aria-label="Sections of the guide">${order.map((id) => html`<button data-sec="${id}">${T[id]}</button>`)}</nav>
          <div class="stack prose" style="--gap:34px">${order.map((id) => html`<section id="gd-${id}" class="stack" style="--gap:12px;scroll-margin-top:calc(var(--bar) + 20px)"><h2>${T[id]}</h2>${body[id]}</section>`)}</div>
        </div></div>`);
      main.addEventListener('click', (e) => { const t = e.target.closest('[data-sec]'); if (t) { const el = $('#gd-' + t.dataset.sec, main); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
      main.addEventListener('change', (e) => { const k = e.target.dataset.chk; if (k) { const d = B.store.get('chk', {}); d[k] = e.target.checked; B.store.set('chk', d); } });
      const q = $('#gd-q', main); q.addEventListener('input', () => { const t = fold(q.value); $('#gd-list', main).innerHTML = String(glossRows(all.filter((g) => !t || fold(g[0] + ' ' + g[1]).includes(t)))); });
    },
  };
})();
