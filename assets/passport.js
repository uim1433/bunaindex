/* Buna Index: Passport (origin stamps, saved coffees, taste profile). Lives in this browser only. */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, money, perLb, by } = B;
  const CT = [['Africa', 'Africa'], ['North America', 'Mexico, Central America and the Caribbean'], ['South America', 'South America'], ['Asia', 'Asia'], ['Oceania', 'The Pacific']];

  function profile(saved, stamped) {
    const fam = {}, org = {}, proc = {};
    saved.forEach((c) => { (c.f || []).forEach((f) => (fam[f] = (fam[f] || 0) + 1)); if (c.oo) org[c.o] = (org[c.o] || 0) + 1; if (c.p) proc[c.p] = (proc[c.p] || 0) + 1; });
    stamped.forEach((o) => (o.fam || []).forEach((f) => (fam[f] = (fam[f] || 0) + 0.5)));
    const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]);
    return { fam: top(fam), org: top(org), proc: top(proc) };
  }
  const bars = (rows, label, max) => html`<div class="bars">${rows.map((r) => html`<div class="b"><span>${label(r[0])}</span><i style="width:${Math.max(4, (r[1] / max) * 100)}%${r[2] ? ';background:' + r[2] : ''}"></i><span class="num faint">${r[3] === false ? '' : r[1]}</span></div>`)}</div>`;

  function compare(list) {
    const rows = [
      ['Origin', (c) => (c.oo ? c.oo.n : c.o === 'BLEND' ? 'Blend' : '—')], ['Region', (c) => (c.rg ? c.rg.join(', ') : '—')], ['Process', (c) => c.p || '—'], ['Roast', (c) => (c.k === 'g' ? 'Green' : c.ro || '—')],
      ['Variety', (c) => c.v || '—'], ['Price', (c) => (c.pr != null ? money(c.pr) + (c.lb ? ' for ' + B.fmtLb(c.lb) : '') : c.k === 'g' && c.ppl != null ? perLb(c.ppl) : '—')], ['Per pound', (c) => (c.ppl != null ? money(c.ppl) : '—')],
      ['Tasting notes', (c) => c.tn || '—'], ['Certifications', (c) => (c.ce ? c.ce.join(', ') : '—')], ['Seller', (c) => B.sellerLine(c.co)], ['Status', (c) => B.pill(c)],
    ];
    return html`<div class="table-wrap"><table class="t"><thead><tr><th></th>${list.map((c) => html`<th style="white-space:normal;min-width:170px"><button data-coffee="${c.id}" style="text-align:left;font-weight:700;color:var(--ink)">${c.n}</button></th>`)}</tr></thead>
      <tbody>${rows.map((r) => html`<tr><td class="nw" style="font-weight:650;color:var(--ink2)">${r[0]}</td>${list.map((c) => html`<td>${r[1](c)}</td>`)}</tr>`)}</tbody></table></div>`;
  }

  B.views.passport = {
    render(main, st) {
      const L = B.lists, all = B.liveOrigins, stamped = all.filter((o) => L.stamps.has(o.id));
      const saved = Array.from(L.saved).map((id) => B.byId[id]).filter(Boolean);
      const P = profile(saved, stamped);
      const next = all.filter((o) => !L.stamps.has(o.id) && o.n_listed > 2 && o.fam && P.fam.slice(0, 3).some((f) => o.fam.includes(f[0]))).slice(0, 5);
      const fresh = all.filter((o) => !L.stamps.has(o.id) && o.n_listed > 2 && o.arrive && o.arrive.length < 12 && o.arrive.includes(B.NOW_MONTH)).slice(0, 5);
      const view = st.view === 'compare' && saved.length > 1 ? 'compare' : 'cards';
      main.innerHTML = String(html`<div class="wrap">
        <div class="stack" style="--gap:6px;margin-bottom:22px"><h1 style="font-size:clamp(28px,3.6vw,42px)">Your coffee passport</h1>
          <p class="lede">Stamp the origins you have tasted and keep the coffees you want to remember. Nothing leaves this browser.</p></div>

        <section class="stack" style="--gap:14px">
          <div class="head"><h2>Origins tasted</h2><span class="muted"><b class="num" style="color:var(--ink)">${stamped.length}</b> of ${all.length}</span></div>
          <div style="height:8px;border-radius:4px;background:var(--sunk);overflow:hidden" role="img" aria-label="${stamped.length} of ${all.length} origins stamped"><div style="height:100%;width:${(stamped.length / all.length) * 100}%;background:var(--cherry)"></div></div>
          ${CT.map((ct) => { const os = all.filter((o) => o.ct === ct[0]).sort(by((o) => o.n)); return os.length ? html`<div class="stack" style="--gap:8px"><div class="head"><h3>${ct[1]}</h3><span class="small faint num">${os.filter((o) => L.stamps.has(o.id)).length} of ${os.length}</span></div>
            <div class="stamps">${os.map((o) => html`<button class="stamp" data-stamp="${o.id}" aria-pressed="${L.stamps.has(o.id)}" title="${L.stamps.has(o.id) ? 'Tasted. Tap to remove the stamp.' : 'Tap when you have tasted a coffee from ' + o.n}"><span class="code">${o.id === 'USA' ? 'HI' : o.id}</span>${o.n}</button>`)}</div></div>` : ''; })}
          ${next.length || fresh.length ? html`<div class="two">
            ${next.length ? html`<div class="panel pad stack" style="--gap:8px"><h3>Next stamps, by your taste</h3><p class="small muted">Origins you have not stamped that share the flavors you lean toward.</p><div class="chips">${next.map((o) => html`<button class="chip" data-origin="${o.id}">${o.n} <span class="n">${int(o.n_listed)}</span></button>`)}</div></div>` : ''}
            ${fresh.length ? html`<div class="panel pad stack" style="--gap:8px"><h3>Fresh crop landing now</h3><p class="small muted">Unstamped origins whose new harvest reaches US roasters in ${B.MONTHS[B.NOW_MONTH - 1]}.</p><div class="chips">${fresh.map((o) => html`<button class="chip" data-origin="${o.id}">${o.n} <span class="n">${int(o.n_listed)}</span></button>`)}</div></div>` : ''}</div>` : ''}
        </section>

        <section class="stack" style="--gap:14px;margin-top:38px">
          <div class="head"><h2>Saved coffees</h2>
            ${saved.length ? html`<div class="row" style="--gap:8px">${saved.length > 1 ? html`<div class="seg" role="group" aria-label="Layout"><button data-view="cards" aria-pressed="${view === 'cards'}">Cards</button><button data-view="compare" aria-pressed="${view === 'compare'}">Compare</button></div>` : ''}
              <button class="btn ghost sm" id="pp-export">Export the list</button><button class="btn ghost sm" id="pp-clear">Clear</button></div>` : ''}</div>
          ${!saved.length ? html`<div class="empty"><b>Nothing saved yet.</b>Tap the heart on any coffee to keep it here.<div class="row" style="margin-top:12px"><a class="btn primary" href="#finder">Open the Finder</a><a class="btn ghost" href="#flavor">Start from flavor</a></div></div>`
            : view === 'compare' ? html`${compare(saved.slice(0, 4))}${saved.length > 4 ? html`<p class="small muted">Comparing the first four of ${saved.length}. Remove one to bring in the next.</p>` : ''}`
            : html`<div class="cards">${saved.map(B.card)}</div>`}
        </section>

        <section class="stack" style="--gap:14px;margin-top:38px">
          <h2>What your taste leans toward</h2>
          ${P.fam.length || P.org.length ? html`<div class="three">
            ${P.fam.length ? html`<div class="stack" style="--gap:10px"><h3>Flavors</h3>${bars(P.fam.slice(0, 6).map((f) => [f[0], f[1], 'var(--f-' + f[0] + ')', false]), (id) => B.FAMMAP[id].label, P.fam[0][1])}</div>` : ''}
            ${P.org.length ? html`<div class="stack" style="--gap:10px"><h3>Origins you save</h3>${bars(P.org.slice(0, 6), (id) => B.O[id].n, P.org[0][1])}</div>` : ''}
            ${P.proc.length ? html`<div class="stack" style="--gap:10px"><h3>Processing</h3>${bars(P.proc.slice(0, 6), (p) => p, P.proc[0][1])}</div>` : ''}
          </div><p class="small muted">Built from the tasting notes of what you saved and the typical cup of the origins you stamped.</p>
          ${P.fam.length ? html`<div><button class="btn ghost" data-go="flavor" data-params='${JSON.stringify({ sel: P.fam.slice(0, 2).map((f) => f[0]) })}'>Find more like this</button></div>` : ''}`
          : html`<p class="muted">Stamp an origin or save a coffee and a profile appears here.</p>`}
        </section>

        <section class="lock" style="margin-top:38px"><span><b>This passport lives in one browser.</b> Member accounts would carry it across devices and tell you when a saved coffee is back in stock or a stamped origin’s new crop lands.</span><a class="btn ghost sm" href="#membership">See what is planned</a></section>
      </div>`);

      main.addEventListener('click', (e) => {
        const t = e.target.closest('[data-stamp],[data-view],#pp-export,#pp-clear,#pp-clear-yes'); if (!t) return;
        if (t.dataset.stamp) { const on = B.toggle('stamps', t.dataset.stamp); B.toast(on ? B.O[t.dataset.stamp].n + ' stamped' : 'Stamp removed'); return B.go('passport', {}); }
        if (t.dataset.view) { st.view = t.dataset.view; return B.go('passport', {}); }
        if (t.id === 'pp-export') {
          const rows = [['Coffee', 'Seller', 'City', 'State', 'Origin', 'Region', 'Process', 'Roast', 'Price', 'Size', 'Per lb', 'Tasting notes', 'Status', 'Checked', 'Link']];
          saved.forEach((c) => rows.push([c.n, c.co.n, c.co.city, c.co.st, c.oo ? c.oo.n : c.o === 'BLEND' ? 'Blend' : '', (c.rg || []).join('; '), c.p, c.ro, c.pr, c.sz || (c.lb ? B.fmtLb(c.lb) : ''), c.ppl, c.tn, B.STATUS[c.s].label, c.ch, c.u]));
          return B.exportFile('buna-index-saved-coffees.csv', B.csv(rows));
        }
        if (t.id === 'pp-clear') {
          const el = B.modal('Clear your saved coffees?', html`<p class="muted">This removes all ${saved.length} saved coffees from this browser. Your stamps stay.</p><div class="row"><button class="btn primary" id="pp-clear-yes">Clear them</button><button class="btn ghost" data-close>Keep them</button></div>`);
          $('#pp-clear-yes', el).addEventListener('click', () => { B.lists.saved.clear(); B.store.set('saved', []); B.updateCounts(); B.closeOverlay(); B.go('passport', {}); });
        }
      });
    },
  };
  /* keep the passport in step when a heart is toggled while it is open */
  document.addEventListener('click', (e) => { if (e.target.closest('[data-save]') && B.route() === 'passport' && !document.querySelector('.drawer')) setTimeout(() => B.go('passport', {}), 0); });
})();
