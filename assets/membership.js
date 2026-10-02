/* Buna Index: Membership (proposed tiers, tier preview, claim a listing) */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, by, fold } = B;
  const PLANS = [
    { id: 'free', n: 'Reader', price: 'Free', who: 'For anyone who drinks coffee', feats: ['The atlas, the finder, flavor matching and the map', 'A passport kept in your browser', 'The source link on every record'] },
    { id: 'plus', n: 'Passport+', price: '$40', per: 'a year', who: 'For drinkers who keep track', feats: ['Your passport on every device', 'A note when a saved coffee is back in stock', 'New-crop notes for the origins you have stamped', 'A tasting journal'] },
    { id: 'pro', n: 'Pro', price: '$29', per: 'a month', who: 'For roasters and cafés', feats: ['A claimed, verified listing you edit yourself', 'Your catalog kept in step with your shop', 'Wholesale enquiries sent to your inbox', 'Published email addresses in the directory', 'Price history and alerts', 'Which cities view and save your coffees'] },
    { id: 'trade', n: 'Trade', price: '$149', per: 'a month', who: 'For importers and wholesalers', feats: ['Everything in Pro', 'Your offer list refreshed daily', 'Sample requests routed to your inbox', 'Exports of offers and prospect lists', 'Demand reports: what roasters search and shortlist'] },
    { id: 'data', n: 'Data', price: 'From $99', per: 'a month', who: 'For analysts, lenders and press', feats: ['The index as a data feed', 'The price series, origin by origin', 'A licence to publish from it'] },
  ];
  const FAQ = [
    ['Is my business already listed?', 'Probably. Search for it in the box above. Listings are built from what you publish, so nothing here should surprise you; if something is wrong, the same form sends a correction.'],
    ['What does claiming a listing do?', 'It confirms you speak for the business. You can then correct the type, address and wholesale details, and say which coffees are current. Claiming is free and stays free.'],
    ['How would sample requests reach an importer?', 'Today the index writes the request and the roaster sends it through your contact page. With a Trade membership, requests would arrive in an inbox on the index and your reply would go straight back to the roaster.'],
    ['Does paying move a business up the list?', 'No. Order in search, the finder, the maps and the partner matcher is set by the filters and by what is on record. Membership adds tools for the business that pays.'],
    ['Where does the data come from?', 'From pages each seller publishes, read on the date shown on each record. The method page lists every rule.'],
  ];

  B.interest = function (plan) {
    const P = PLANS.find((p) => p.id === plan), me = B.store.get('me', {});
    const el = B.modal('Tell us you want ' + P.n, html`<p class="muted">Membership is not open yet. Leave a note and you will hear when it is. This writes the note for you; nothing is sent from this page.</p>
      <form id="int-f" class="stack" style="--gap:12px"><div class="two" style="gap:12px"><label class="field"><span>Your name</span><input class="input" id="int-name" autocomplete="name" value="${me.name || ''}"></label><label class="field"><span>Business, if any</span><input class="input" id="int-biz" autocomplete="organization" value="${me.biz || ''}"></label></div>
        <label class="field"><span>What would make it worth paying for?</span><textarea class="input" id="int-note" rows="3"></textarea></label><div class="row"><button class="btn primary" type="submit">Write the note</button></div></form>
      <div id="int-out" class="stack" style="--gap:10px" hidden><pre class="copy" id="int-text"></pre><div class="row"><button class="btn primary" data-copy="#int-text">Copy</button><a class="btn ghost ext" href="${B.CONTACT_URL}" target="_blank" rel="noopener">Open the contact page</a></div></div>`);
    B.onSubmit($('#int-f', el), () => {
      const name = $('#int-name', el).value.trim(), biz = $('#int-biz', el).value.trim();
      B.store.set('me', Object.assign(B.store.get('me', {}), { name, biz }));
      $('#int-text', el).textContent = ['BUNA INDEX MEMBERSHIP INTEREST', 'Plan: ' + P.n + ' (' + P.price + (P.per ? ' ' + P.per : '') + ', proposed)', 'From: ' + (name || '(name)') + (biz ? ', ' + biz : ''), '', $('#int-note', el).value.trim() || '(what would make it worth paying for)'].join('\n');
      $('#int-out', el).hidden = false;
    });
  };

  B.views.membership = {
    render(main, st) {
      const tier = B.tier();
      main.innerHTML = String(html`<div class="wrap">
        <div class="stack" style="--gap:8px;margin-bottom:20px;max-width:78ch"><h1 style="font-size:clamp(28px,3.6vw,42px)">Membership</h1>
          <p class="lede">The index is free to read and will stay that way. Membership pays for tools that save a business time. It never buys position.</p>
          <p class="note warn">${B.WEB ? 'Membership is not open yet and nothing is charged. While it is being built, every tool on the site is open to everyone. The prices below are what is planned.' : 'Membership is not open yet. The prices below are proposals and nothing is charged here. Use the switch to see how the portal behaves for each kind of member.'}</p></div>

        <div class="row" style="margin-bottom:16px;--gap:12px" ${B.WEB ? raw('hidden') : ''}><b>Preview the portal as</b><div class="seg" role="group" aria-label="Preview tier">${['free', 'pro', 'trade'].map((t) => html`<button data-tier="${t}" aria-pressed="${tier === t}">${B.TIER_LABEL[t]}</button>`)}</div>
          <span class="small muted">${tier === 'free' ? 'Exports and published email addresses are locked.' : tier === 'pro' ? 'Published email addresses are shown. Exports are locked.' : 'Everything is unlocked.'}</span></div>

        <div class="tiers">${PLANS.map((p) => html`<div class="tier${!B.WEB && p.id === tier ? ' on' : ''}"><div class="stack" style="--gap:2px"><h3>${p.n}</h3><span class="small muted">${p.who}</span></div>
          <div class="price">${p.price}${p.per ? html` <small>${p.per}</small>` : ''}</div><ul>${p.feats.map((f) => html`<li>${f}</li>`)}</ul>
          <div style="margin-top:auto">${p.id === 'free' ? html`<a class="btn ghost sm" href="#atlas">Open the atlas</a>` : html`<button class="btn ${p.id === 'pro' || p.id === 'trade' ? 'primary' : 'ghost'} sm" data-plan="${p.id}">Tell us you want this</button>`}</div></div>`)}</div>

        <div class="two" style="margin-top:22px">
          <section class="panel pad stack" style="--gap:12px"><h2>Claim your listing</h2><p class="muted">Free for every roaster, café and importer. Find your business and confirm its details.</p>
            <label class="search"><span class="sr">Find your business</span>${raw(B.I.search)}<input class="input" id="mb-q" type="search" placeholder="Type your business name" autocomplete="off"></label>
            <ul class="biz" id="mb-r"></ul>
            <p class="small muted">Not listed? <button class="link" id="mb-new">Ask to be added</button>.</p></section>
          <section class="panel pad stack" style="--gap:12px"><h2>Buna Verified</h2>
            <div class="row" style="--gap:10px;align-items:baseline"><span class="figure">$125</span><span class="muted">a lot, proposed</span></div>
            <p class="muted">An independent cupping of one lot by a licensed Q grader, published on the lot’s page with the full score sheet.</p>
            <div class="tier" style="border:0;padding:0;background:none"><ul><li>The fee pays for the cupping, whatever the score</li><li>A score is published only with the seller’s consent</li><li>Scores from sellers stay labelled as the seller’s own</li></ul></div></section>
        </div>

        <section class="stack" style="--gap:12px;margin-top:30px"><h2>What money does not buy</h2>
          <div class="three"><div class="stack" style="--gap:4px"><h3>Position</h3><p class="muted">Order in search, the finder, the maps and the partner matcher comes from the filters and the record. It cannot be bought.</p></div>
            <div class="stack" style="--gap:4px"><h3>Silence</h3><p class="muted">A member’s sold-out lots, prices and unverified details are shown the same way as everyone else’s.</p></div>
            <div class="stack" style="--gap:4px"><h3>Your data</h3><p class="muted">Reader passports are not sold. Demand reports are counts by city and origin, never a list of people.</p></div></div></section>

        <section class="stack" style="--gap:6px;margin-top:30px;max-width:86ch"><h2>Questions</h2>
          ${FAQ.map((f) => html`<details class="faq"><summary>${f[0]}</summary><p class="muted">${f[1]}</p></details>`)}
          <p class="small muted" style="margin-top:8px">More on sources and independence on the <a class="link" href="#method">method page</a>.</p></section>
      </div>`);

      const r = $('#mb-r', main), q = $('#mb-q', main);
      q.addEventListener('input', B.debounce(() => {
        const t = fold(q.value.trim()), words = t.split(/\s+/).filter(Boolean);
        const hits = t.length < 2 ? [] : B.companies.filter((c) => words.every((w) => c.text.includes(w))).sort(by((c) => -c.coffees.length)).slice(0, 6);
        r.innerHTML = String(t.length < 2 ? '' : hits.length ? html`${hits.map((c) => html`<li><button class="name" data-company="${c.i}">${c.n}</button><button class="btn ghost sm" data-claim="${c.i}">This is mine</button><span class="sub">${B.TYPE_LABEL[c.t] || ''}${c.city ? ' · ' + c.city + ', ' + c.st : ''}</span></li>`)}` : html`<li class="muted small" style="display:block">No business by that name yet. Ask to be added below.</li>`);
      }, 120));
      main.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tier],[data-plan],#mb-new'); if (!t) return;
        if (t.dataset.tier) { B.setTier(t.dataset.tier); B.toast('Previewing the ' + B.TIER_LABEL[t.dataset.tier] + ' tier'); return B.go('membership', {}); }
        if (t.dataset.plan) return B.interest(t.dataset.plan);
        if (t.id === 'mb-new') {
          const el = B.modal('Ask to be added', html`<p class="muted">Tell us who you are and where your coffees or offers are published. This writes the request; nothing is sent from this page.</p>
            <form id="nw-f" class="stack" style="--gap:12px"><div class="two" style="gap:12px"><label class="field"><span>Business name</span><input class="input" id="nw-n"></label><label class="field"><span>Website</span><input class="input" id="nw-w" inputmode="url" placeholder="https://"></label>
              <label class="field"><span>City and state</span><input class="input" id="nw-c"></label><label class="field"><span>You are a</span><select class="select" id="nw-t"><option>Roaster</option><option>Café</option><option>Importer</option><option>Exporter or producer</option></select></label></div>
              <div class="row"><button class="btn primary" type="submit">Write the request</button></div></form>
            <div id="nw-out" class="stack" style="--gap:10px" hidden><pre class="copy" id="nw-text"></pre><div class="row"><button class="btn primary" data-copy="#nw-text">Copy</button><a class="btn ghost ext" href="${B.CONTACT_URL}" target="_blank" rel="noopener">Open the contact page</a></div></div>`);
          B.onSubmit($('#nw-f', el), () => { $('#nw-text', el).textContent = ['NEW LISTING REQUEST', 'Business: ' + ($('#nw-n', el).value || '(name)'), 'Type: ' + $('#nw-t', el).value, 'Where: ' + ($('#nw-c', el).value || '(city, state)'), 'Website: ' + ($('#nw-w', el).value || '(address)'), '', 'Buna Index dated ' + B.fmtDate(B.TODAY)].join('\n'); $('#nw-out', el).hidden = false; });
        }
      });
    },
  };
})();
