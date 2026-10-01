/* Buna Index: Method and sources */
(function () {
  'use strict';
  const B = window.B, { html, int, plural } = B;
  B.views.method = {
    render(main) {
      const C = B.coffees, m = B.D.meta.counts, n = (f) => C.filter(f).length;
      const st = ['avail', 'unc', 'sold', 'seen', 'ref'].map((s) => [s, n((c) => c.s === s)]);
      const addr = B.companies.filter((c) => c.pb === 'addr').length, city = B.companies.filter((c) => c.pb === 'city').length, none = B.companies.filter((c) => !c.pt).length;
      const types = Object.entries(B.companies.reduce((a, c) => ((a[c.t] = (a[c.t] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
      const regs = B.origins.reduce((s, o) => s + o.rg.length, 0);
      main.innerHTML = String(html`<div class="wrap prose" style="max-width:920px">
        <div class="stack" style="--gap:8px;margin-bottom:26px"><h1 style="font-size:clamp(28px,3.6vw,42px)">Method and sources</h1>
          <p class="lede">Buna Index records specialty coffee as it is listed for sale in the United States: where it grew, who imported or roasted it, and where that business is. This page says how the records are made and where they stop.</p></div>

        <div class="stats" style="margin-bottom:30px">
          <div class="stat"><span class="figure num">${int(m.coffees)}</span><span class="cap">coffees recorded</span></div>
          <div class="stat"><span class="figure num">${int(m.listed)}</span><span class="cap">with a price or a stock check</span></div>
          <div class="stat"><span class="figure num">${int(m.companies)}</span><span class="cap">businesses</span></div>
          <div class="stat"><span class="figure num">${m.origins}</span><span class="cap">origins, ${regs} growing regions</span></div>
          <div class="stat"><span class="figure num" style="font-size:clamp(20px,2.4vw,28px)">${B.fmtDate(B.TODAY)}</span><span class="cap">date of this index</span></div>
        </div>

        <div class="stack" style="--gap:30px">
          <section class="stack" style="--gap:10px"><h2>Where records come from</h2>
            <p>Every record was read from a page the seller publishes: a product page, an importer’s offer list, a locations page. The record keeps the link and the date it was checked, and the coffee’s page here sends you back to that source.</p>
            <p>Nothing in the index comes from private quotes, emails or price lists that are not public. If a seller does not publish a price, the record says so.</p></section>

          <section class="stack" style="--gap:10px"><h2>What each status means</h2>
            <div class="table-wrap"><table class="t"><thead><tr><th>Status</th><th>Meaning</th><th class="r">Records</th></tr></thead><tbody>
              ${st.map((s) => html`<tr><td class="nw"><span class="pill ${s[0]}">${B.STATUS[s[0]].label}</span></td><td>${B.STATUS[s[0]].long}</td><td class="r num">${int(s[1])}</td></tr>`)}</tbody></table></div>
            <p class="muted">Search and the Finder leave catalog references out unless you ask for them. They show that a roaster carries an origin; they say nothing about price or stock.</p></section>

          <section class="stack" style="--gap:10px"><h2>What is read from the name</h2>
            <p>Sellers do not always fill in origin, region or process as separate fields. Where the listing name states it plainly, the index reads it from the name and marks the field as read from the name on the coffee’s page.</p>
            <dl class="kv"><dt>Origin from the name</dt><dd class="num">${int(n((c) => c.oi))} records</dd><dt>Region from the name</dt><dd class="num">${int(n((c) => c.ri))} records</dd><dt>Process from the name</dt><dd class="num">${int(n((c) => c.pi))} records</dd></dl>
            <p class="muted">Regions are grouped under one spelling per origin, so “Yirga Cheffe”, “Yirgachefe” and “Yirgacheffe” count together. The seller’s own wording stays on the record.</p></section>

          <section class="stack" style="--gap:10px"><h2>Prices</h2>
            <p>Prices are list prices on the date checked. They are not transaction prices and they do not include shipping.</p>
            <p><b>Roasted coffee.</b> Price per pound is the bag price divided by the bag weight. Medians for an origin use bags of 8 to 16 oz only, so a 5 lb bulk bag or a 4 oz sampler does not move them. ${int(n((c) => c.retail))} bags qualify.</p>
            <p><b>Green coffee.</b> Price per pound is the best price the importer publishes for the lot, which is usually the full-bag price. ${int(n((c) => c.k === 'g' && c.ppl != null))} lots carry one. Decaf lots are left out of origin medians. ${int(n((c) => c.up != null))} lots show a unit price with no pack weight and are left out of every per-pound figure.</p>
            <p class="muted">A median needs at least three prices before it is shown, and five before a coffee is compared against it.</p></section>

          <section class="stack" style="--gap:10px"><h2>Maps</h2>
            <p>Growing regions appear as a reference point, and where one exists, the administrative area the region sits in. Neither is a cultivation boundary: coffee grows in parts of these areas, not across them.</p>
            <p>${int(addr)} businesses are mapped at an address they publish for visitors. ${int(city)} are mapped at a reference point for their city, not at a storefront, and ${int(none)} have no map point yet. No location is guessed.</p></section>

          <section class="stack" style="--gap:10px"><h2>The field guide</h2>
            <p>Harvest months, altitudes, varieties, typical cup and the notes on each region are general reference material written for the index. They are kept apart from the records and labelled as field guide wherever they appear. Harvest windows are typical; weather and altitude move them.</p></section>

          <section class="stack" style="--gap:10px"><h2>Who is in, who is not</h2>
            <dl class="kv">${types.map((t) => html`<dt>${B.TYPE_LABEL[t[0]] || t[0]}</dt><dd class="num">${int(t[1])}</dd>`)}</dl>
            <p>The index covers independent roasters, cafés and importers. National chains and general marketplaces are left out on purpose. Business types marked “not verified” were assigned from the business’s own description and have not been confirmed with it.</p></section>

          <section class="stack" style="--gap:10px"><h2>Independence</h2>
            <p>Buna Index is operated by Ethi CO, a coffee company in Denver, Colorado. That is a conflict of interest and it is handled plainly: Ethi CO’s products follow the same rules as everyone else’s and get no placement.</p>
            <p>Order in search, the Finder and the maps cannot be bought. Paid membership adds tools for the business that pays; it does not move that business up a list. If sponsored placements are ever sold they will be labelled as such.</p></section>

          <section class="stack" style="--gap:10px"><h2>Your privacy</h2>
            <p>The site sets no cookies and runs no analytics. Your passport, your shortlist and your settings are kept in your own browser and are not sent anywhere. Clearing your browser data removes them.</p></section>

          <section class="stack" style="--gap:10px"><h2>Corrections</h2>
            <p>Every business page carries “This is my business” and “Report a correction”. Both prepare a short request you can send through the <a class="link ext" href="${B.CONTACT_URL}" target="_blank" rel="noopener">contact page</a>. Claiming a listing is free.</p></section>

          <section class="stack" style="--gap:10px"><h2>Credits</h2>
            <p class="muted">Country, state and lake outlines are from Natural Earth, which is in the public domain. Maps are drawn with D3. Type is Besley, Hanken Grotesk and Big Shoulders Stencil.</p>
            <p class="muted">Built from the master inventory dated ${B.fmtDate(B.TODAY)}.</p></section>
        </div></div>`);
    },
  };
})();
