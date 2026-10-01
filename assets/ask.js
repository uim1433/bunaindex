/* Buna Index: Ask Buna. Uses the viewer's own Claude through the page runtime, and only appears when that is available.
   Each question is answered from records the page picks out of the index, so the model never has to guess a coffee or a price. */
(function () {
  'use strict';
  const B = window.B, { $, $$, html, raw, int, plural, money, perLb, by, fold } = B;
  const SUG = {
    atlas: ['A washed Ethiopian for pour-over under $25', 'Something chocolatey that holds up in milk', 'Who roasts Kenyan coffee in Colorado?', 'What is in season right now?'],
    trade: ['Spot Ethiopian naturals under $8 a pound', 'Which importers sell Guatemalan lots in small packs?', 'Roasters in Texas who sell Colombian coffee', 'How do Kenyan green prices compare with Rwandan?'],
  };
  const RULES = 'You are Buna, the guide inside Buna Index, an index of specialty coffee listed for sale in the United States. Each question comes with records and notes taken from the index. Answer from those alone. '
    + 'Write names of coffees and businesses exactly as given so the page can link them. Quote prices as listed and treat them as read on the index date, not live. '
    + 'If the records do not answer the question, say what is missing and point to the part of the index that would help: Finder, Flavor, Near you, Field notes, Green offers, Price index, Directory or Tools. '
    + 'Never invent a coffee, a price, stock or a business. Plain text only, no markdown, no headings. Keep it under 140 words and name at most five records.';
  const STEMS = { ETH: ['ethiop'], KEN: ['kenya'], COL: ['colomb'], BRA: ['brazil'], GTM: ['guatemal'], MEX: ['mexic'], HND: ['hondur'], CRI: ['costa ric'], SLV: ['salvador'], NIC: ['nicarag'], PAN: ['panama'], PER: ['peru'], ECU: ['ecuador'], BOL: ['bolivi'],
    RWA: ['rwand'], BDI: ['burund'], TZA: ['tanzan'], UGA: ['ugand'], COD: ['congo'], YEM: ['yemen'], IND: ['india ', 'indian'], IDN: ['indones', 'sumatra', 'java', 'sulawesi'], PNG: ['papua'], VNM: ['vietnam'], THA: ['thai'], MMR: ['myanmar', 'burmese'], CHN: ['china', 'chinese', 'yunnan'],
    USA: ['hawaii', 'kona'], JAM: ['jamaica'], HTI: ['haiti'], DOM: ['dominican'], TLS: ['timor'], NPL: ['nepal'], MWI: ['malawi'], ZMB: ['zambia'], PRI: ['puerto ric'], VEN: ['venezuel'] };
  const PROC = [['Washed', /\bwashed\b/], ['Natural', /\bnatural|dry.process/], ['Honey', /\bhoney\b/], ['Anaerobic & experimental', /anaerobic|ferment|experimental|co-?ferment/], ['Wet-hulled', /wet.hulled|giling/]];
  const FAMW = { floral: /floral|jasmine|flower/, citrus: /citrus|lemon|orange|bright/, berry: /berr|fruity|blueberr|strawberr/, stone: /peach|apricot|stone fruit|apple/, tropical: /tropical|mango|pineapple/, dried: /wine|raisin|dried fruit/, sweet: /caramel|sweet|toffee|honeyed/, cocoa: /chocolat|cocoa|nutty|nuts?\b/, spice: /spic|tea.like|herbal/, earth: /earth|smok|bold|dark and/ };
  const stateOf = (q) => { const hit = B.STATES.find((s) => q.includes(fold(B.stName(s)))); return hit || null; };

  function parse(text, world) {
    const q = ' ' + fold(text) + ' ';
    const origins = Object.keys(STEMS).filter((id) => B.O[id] && STEMS[id].some((s) => q.includes(s)));
    let region = null, rOrigin = null;
    B.origins.forEach((o) => o.rg.forEach((r) => { const k = fold(r.n).split(/[ ,/&]+/)[0]; if (!region && k.length >= 4 && q.includes(k)) { region = r.n; rOrigin = o.id; } }));
    if (region && !origins.includes(rOrigin)) origins.push(rOrigin);
    const proc = (PROC.find((p) => p[1].test(q)) || [])[0] || null;
    const green = /\bgreen\b|unroasted|\blots?\b|importer|\bspot\b|afloat|forward|per bag|\bbags?\b of/.test(q) ? true : /roasted|retail|\bbag\b|brew|espresso|pour.over|drink/.test(q) ? false : world === 'trade';
    const m = /(under|below|less than|max|up to|cheaper than)\s*\$?\s*(\d+(?:\.\d+)?)/.exec(q), maxp = m ? +m[2] : null;
    const fams = Object.keys(FAMW).filter((f) => FAMW[f].test(q));
    const roast = /\blight\b/.test(q) ? ['Light', 'Light-medium'] : /\bdark\b/.test(q) ? ['Dark', 'Medium-dark'] : /\bmedium\b/.test(q) ? ['Medium', 'Light-medium', 'Medium-dark'] : null;
    const st = stateOf(q), city = B.cities.find((c) => c.city.length > 3 && q.includes(' ' + fold(c.city) + ' '));
    const biz = /roaster|caf[eé]|coffee shop|importer|wholesale|who (sells|roasts|imports)|where (can|to)|near|supplier|private label/.test(q);
    const type = /importer/.test(q) ? 'importer' : /caf[eé]|coffee shop/.test(q) ? 'cafe' : /roaster|who roasts/.test(q) ? 'roaster' : '';
    return { q, origins, region, proc, green, maxp, fams, roast, st, city: city ? city.key : null, biz, type, decaf: /decaf/.test(q), small: /small (pack|lot)|sample size|home roast|few pounds|1 ?lb|5 ?lb/.test(q), ws: /wholesale/.test(q), season: /season|fresh|harvest|new crop|right now/.test(q), price: /price|cost|cheap|expens|compare|median|worth/.test(q) };
  }
  function retrieve(p) {
    const words = p.q.trim().split(/\s+/).filter((w) => w.length > 3);
    const pass = (c, loose) => c.listed && (p.green ? c.k === 'g' : c.k === 'r') && (!p.origins.length || p.origins.includes(c.o)) && (!p.region || loose > 1 || (c.rg && c.rg.includes(p.region)))
      && (!p.proc || loose > 0 || c.p === p.proc) && (p.maxp == null || (c.ppl != null && c.ppl <= p.maxp)) && (!p.decaf || c.d) && (!p.small || !c.mlb || c.mlb <= 5)
      && (!p.roast || loose > 0 || !c.ro || p.roast.includes(c.ro)) && (!p.st || p.green || c.co.st === p.st) && (!p.city || p.green || c.co.city + ', ' + c.co.st === p.city);
    let list = [];
    for (let loose = 0; loose < 3 && list.length < 5; loose++) list = B.coffees.filter((c) => pass(c, loose));
    const score = (c) => (c.s === 'avail' ? 0 : c.s === 'unc' ? 2 : 4) + (c.ppl != null ? 0 : 2) + (p.fams.length ? (c.f && p.fams.some((f) => c.f.includes(f)) ? -3 : 0) : 0) + (c.tn ? -0.5 : 0) - words.filter((w) => c.text.includes(w)).length * 0.6;
    list = list.sort((a, b) => score(a) - score(b)).slice(0, 26);
    let cos = [];
    if (p.biz || p.st || p.city) {
      const tOk = (c) => !p.type || (p.type === 'roaster' ? B.isRoaster(c) : p.type === 'cafe' ? c.t === 'cafe' || c.t === 'roaster_cafe' : c.t === 'importer');
      cos = B.companies.filter((c) => tOk(c) && (!p.st || c.st === p.st) && (!p.city || c.city + ', ' + c.st === p.city) && (!p.origins.length || p.origins.some((o) => c.om.has(o))) && (!p.ws || c.ws))
        .sort((a, b) => (p.origins.length ? (b.om.get(p.origins[0]) || 0) - (a.om.get(p.origins[0]) || 0) : 0) || b.coffees.length - a.coffees.length).slice(0, 14);
    }
    return { list, cos };
  }
  function context(p, R) {
    const m = B.D.meta.counts, L = [];
    const g = B.summary(B.coffees.filter((c) => c.k === 'g' && c.listed && c.ppl != null && !c.d).map((c) => c.ppl)), r = B.summary(B.coffees.filter((c) => c.retail && c.listed).map((c) => c.ppl));
    L.push('INDEX: Buna Index dated ' + B.fmtDate(B.TODAY) + '. ' + int(m.listed) + ' listed coffees, ' + int(m.companies) + ' businesses, ' + m.origins + ' origins. Median list price: green ' + money(g.med) + '/lb (' + g.n + ' lots), roasted retail ' + money(r.med) + '/lb (' + r.n + ' bags of 8-16 oz).');
    if (p.season || !p.origins.length) {
      const pick = B.liveOrigins.filter((o) => o.n_listed && o.harvest && o.harvest.includes(B.NOW_MONTH)).map((o) => o.n), land = B.liveOrigins.filter((o) => o.n_listed && o.arrive && o.arrive.length < 12 && o.arrive.includes(B.NOW_MONTH)).map((o) => o.n);
      L.push('SEASON (' + B.MONTHS[B.NOW_MONTH - 1] + '): picking now: ' + pick.join(', ') + '. Fresh crop arriving in US warehouses now: ' + land.join(', ') + '.');
    }
    p.origins.slice(0, 3).forEach((id) => { const o = B.O[id], sg = B.originSummary(id, 'g'), sr = B.originSummary(id, 'r');
      L.push('ORIGIN ' + o.n + ': ' + (o.harvest ? B.harvestText(o) + ' ' : '') + (o.cup ? 'Typical cup: ' + o.cup + '. ' : '') + (o.proc ? 'Processing: ' + o.proc + '. ' : '') + 'In the index: ' + o.n_roast + ' roasted listings, ' + o.n_green + ' green lots' + (sr && sr.n >= 3 ? ', retail median ' + money(sr.med) + '/lb (' + sr.n + ' bags, ' + money(sr.min) + ' to ' + money(sr.max) + ')' : '') + (sg && sg.n >= 3 ? ', green median ' + money(sg.med) + '/lb (' + sg.n + ' lots, ' + money(sg.min) + ' to ' + money(sg.max) + ')' : '') + '.'); });
    if (R.list.length) {
      L.push((p.green ? 'GREEN LOTS' : 'ROASTED COFFEES') + ' (name | seller | origin | process | price | status | notes):');
      R.list.forEach((c) => L.push('- ' + [c.n, c.co.n + (c.co.city ? ', ' + c.co.city + ' ' + c.co.st : ''), (c.oo ? c.oo.n : c.o === 'BLEND' ? 'Blend' : '?') + (c.rg ? ' / ' + c.rg[0] : ''), c.p || '', c.k === 'g' ? (c.ppl != null ? perLb(c.ppl) + (c.mlb ? ' from ' + B.fmtLb(c.mlb) : '') : 'price on request') + (c.pos ? ', ' + B.POS[c.pos] : '') + (c.whs ? ', warehouse ' + c.whs : '') : (c.pr != null ? money(c.pr) + (c.lb ? ' for ' + B.fmtLb(c.lb) : '') + (c.ppl != null ? ' = ' + perLb(c.ppl) : '') : 'no price') + (c.ro ? ', ' + c.ro + ' roast' : ''), B.STATUS[c.s].label, (c.tn || '').slice(0, 90)].join(' | ')));
    } else L.push('No coffee records matched the question.');
    if (R.cos.length) { L.push('BUSINESSES (name | type | place | on record | origins | wholesale):'); R.cos.forEach((c) => L.push('- ' + [c.n, B.TYPE_LABEL[c.t] || '', c.city ? c.city + ', ' + c.st : 'place not on record', c.coffees.length + (c.t === 'importer' ? ' lots' : ' coffees'), c.origins.slice(0, 4).map((id) => B.O[id].n).join(', '), c.ws ? 'wholesale programme' : ''].join(' | '))); }
    return L.join('\n');
  }

  /* ---------- panel ---------- */
  let fab = null, panel = null, turns = [], ctl = null, busy = false, dead = false;
  const world = () => document.body.dataset.world || 'atlas';
  const MSG = { rate_limited: 'You have reached a usage limit for now. Try again a little later.', session_expired: 'Your Claude session has expired. Sign in again, then ask once more.', refused: 'Buna could not answer that one. Try putting it another way.', empty_completion: 'No answer came back. Try a simpler question.', prompt_too_large: 'That question brought back too much to read at once. Narrow it to one origin or one city.' };
  const GONE = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];

  function open() {
    if (panel) { $('#ask-in', panel).focus(); return; }
    panel = document.createElement('section'); panel.className = 'ask'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Ask Buna');
    panel.innerHTML = String(html`<div class="drawer-head"><b>Ask Buna</b><button class="icon-btn" id="ask-x" aria-label="Close">${raw(B.I.x)}</button></div>
      <div class="ask-body" id="ask-log" aria-live="polite"></div>
      <form class="ask-form" id="ask-f"><label class="grow"><span class="sr">Your question</span><input class="input" id="ask-in" autocomplete="off" placeholder="Ask about a coffee, an origin, a city"></label><button class="btn primary" id="ask-go" type="submit">Ask</button></form>`);
    document.body.appendChild(panel); fab.hidden = true;
    $('#ask-x', panel).addEventListener('click', close);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    B.onSubmit($('#ask-f', panel), () => { if (busy) { if (ctl) ctl.abort(); return; } const v = $('#ask-in', panel).value.trim(); if (v) ask(v); });
    panel.addEventListener('click', (e) => { const s = e.target.closest('[data-sug]'); if (s && !busy) ask(s.dataset.sug); });
    intro(); $('#ask-in', panel).focus();
  }
  function close() { if (ctl) ctl.abort(); if (panel) { panel.remove(); panel = null; } if (fab && !dead) { fab.hidden = false; fab.focus(); } }
  function intro() {
    if (!panel || turns.length) return;
    $('#ask-log', panel).innerHTML = String(html`<p class="muted">Ask in your own words. Buna answers from the records in this index and links the ones it names.</p>
      <div class="chips" id="ask-sug">${SUG[world()].map((s) => html`<button class="chip" data-sug="${s}">${s}</button>`)}</div>
      <p class="tiny faint">Answers are written by Claude on your own account and can be wrong. Open a record to check it against the seller’s page.</p>`);
  }
  function links(text, R) {
    const t = fold(text), out = [];
    R.list.forEach((c) => { if (out.length < 6 && fold(c.n).length > 5 && t.includes(fold(c.n))) out.push(html`<button class="chip" data-coffee="${c.id}">${c.n}</button>`); });
    R.cos.forEach((c) => { if (out.length < 8 && t.includes(fold(c.n))) out.push(html`<button class="chip" data-company="${c.i}">${c.n}</button>`); });
    return out;
  }
  async function ask(text) {
    const sample = B.cap.sample; if (!sample || busy) return;
    const log = $('#ask-log', panel), input = $('#ask-in', panel), go = $('#ask-go', panel);
    if (!turns.length) log.innerHTML = '';
    const p = parse(text, world()), R = retrieve(p);
    const q = document.createElement('p'); q.style.fontWeight = '650'; q.textContent = text;
    const a = document.createElement('div'); a.className = 'answer muted'; a.textContent = 'Reading ' + plural(R.list.length + R.cos.length, 'record') + '…';
    const extra = document.createElement('div'); extra.className = 'stack'; extra.style.setProperty('--gap', '6px');
    log.append(q, a, extra); log.scrollTop = log.scrollHeight;
    input.value = ''; busy = true; go.textContent = 'Stop'; ctl = new AbortController();
    const history = turns.slice(-4);
    try {
      const res = await sample([{ role: 'user', content: RULES }].concat(history, [{ role: 'user', content: 'Question: ' + text + '\n\n' + context(p, R) }]), {
        cache: false, signal: ctl.signal, onText: (u) => { a.classList.remove('muted'); a.textContent = u.text; log.scrollTop = log.scrollHeight; },
      });
      a.classList.remove('muted'); a.textContent = res.text;
      turns.push({ role: 'user', content: text }, { role: 'assistant', content: res.text });
      const ls = links(res.text, R);
      extra.innerHTML = String(html`${ls.length ? html`<div class="chips">${ls}</div>` : ''}${res.truncated ? html`<p class="small faint">The answer was cut short. Ask for less at a time.</p>` : ''}`);
    } catch (e) {
      const code = (e && e.code) || 'upstream_error';
      if (e && e.text && code !== 'refused') { a.classList.remove('muted'); a.textContent = e.text; } else if (code !== 'cancelled' || !a.textContent || a.classList.contains('muted')) a.textContent = '';
      if (GONE.includes(code)) { dead = true; extra.innerHTML = String(html`<p class="note">Ask Buna is not available in this view. Everything else on the page works without it.</p>`); input.disabled = true; go.disabled = true; }
      else if (code === 'cancelled') { if (!a.textContent) { q.remove(); a.remove(); extra.remove(); intro(); } }
      else extra.innerHTML = String(html`<p class="note warn">${MSG[code] || 'The answer was interrupted. Ask again in a moment.'}</p>`);
    } finally { busy = false; ctl = null; if (panel) { go.textContent = 'Ask'; log.scrollTop = log.scrollHeight; } }
  }

  B.askReady = function () {
    if (fab || dead) return;
    fab = document.createElement('button'); fab.className = 'btn primary ask-fab'; fab.id = 'ask-fab'; fab.type = 'button';
    fab.innerHTML = B.I.spark.replace('<svg', '<svg width="16" height="16"') + '<span>Ask Buna</span>';
    fab.addEventListener('click', open); document.body.appendChild(fab);
  };
  B.askSync = function () { if (panel && !turns.length && !busy) intro(); };
})();
