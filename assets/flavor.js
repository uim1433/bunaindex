/* Buna Index: Flavor (start from what you like to taste) */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, money, by } = B;
  const SHORT = { floral: 'Floral', citrus: 'Citrus', berry: 'Berry', stone: 'Stone fruit', tropical: 'Tropical', dried: 'Dried fruit', sweet: 'Caramel', cocoa: 'Chocolate', spice: 'Spice & tea', earth: 'Earthy' };
  const WORDS = {
    floral: 'jasmine, bergamot, rose, honeysuckle', citrus: 'lemon, orange, grapefruit, lime', berry: 'blueberry, strawberry, raspberry, blackcurrant',
    stone: 'peach, apricot, plum, red apple', tropical: 'mango, pineapple, passionfruit, lychee', dried: 'raisin, fig, date, red wine',
    sweet: 'caramel, brown sugar, honey, panela', cocoa: 'milk chocolate, cocoa, almond, hazelnut', spice: 'cinnamon, cardamom, black tea, lemongrass', earth: 'cedar, tobacco, toast, forest floor',
  };
  const PROC_HINT = { floral: 'Washed', citrus: 'Washed', berry: 'Natural', stone: 'Washed', tropical: 'Anaerobic & experimental', dried: 'Natural', sweet: 'Honey', cocoa: 'Natural', spice: 'Wet-hulled', earth: 'Wet-hulled' };
  const WHY = {
    Washed: 'The fruit is removed before drying, which keeps acidity clear. That is where floral, citrus and orchard-fruit notes show.',
    Natural: 'The seed dries inside the whole cherry, which pushes berry, dried-fruit and chocolate sweetness forward.',
    Honey: 'Some fruit stays on the parchment while it dries: rounder body, caramel and brown-sugar sweetness.',
    'Anaerobic & experimental': 'Sealed-tank fermentation builds tropical, winey and candy-like notes. Expect a louder cup.',
    'Wet-hulled': 'The Sumatran method. It lowers acidity and brings cedar, spice and a heavy body.',
  };
  const DRINK = {
    black: { label: 'Black', roast: ['Light', 'Light-medium'], tip: 'Drinking it black shows the origin most clearly. Light and light-medium roasts keep fruit and floral notes intact.' },
    milk: { label: 'With milk', roast: ['Medium', 'Medium-dark'], tip: 'Milk mutes acidity and lifts sweetness. Medium roasts with chocolate, caramel or berry notes hold up best.' },
    iced: { label: 'Iced', roast: ['Light', 'Medium'], tip: 'Cold dulls aroma, so pick a coffee with a loud fruit or chocolate note and brew it a little stronger over ice.' },
  };

  /* seller-note tallies per origin: how often each family is mentioned */
  const noted = {};
  B.coffees.forEach((c) => { if (!c.f || !c.oo) return; const n = noted[c.o] || (noted[c.o] = { n: 0, fam: {} }); n.n++; c.f.forEach((f) => (n.fam[f] = (n.fam[f] || 0) + 1)); });

  function arc(cx, cy, r0, r1, a0, a1) {
    const p = (r, a) => (cx + r * Math.sin(a)).toFixed(2) + ',' + (cy - r * Math.cos(a)).toFixed(2);
    return 'M' + p(r1, a0) + 'A' + r1 + ',' + r1 + ' 0 0 1 ' + p(r1, a1) + 'L' + p(r0, a1) + 'A' + r0 + ',' + r0 + ' 0 0 0 ' + p(r0, a0) + 'Z';
  }
  function wheel(sel, total) {
    const cx = 230, cy = 172, n = B.FAM.length, step = (Math.PI * 2) / n;
    const segs = B.FAM.map((f, i) => {
      const on = sel.includes(f.id), a0 = i * step, a1 = (i + 1) * step, mid = (a0 + a1) / 2;
      const lx = cx + (on ? 150 : 140) * Math.sin(mid), ly = cy - (on ? 150 : 140) * Math.cos(mid);
      const anchor = Math.abs(Math.sin(mid)) < 0.3 ? 'middle' : Math.sin(mid) > 0 ? 'start' : 'end';
      return html`<path class="seg-f${on ? ' on' : ''}" d="${arc(cx, cy, 66, on ? 134 : 124, a0, a1)}" fill="var(--f-${f.id})" data-fam="${f.id}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${f.label}"><title>${f.label}: ${WORDS[f.id]}</title></path>
        <text class="wl${on ? ' on' : ''}" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}">${SHORT[f.id]}</text>`;
    });
    return html`<svg class="wheel${sel.length ? ' has' : ''}" viewBox="0 0 460 344" role="group" aria-label="Flavor wheel. Choose up to three flavor families.">
      ${segs}<text class="wc" x="${cx}" y="${cy + 6}">${sel.length ? int(total) : '10'}</text><text class="wcs" x="${cx}" y="${cy + 26}">${sel.length ? (total === 1 ? 'coffee matches' : 'coffees match') : 'flavor families'}</text></svg>`;
  }

  function originRows(sel) {
    return B.liveOrigins.filter((o) => o.fam && o.n_listed > 0).map((o) => {
      const g = sel.filter((f) => o.fam.includes(f)).length, nt = noted[o.id];
      const share = nt && sel.length ? sel.reduce((s, f) => s + (nt.fam[f] || 0), 0) / (nt.n * sel.length) : 0;
      return { o, g, share, score: g + share * 0.9 + Math.min(0.09, o.n_listed / 3000) };
    }).filter((r) => r.g > 0).sort(by((r) => -r.score)).slice(0, 7);
  }
  function coffeeMatches(sel) {
    return B.coffees.filter((c) => c.f && c.listed && sel.some((f) => c.f.includes(f)))
      .map((c) => ({ c, m: sel.filter((f) => c.f.includes(f)).length }))
      .sort((a, b) => b.m - a.m || (a.c.k === 'r' ? 0 : 1) - (b.c.k === 'r' ? 0 : 1) || (a.c.s === 'avail' ? 0 : 1) - (b.c.s === 'avail' ? 0 : 1));
  }
  function matrix(sel) {
    const rows = B.liveOrigins.filter((o) => o.fam).slice(0, 16);
    return html`<div class="table-wrap" style="border:0;background:none"><table class="fmap"><thead><tr><th></th>${B.FAM.map((f) => html`<th><button data-fam="${f.id}" aria-pressed="${sel.includes(f.id)}" title="${f.label}"><span>${SHORT[f.id]}</span><i class="fdot" data-f="${f.id}"></i></button></th>`)}</tr></thead>
      <tbody>${rows.map((o) => html`<tr><th scope="row"><button data-origin="${o.id}">${o.n}</button></th>${B.FAM.map((f) => {
        const guide = o.fam.includes(f.id), n = noted[o.id] ? noted[o.id].fam[f.id] || 0 : 0;
        return html`<td title="${o.n}, ${f.label}: ${guide ? 'typical of the origin' : 'not typical'}${n ? '; in ' + n + ' seller note' + (n === 1 ? '' : 's') : ''}">${guide ? html`<i data-f="${f.id}"></i>` : n >= 2 ? html`<i class="ring"></i>` : html`<i class="no"></i>`}</td>`;
      })}</tr>`)}</tbody></table></div>
      <div class="legend" style="margin-top:8px"><span><i style="border-radius:50%;background:var(--ink2)"></i>Typical of the origin (field guide)</span><span><i style="border-radius:50%;border:2px solid var(--ink3)"></i>Not typical, but sellers mention it</span></div>`;
  }

  B.views.flavor = {
    render(main, st) {
      if (!Array.isArray(st.sel)) st.sel = [];
      st.drink = st.drink || 'black';
      const sel = st.sel, matches = coffeeMatches(sel), rows = originRows(sel), dr = DRINK[st.drink];
      const hints = B.uniq(sel.map((f) => PROC_HINT[f])).filter(Boolean);
      const full = matches.filter((m) => m.m === sel.length);
      const show = (full.length >= 3 ? full : matches).slice(0, 6);
      main.innerHTML = String(html`<div class="wrap"><div class="flavor">
        <section class="stack" style="--gap:16px">
          <div class="stack" style="--gap:6px"><h1 style="font-size:clamp(28px,3.6vw,42px)">Start from flavor</h1>
            <p class="lede">Pick up to three things you like to taste. The index answers with the origins known for them and the coffees whose sellers describe them that way.</p></div>
          ${wheel(sel, matches.length)}
          <div class="chips" aria-label="Flavor families">${B.FAM.map((f) => html`<button class="chip" data-fam="${f.id}" aria-pressed="${sel.includes(f.id)}" title="${WORDS[f.id]}"><i class="fdot" data-f="${f.id}"></i>${f.label}</button>`)}${sel.length ? html`<button class="link small" id="fl-clear" style="align-self:center;margin-left:4px">Clear</button>` : ''}</div>
          ${sel.length ? html`<p class="small muted">${sel.map((f) => html`<b style="color:var(--ink)">${B.FAMMAP[f].label}:</b> ${WORDS[f]}. `)}</p>` : ''}
          <div class="stack" style="--gap:8px"><h3>How do you take it?</h3>
            <div class="seg" role="group" aria-label="How you drink coffee" style="align-self:flex-start">${Object.keys(DRINK).map((k) => html`<button data-drink="${k}" aria-pressed="${st.drink === k}">${DRINK[k].label}</button>`)}</div>
            <p class="muted">${dr.tip}</p></div>
        </section>
        <section class="stack" style="--gap:22px">
          ${sel.length ? html`
            <div class="stack" style="--gap:4px"><div class="head"><h2>Origins to try</h2><span class="small faint">matched on the field guide, then on seller notes</span></div>
              ${rows.length ? html`<ul class="omatch">${rows.map((r) => {
                const med = B.originSummary(r.o.id, 'r');
                return html`<li><h3><button data-origin="${r.o.id}">${r.o.n}</button></h3>
                  <span class="row nowrap" style="--gap:8px"><span class="meter" role="img" aria-label="${r.g} of ${sel.length} flavors match">${sel.map((f, i) => html`<i class="${i < r.g ? 'on' : ''}"></i>`)}</span>
                    <button class="btn ghost sm" data-go="finder" data-params='${JSON.stringify({ reset: true, origins: [r.o.id], kind: 'r', roast: [] })}'>${int(r.o.n_roast)} coffees</button></span>
                  <span class="sub">${r.o.cup}${med && med.n >= 3 ? html` <span class="faint">· median ${money(med.med, 0)} per lb</span>` : ''}</span></li>`;
              })}</ul>` : html`<p class="muted">No origin’s typical cup covers that combination. Try the coffees below, or drop one flavor.</p>`}
            </div>
            ${hints.length ? html`<div class="stack" style="--gap:8px"><h3>Processing to look for</h3>
              ${hints.map((p) => html`<p class="note"><button class="link" data-go="finder" data-params='${JSON.stringify({ reset: true, process: [p], kind: 'r', roast: dr.roast })}'>${p}</button>. ${WHY[p] || ''}</p>`)}</div>` : ''}
            <div class="stack" style="--gap:12px"><div class="head"><h2>Coffees described this way</h2>
              ${matches.length ? html`<button class="link" data-go="finder" data-params='${JSON.stringify({ reset: true, fams: sel, kind: 'all', notes: true })}'>See all ${int(matches.length)}</button>` : ''}</div>
              ${show.length ? html`<div class="cards">${show.map((m) => B.card(m.c))}</div>` : html`<div class="empty"><b>No seller notes mention that yet.</b>Tasting notes are recorded for ${int(B.coffees.filter((c) => c.tn).length)} coffees so far; the origin matches above draw on the field guide instead.</div>`}
              <p class="tiny faint">Matches come from the seller’s own published tasting notes, sorted into ten families. Notes are opinions; your cup depends on roast, water and brew.</p></div>`
          : html`
            <div class="stack" style="--gap:10px"><div class="head"><h2>The flavor map</h2><span class="small faint">tap a column to choose that flavor</span></div>
              <p class="muted" style="max-width:64ch">What each origin is known for, alongside what sellers in the index actually write on the bag.</p>
              ${matrix(sel)}</div>`}
        </section></div></div>`);

      const pick = (f) => { const i = sel.indexOf(f); if (i >= 0) sel.splice(i, 1); else { sel.push(f); if (sel.length > 3) sel.shift(); } B.go('flavor', {}); };
      main.addEventListener('click', (e) => {
        const t = e.target.closest('[data-fam],[data-drink],#fl-clear'); if (!t) return;
        if (t.id === 'fl-clear') { st.sel = []; return B.go('flavor', {}); }
        if (t.dataset.fam) return pick(t.dataset.fam);
        if (t.dataset.drink) { st.drink = t.dataset.drink; return B.go('flavor', {}); }
      });
      main.addEventListener('keydown', (e) => { const t = e.target.closest('path[data-fam]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(t.dataset.fam); } });
    },
  };
})();
