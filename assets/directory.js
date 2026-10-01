/* Buna Index: Directory (importers, roasters, cafés), contact routes, introductions */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, by, fold } = B;
  const PAGE = 40;
  const TYPES = [['', 'Everyone'], ['importer', 'Importers'], ['roaster', 'Roasters'], ['cafe', 'Cafés']];
  const typeOk = (c, t) => !t || (t === 'roaster' ? c.t === 'roaster' || c.t === 'roaster_cafe' : t === 'cafe' ? c.t === 'cafe' || c.t === 'roaster_cafe' : c.t === 'importer' || c.t === 'exporter');
  const FLAGS = [['ws', 'Wholesale programme'], ['pl', 'Private label'], ['sm', 'Sends samples'], ['green', 'Publishes green offers']];

  /* ---------- contact routes on a business profile (trade world) ---------- */
  B.contactBlock = (co) => html`<dl class="kv">
      ${co.web ? html`<dt>Website</dt><dd><a class="link ext" href="${B.safeUrl(co.web)}" target="_blank" rel="noopener">${B.host(co.web)}</a></dd>` : ''}
      ${co.cu && co.cu !== co.web ? html`<dt>Contact page</dt><dd><a class="link ext" href="${B.safeUrl(co.cu)}" target="_blank" rel="noopener">${B.host(co.cu)}</a></dd>` : ''}
      ${co.addr ? html`<dt>Address</dt><dd>${co.addr}${co.addr.includes(co.city || '~') ? '' : co.city ? ', ' + co.city + ', ' + (co.st || '') : ''}</dd>` : co.city ? html`<dt>City</dt><dd>${co.city}, ${co.st || ''}</dd>` : ''}
      ${co.ph ? html`<dt>Phone</dt><dd><span class="num" id="co-ph">${co.ph}</span> <button class="link small" data-copy="#co-ph">Copy</button></dd>` : ''}
      ${co.em ? html`<dt>Email</dt><dd>${B.can('pro') ? html`<span id="co-em">${co.em}</span> <button class="link small" data-copy="#co-em">Copy</button>` : html`<button class="link" data-reveal="1">Published address, shown to Pro members</button>`}</dd>`
        : co.he ? html`<dt>Email</dt><dd class="muted">On file. Shown to Pro members once membership opens.</dd>` : ''}
    </dl>
    <div class="row"><button class="btn primary sm" data-intro="${co.i}">Draft an introduction</button>${co.nGreen ? html`<button class="btn ghost sm" data-go="offers" data-params='${JSON.stringify({ reset: true, importer: co.i })}'>See their ${int(co.nGreen)} lots</button>` : ''}</div>`;

  const PURPOSE = [['wholesale', 'Ask a roaster for wholesale terms'], ['samples', 'Open an account and ask for samples'], ['offer', 'Introduce my green coffee to a roaster'], ['hello', 'A general introduction']];
  B.intro = function (i) {
    const co = B.companies[i], me = B.store.get('me', {}), role = B.role();
    const isImp = co.t === 'importer' || co.t === 'exporter';
    const def = isImp ? 'samples' : role === 'importer' ? 'offer' : role === 'cafe' ? 'wholesale' : 'hello';
    const orgs = co.origins.slice(0, 3).map((id) => B.O[id].n);
    const el = B.modal('Introduce yourself to ' + co.n, html`
      <form id="in-f" class="stack" style="--gap:12px">
        <div class="two" style="gap:12px"><label class="field"><span>Your name</span><input class="input" id="in-name" autocomplete="name" value="${me.name || ''}"></label>
          <label class="field"><span>Business</span><input class="input" id="in-biz" autocomplete="organization" value="${me.biz || ''}"></label>
          <label class="field"><span>City and state</span><input class="input" id="in-city" value="${me.city || ''}" placeholder="Denver, CO"></label>
          <label class="field"><span>Purpose</span><select class="select" id="in-why">${PURPOSE.map((p) => html`<option value="${p[0]}" ${p[0] === def ? raw('selected') : ''}>${p[1]}</option>`)}</select></label></div>
        <label class="field"><span>One line about your business (volume, what you sell, what you need)</span><input class="input" id="in-note"></label>
        <div class="row"><button class="btn primary" type="submit">Write it</button></div>
      </form>
      <div id="in-out" class="stack" style="--gap:10px" hidden><pre class="copy" id="in-text"></pre>
        <div class="row"><button class="btn primary" data-copy="#in-text">Copy</button>${co.cu || co.web ? html`<a class="btn ghost ext" href="${B.safeUrl(co.cu || co.web)}" target="_blank" rel="noopener">Open their ${co.cu ? 'contact page' : 'site'}</a>` : ''}</div>
        <p class="small muted">Nothing is sent from here. Paste it into their contact form or your own email and make it yours.</p></div>`);
    B.onSubmit($('#in-f', el), () => {
      const v = (id) => $(id, el).value.trim(), name = v('#in-name'), biz = v('#in-biz'), city = v('#in-city'), why = v('#in-why'), note = v('#in-note');
      B.store.set('me', Object.assign(B.store.get('me', {}), { name, biz, city }));
      const who = 'I am ' + (name || '[your name]') + (biz ? ' at ' + biz : '') + (city ? ' in ' + city : '') + '.';
      const seen = orgs.length ? ' I found you through the Buna Index, where your ' + (isImp ? 'lots' : 'coffees') + ' from ' + (orgs.length > 1 ? orgs.slice(0, -1).join(', ') + ' and ' + orgs[orgs.length - 1] : orgs[0]) + ' are listed.' : ' I found you through the Buna Index.';
      const ask = {
        wholesale: 'I am looking for a roaster to supply us wholesale. Could you send your wholesale price list, your minimum order and how often you deliver or ship? If you offer training or equipment support, I would like to hear about that too.',
        samples: 'I would like to open an account. Could you tell me what you need from a new customer, your minimums and payment terms, and how to request samples from your current offer list?',
        offer: 'We import green coffee and I think some of our current lots fit your menu. May I send our offer list and a few samples? Tell me what you are looking for this season and I will keep it to that.',
        hello: 'I wanted to introduce myself and ask who the right person is to speak with about working together.',
      }[why];
      $('#in-text', el).textContent = ['Hello ' + co.n + ' team,', '', who + seen, '', ask, note ? '\n' + note : null, '', 'Thank you,', name || '[your name]', biz || null].filter((x) => x !== null).join('\n');
      $('#in-out', el).hidden = false; $('#in-out', el).scrollIntoView({ block: 'nearest' });
    });
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-intro],[data-reveal]'); if (!t) return;
    if (t.dataset.intro) return B.intro(+t.dataset.intro);
    if (t.dataset.reveal) return void B.gate('pro', 'Seeing the email addresses businesses publish');
  });

  /* ---------- directory view ---------- */
  function rows(st) {
    const words = fold((st.q || '').trim()).split(/\s+/).filter(Boolean);
    return B.companies.filter((c) => typeOk(c, st.type) && (!st.state || c.st === st.state) && (!st.city || c.city + ', ' + c.st === st.city) && (!st.origin || c.om.has(st.origin))
      && (!st.ws || c.ws) && (!st.pl || c.pl) && (!st.sm || c.sm) && (!st.green || c.nGreen > 0) && words.every((w) => c.text.includes(w)));
  }
  const services = (c) => html`${c.ws ? html`<span class="tag cert">Wholesale</span> ` : ''}${c.pl ? html`<span class="tag cert">Private label</span> ` : ''}${c.sm ? html`<span class="tag cert">Samples</span> ` : ''}${c.nGreen ? html`<span class="tag">Green offers</span>` : ''}`;
  const routes = (c) => [c.web && 'Site', c.em && 'Email', c.ph && 'Phone', c.cu && c.cu !== c.web && 'Contact page'].filter(Boolean).join(' · ');
  const onRecord = (c, st) => { const n = st.origin ? c.om.get(st.origin) : c.coffees.length; return n ? plural(n, c.t === 'importer' ? 'lot' : 'coffee') : ''; };

  B.views.directory = {
    render(main, st) {
      st.type = st.type || ''; st.state = st.state || ''; st.origin = st.origin || ''; st.q = st.q || ''; st.sort = st.sort || 'rec'; st.n = st.n || PAGE;
      const wide = window.innerWidth >= 760;
      main.innerHTML = String(html`<div class="wrap">
        <div class="stack" style="--gap:6px;margin-bottom:16px"><h1 style="font-size:clamp(28px,3.6vw,42px)">Directory</h1>
          <p class="muted" style="max-width:80ch">${int(B.companies.length)} importers, roasters and cafés. Filter by what they sell and where they are, then open a profile for the ways to reach them.</p></div>
        <div class="row" style="margin-bottom:10px"><label class="search grow" style="min-width:220px;max-width:520px"><span class="sr">Search businesses</span>${raw(B.I.search)}<input class="input" id="dr-q" type="search" placeholder="Business or city" value="${st.q}" autocomplete="off"></label>
          <div class="seg" role="group" aria-label="Type of business">${TYPES.map((t) => html`<button data-type="${t[0]}" aria-pressed="${st.type === t[0]}">${t[1]}</button>`)}</div>
          <button class="btn ghost fold-toggle" id="dr-toggle" aria-expanded="false">Filters</button></div>
        <div class="fbar fold" id="dr-f">
          <label class="field"><span>State</span><select class="select" id="dr-state"><option value="">Any state</option>${B.STATES.map((s) => html`<option value="${s}" ${st.state === s ? raw('selected') : ''}>${B.stName(s)}</option>`)}</select></label>
          <label class="field"><span>Sells or offers coffee from</span><select class="select" id="dr-origin"><option value="">Any origin</option>${B.liveOrigins.map((o) => html`<option value="${o.id}" ${st.origin === o.id ? raw('selected') : ''}>${o.n}</option>`)}</select></label>
          <div class="field wide2"><span>Only businesses that</span><div class="row" style="--gap:6px 16px">${FLAGS.map((f) => html`<label class="check"><input type="checkbox" data-flag="${f[0]}" ${st[f[0]] ? raw('checked') : ''}> ${f[1]}</label>`)}</div></div>
        </div>
        <div class="toolbar"><div class="row" style="--gap:8px 12px"><b id="dr-count" role="status" aria-live="polite"></b><span class="chips" id="dr-active"></span></div>
          <div class="row" style="--gap:8px"><label class="row nowrap" style="--gap:6px"><span class="small muted">Sort</span><select class="select" id="dr-sort" style="min-height:32px;width:auto"><option value="rec" ${st.sort === 'rec' ? raw('selected') : ''}>Most on record</option><option value="az" ${st.sort === 'az' ? raw('selected') : ''}>Name, A to Z</option><option value="st" ${st.sort === 'st' ? raw('selected') : ''}>State, then city</option></select></label>
            <button class="btn ghost sm" id="dr-export">Export this list${B.can('trade') ? '' : html` <span class="tag">Trade</span>`}</button></div></div>
        <div class="places" style="grid-template-columns:${wide && B.geo.ok ? 'minmax(0,7fr) minmax(0,5fr)' : 'minmax(0,1fr)'}">
          <div id="dr-out"></div>
          ${wide && B.geo.ok ? html`<aside class="stack" style="--gap:8px;position:sticky;top:calc(var(--bar) + 14px)"><div class="map-box panel" id="dr-map" style="padding:6px"><div class="globe-ui br" style="bottom:10px;right:10px"><button class="gbtn" id="dr-in" aria-label="Zoom in">+</button><button class="gbtn" id="dr-out2" aria-label="Zoom out">&minus;</button><button class="gbtn" id="dr-reset" aria-label="Whole country">&#8962;</button></div></div>
            <p class="small faint">The map follows the filters. Tap a state or a city to narrow the list to it.</p></aside>` : ''}
        </div></div>`);

      let list = [], map = null;
      const out = $('#dr-out', main);
      function update(refocus) {
        list = rows(st);
        if (st.sort === 'az') list.sort(by((c) => fold(c.n)));
        else if (st.sort === 'st') list.sort((a, b) => ((a.st || 'ZZ') + (a.city || '') < (b.st || 'ZZ') + (b.city || '') ? -1 : 1));
        else list.sort((a, b) => (st.origin ? (b.om.get(st.origin) || 0) - (a.om.get(st.origin) || 0) : 0) || b.coffees.length - a.coffees.length || (a.n < b.n ? -1 : 1));
        $('#dr-count', main).textContent = plural(list.length, 'business', 'businesses');
        const a = [];
        if (st.city) a.push(html`<button class="chip x" data-clear="city">${st.city}</button>`);
        if (st.type || st.state || st.origin || st.q || st.city || FLAGS.some((f) => st[f[0]])) a.push(html`<button class="link small" data-clear="all" style="align-self:center">Clear filters</button>`);
        $('#dr-active', main).innerHTML = String(html`${a}`);
        const page = list.slice(0, st.n);
        out.innerHTML = String(!list.length ? html`<div class="empty"><b>No business matches all of that.</b>Take a filter off, or search a name.<div class="row" style="margin-top:12px"><button class="btn ghost sm" data-clear="all">Clear filters</button></div></div>`
          : html`${wide ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Business</th><th>Where</th><th style="min-width:190px">On record</th><th>Services</th><th>Ways to reach them</th></tr></thead>
              <tbody>${page.map((c) => html`<tr><td class="lot"><button data-company="${c.i}">${c.n}</button><span class="sub">${B.TYPE_LABEL[c.t] || ''}${c.tu ? ', not verified' : ''}</span></td>
                <td class="nw">${c.city ? c.city + ', ' + c.st : html`<span class="faint">Not on record</span>`}</td>
                <td>${onRecord(c, st)}${c.origins.length ? html`<span class="sub">${c.origins.slice(0, 3).map((id) => B.O[id].n).join(', ')}${c.origins.length > 3 ? ' +' + (c.origins.length - 3) : ''}</span>` : ''}</td>
                <td>${services(c)}</td><td class="small muted">${routes(c)}</td></tr>`)}</tbody></table></div>`
            : html`<ul class="biz">${page.map((c) => html`<li><button class="name" data-company="${c.i}">${c.n}</button><span class="small faint num">${onRecord(c, st)}</span><span class="sub">${B.TYPE_LABEL[c.t] || ''}${c.city ? ' · ' + c.city + ', ' + c.st : ''} ${services(c)}</span></li>`)}</ul>`}
            ${list.length > st.n ? html`<div class="more"><button class="btn ghost" id="dr-more">Show ${Math.min(PAGE, list.length - st.n)} more of ${int(list.length - st.n)}</button></div>` : ''}`);
        const more = $('#dr-more', main); if (more) more.addEventListener('click', () => { st.n += PAGE; update(); });
        if (map) {
          const m = new Map();
          rows(Object.assign({}, st, { city: '' })).forEach((c) => { if (!c.pt || !c.city || !c.st) return; const k = c.city + ', ' + c.st; const g = m.get(k) || { key: k, pt: B.cityMap.get(k).pt, v: 0 }; g.v++; m.set(k, g); });
          map.set(Array.from(m.values()), []); map.select(st.city || null, st.state || null);
          if (refocus) { if (st.city && B.cityMap.has(st.city)) map.focusPoint(B.cityMap.get(st.city).pt, 6); else if (st.state) map.focusState(st.state); else map.reset(); }
        }
      }
      const change = (refocus) => { st.n = PAGE; update(refocus); };
      if (wide && B.geo.ok) {
        map = B.geo.USMap($('#dr-map', main), {
          onState: (id) => { st.state = st.state === id ? '' : id; st.city = ''; $('#dr-state', main).value = st.state; change(true); },
          stateTip: (id) => plural(rows(Object.assign({}, st, { state: id, city: '' })).length, 'business', 'businesses'),
          onCity: (key) => { st.city = st.city === key ? '' : key; if (st.city) { st.state = B.cityMap.get(key).st; $('#dr-state', main).value = st.state; } change(true); },
          cityTip: (c) => plural(c.v, 'business', 'businesses'),
        });
        $('#dr-in', main).addEventListener('click', () => map.zoomBy(1.7));
        $('#dr-out2', main).addEventListener('click', () => map.zoomBy(1 / 1.7));
        $('#dr-reset', main).addEventListener('click', () => { st.state = ''; st.city = ''; $('#dr-state', main).value = ''; change(true); });
      }
      $('#dr-q', main).addEventListener('input', B.debounce((e) => { st.q = e.target.value; change(); }, 140));
      $('#dr-state', main).addEventListener('change', (e) => { st.state = e.target.value; st.city = ''; change(true); });
      $('#dr-origin', main).addEventListener('change', (e) => { st.origin = e.target.value; change(); });
      $('#dr-sort', main).addEventListener('change', (e) => { st.sort = e.target.value; change(); });
      main.addEventListener('change', (e) => { if (e.target.dataset.flag) { st[e.target.dataset.flag] = e.target.checked; change(); } });
      main.addEventListener('click', (e) => {
        const t = e.target.closest('[data-type],[data-clear],#dr-export,#dr-toggle'); if (!t) return;
        if ('type' in t.dataset) { st.type = t.dataset.type; $$('[data-type]', main).forEach((b) => b.setAttribute('aria-pressed', b.dataset.type === st.type)); return change(); }
        if (t.dataset.clear === 'city') { st.city = ''; return change(true); }
        if (t.dataset.clear === 'all') { const keep = { sort: st.sort }; Object.keys(st).forEach((k) => delete st[k]); Object.assign(st, keep); return B.go('directory', {}); }
        if (t.id === 'dr-toggle') { const open = $('#dr-f', main).classList.toggle('open'); t.setAttribute('aria-expanded', open); return; }
        if (t.id === 'dr-export') {
          if (!B.gate('trade', 'Exporting a prospect list')) return;
          const head = [['Business', 'Type', 'City', 'State', 'Website', 'Contact page', 'Phone', 'Wholesale programme', 'Private label', 'Samples', 'Coffees or lots on record', 'Top origins', 'Checked']];
          return B.exportFile('buna-index-directory.csv', B.csv(head.concat(list.map((c) => [c.n, B.TYPE_LABEL[c.t], c.city, c.st, c.web, c.cu, c.ph, c.ws ? 'yes' : '', c.pl ? 'yes' : '', c.sm ? 'yes' : '', c.coffees.length, c.origins.slice(0, 5).map((id) => B.O[id].n).join('; '), c.chk]))));
        }
      });
      update(!!(st.state || st.city));
    },
  };
})();
