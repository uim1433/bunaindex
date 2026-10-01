/* Buna Index: map geometry, the globe (canvas) and the US map (SVG). Needs d3 v7. */
(function () {
  'use strict';
  const B = window.B, G = window.BUNA_GEO, d3 = window.d3;
  const geo = (B.geo = { ok: !!(d3 && G) });
  if (!geo.ok) return;
  const RAD = Math.PI / 180;

  /* ---------- decode ---------- */
  function ring(a) {
    const q = G.q, out = new Array(a.length / 2);
    let x = a[0], y = a[1]; out[0] = [x / q, y / q];
    for (let i = 2, j = 1; i < a.length; i += 2, j++) { x += a[i]; y += a[i + 1]; out[j] = [x / q, y / q]; }
    const f = out[0], l = out[out.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]);
    return out;
  }
  function multi(g) {
    // d3 wants clockwise exterior rings on the sphere; fix any polygon that reads as "everything but"
    const polys = g.map((p) => p.map(ring));
    polys.forEach((p) => { if (d3.geoArea({ type: 'Polygon', coordinates: p }) > 2 * Math.PI) p.forEach((r) => r.reverse()); });
    return { type: 'MultiPolygon', coordinates: polys };
  }
  function feat(d) {
    const geometry = multi(d.g), f = { type: 'Feature', id: d.id || d.k, properties: d, geometry };
    f.c = d.lb || d.ct || d3.geoCentroid(f);
    const b = d3.geoBounds(f);
    f.rad = Math.max(d3.geoDistance(f.c, b[0]), d3.geoDistance(f.c, b[1]), d3.geoDistance(f.c, [b[0][0], b[1][1]]), d3.geoDistance(f.c, [b[1][0], b[0][1]]));
    return f;
  }
  const w110 = G.world110.map(feat), w50 = G.world50.map(feat);
  const byA3 = {}; w50.forEach((f) => (byA3[f.id] = f));
  const byA3lo = {}; w110.forEach((f) => (byA3lo[f.id] = f));
  const admin = {}; G.admin1.forEach((d) => (admin[d.k] = feat(d)));
  const lakes110 = { type: 'MultiPolygon', coordinates: G.lakes110.map((p) => p.map(ring)) };
  const lakes50 = { type: 'MultiPolygon', coordinates: G.lakes50.map((p) => p.map(ring)) };
  [lakes110, lakes50].forEach((m) => m.coordinates.forEach((p) => { if (d3.geoArea({ type: 'Polygon', coordinates: p }) > 2 * Math.PI) p.forEach((r) => r.reverse()); }));
  const usStates = G.us.map(feat);
  geo.byA3 = byA3; geo.usStates = usStates;

  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function palette() {
    const p = {};
    ['--bg', '--surface', '--ink', '--ink2', '--ink3', '--line', '--line2', '--cherry', '--leaf', '--honey', '--ocean', '--land', '--land-line', '--halo', '--c0', '--c1', '--c2', '--c3', '--c4', '--c5', '--accent'].forEach((k) => (p[k.slice(2)] = css(k)));
    return p;
  }

  /* origin focus: where the globe turns to and how far it zooms */
  function focusOf(o) {
    if (o.focus) return { c: [o.focus[0], o.focus[1]], k: o.focus[2] };
    const f = byA3[o.a3]; if (!f) return { c: [0, 0], k: 1 };
    const b = d3.geoBounds(f);
    let w = b[1][0] - b[0][0]; if (w < 0) w += 360;
    const hgt = b[1][1] - b[0][1], span = Math.max(w * Math.cos(((b[0][1] + b[1][1]) / 2) * RAD), hgt, 2.2);
    return { c: [b[0][0] + w / 2, (b[0][1] + b[1][1]) / 2], k: Math.max(1.6, Math.min(16, 72 / span)) };
  }
  geo.focusOf = focusOf;

  /* ====================================================================== GLOBE */
  geo.Globe = function (canvas, opt) {
    const ctx = canvas.getContext('2d');
    const proj = d3.geoOrthographic().clipAngle(90).precision(0.3);
    const path = d3.geoPath(proj, ctx);
    const grat = d3.geoGraticule().step([20, 20])();
    let W = 0, H = 0, dpr = 1, R0 = 100, pal = palette();
    const S = {
      rot: [-18, -8], k: 1, mode: 'index', month: B.NOW_MONTH, origin: null, region: null,
      arcs: [], arcT: 1, hover: null, dragging: false, spin: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, spinEnd: performance.now() + 40000,
    };
    const originFeat = new Map();     // origin id -> feature
    B.origins.forEach((o) => { const f = byA3[o.a3]; if (f && o.id !== 'USA') originFeat.set(o.id, f); });
    const a3Origin = {}; B.origins.forEach((o) => { if (o.id !== 'USA') a3Origin[o.a3] = o; });
    const maxN = Math.max.apply(null, B.origins.map((o) => o.n_listed));
    const ramp = (n) => { if (!n) return pal.c0; const t = Math.log(1 + n) / Math.log(1 + maxN); return [pal.c1, pal.c2, pal.c3, pal.c4, pal.c5][Math.min(4, Math.floor(t * 5))]; };
    function harvestState(o, m) {
      if (o.harvest && o.harvest.includes(m)) return 'h';
      if (o.fly && o.fly.includes(m)) return 'f';
      if (o.arrive && o.arrive.includes(m) && o.arrive.length < 12) return 'a';
      return null;
    }
    geo.harvestState = harvestState;
    function fillFor(o) {
      if (S.mode === 'harvest') { const s = harvestState(o, S.month); return s === 'h' ? pal.cherry : s === 'f' ? pal.c2 : s === 'a' ? pal.leaf : pal.c0; }
      return ramp(o.n_listed);
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(200, r.width); H = Math.max(200, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      R0 = Math.min(W, H) / 2 - 10;
      draw();
    }
    function visible(f, cap) {
      const c = [-S.rot[0], -S.rot[1]];
      return d3.geoDistance(c, f.c) < cap + f.rad;
    }
    function lift(p, hgt, rotate, R) {
      const r = rotate(p), l = r[0] * RAD, f = r[1] * RAD;
      const x = Math.cos(f) * Math.sin(l), y = Math.sin(f), z = Math.cos(f) * Math.cos(l), s = 1 + hgt;
      return { x: W / 2 + x * R * s, y: H / 2 - y * R * s, v: z > 0 || Math.hypot(x, y) * s > 1.001 };
    }
    function pt(p) {              // surface point -> screen, null when on the far side
      const c = [-S.rot[0], -S.rot[1]];
      if (d3.geoDistance(c, p) > Math.PI / 2 - 0.02) return null;
      return proj(p);
    }

    function label(txt, x, y, tw, strong, alpha) {      // text on a small plate so it reads over any fill
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - 4, y - 9.5, tw + 8, 19, 4); else ctx.rect(x - 4, y - 9.5, tw + 8, 19);
      ctx.fillStyle = strong ? pal.ink : pal.surface; ctx.globalAlpha = strong ? 1 : 0.88; ctx.fill(); ctx.globalAlpha = alpha;
      ctx.fillStyle = strong ? pal.bg : pal.ink; ctx.fillText(txt, x, y + 0.5); ctx.globalAlpha = 1;
    }
    function draw() {
      if (!W) return;
      const R = R0 * S.k;
      proj.scale(R).translate([W / 2, H / 2]).rotate(S.rot);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cap = S.k <= 1 ? Math.PI / 2 : Math.min(Math.PI / 2, Math.asin(Math.min(1, Math.hypot(W, H) / 2 / R)) + 0.05);
      const hi = S.k >= 1.7;
      const land = (hi ? w50 : w110).filter((f) => visible(f, cap));
      // halo + sphere
      if (S.k <= 1.25) { ctx.beginPath(); ctx.arc(W / 2, H / 2, R + 9, 0, 7); ctx.fillStyle = pal.halo; ctx.fill(); }
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = pal.ocean; ctx.fill();
      ctx.beginPath(); path(grat); ctx.strokeStyle = pal['land-line']; ctx.globalAlpha = 0.45; ctx.lineWidth = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
      // land: non-origin countries in one pass
      ctx.beginPath();
      land.forEach((f) => { if (!a3Origin[f.id] || f.id === 'USA') path(f); });
      ctx.fillStyle = pal.land; ctx.fill();
      ctx.strokeStyle = pal['land-line']; ctx.lineWidth = hi ? 0.8 : 0.5; ctx.stroke();
      // origin countries
      land.forEach((f) => {
        const o = a3Origin[f.id]; if (!o) return;
        ctx.beginPath(); path(f);
        ctx.fillStyle = fillFor(o);
        if (S.origin && S.origin !== o.id && S.mode !== 'harvest') ctx.globalAlpha = 0.5;
        ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = pal['land-line']; ctx.lineWidth = hi ? 0.9 : 0.6; ctx.stroke();
      });
      // lakes
      ctx.beginPath(); path(hi ? lakes50 : lakes110); ctx.fillStyle = pal.ocean; ctx.fill();
      // hover + selection outlines
      const sel = S.origin && originFeat.get(S.origin);
      if (S.hover && S.hover.type === 'origin' && S.hover.id !== S.origin) {
        const f = originFeat.get(S.hover.id);
        if (f) { ctx.beginPath(); path(hi ? f : byA3lo[f.id] || f); ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.4; ctx.stroke(); }
      }
      if (sel) { ctx.beginPath(); path(sel); ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.8; ctx.stroke(); }
      // Hawaii marker (an origin without its own country shape)
      const hw = B.O.USA;
      if (hw && hw.n_all) {
        const p = pt([-155.6, 19.7]);
        if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], S.origin === 'USA' ? 0 : Math.max(5, 3.5 * Math.sqrt(S.k)), 0, 7); ctx.fillStyle = fillFor(hw); ctx.fill(); ctx.strokeStyle = pal.ink; ctx.lineWidth = 1; ctx.stroke(); }
      }
      // regions of the selected origin (left out while the globe is pulled back to show arcs)
      if (S.origin && !(S.arcs.length && S.k < 1.6)) {
        const o = B.O[S.origin];
        o.rg.forEach((r) => {
          const a = admin[r.key]; if (!a) return;
          const on = S.region === r.n, hov = S.hover && S.hover.type === 'region' && S.hover.id === r.n;
          ctx.beginPath(); path(a);
          ctx.fillStyle = pal.ink; ctx.globalAlpha = on ? 0.34 : hov ? 0.22 : r.count ? 0.1 : 0.03; ctx.fill(); ctx.globalAlpha = 1;
          ctx.strokeStyle = pal.ink; ctx.lineWidth = on ? 1.6 : 0.6; ctx.globalAlpha = on ? 1 : 0.5; ctx.stroke(); ctx.globalAlpha = 1;
        });
        const boxes = [];
        ctx.font = '600 12px ' + css('--ui'); ctx.textBaseline = 'middle';
        o.rg.slice().sort((a, b) => (b.n === S.region) - (a.n === S.region) || b.count - a.count).forEach((r) => {
          if (!r.pt) return; const p = pt(r.pt); if (!p) return;
          const on = S.region === r.n, hov = S.hover && S.hover.type === 'region' && S.hover.id === r.n;
          const rad = on ? 7 : r.count ? 5 : 3.2;
          ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 7);
          ctx.fillStyle = on ? pal.ink : r.count ? pal.surface : pal.land; ctx.fill();
          ctx.strokeStyle = pal.ink; ctx.lineWidth = on || hov ? 2.2 : 1.3; ctx.stroke();
          r._s = [p[0], p[1], rad + 5];
          if (S.k < 2.2 && !on && !hov) return;
          const txt = r.n.length > 24 ? r.n.slice(0, 23) + '…' : r.n, tw = ctx.measureText(txt).width;
          const right = p[0] + rad + 6 + tw < W - 4;
          const bx = right ? p[0] + rad + 5 : p[0] - rad - 5 - tw, box = [bx - 2, p[1] - 9, tw + 4, 18];
          if (!on && !hov && boxes.some((b) => box[0] < b[0] + b[2] && box[0] + box[2] > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1])) return;
          boxes.push(box);
          label(txt, bx, p[1], tw, on, r.count || on ? 1 : 0.7);
        });
      }
      // arcs to US cities
      if (S.arcs.length) {
        const rotate = d3.geoRotation(S.rot);
        ctx.lineCap = 'round';
        S.arcs.forEach((a, i) => {
          const n = 48, prog = Math.max(0, Math.min(1, S.arcT * 1.35 - (i / S.arcs.length) * 0.35));
          const upto = Math.floor(prog * n);
          ctx.beginPath(); let pen = false;
          for (let j = 0; j <= upto; j++) {
            const t = j / n, q = lift(a.ip(t), a.h * Math.sin(Math.PI * t), rotate, R);
            if (!q.v) { pen = false; continue; }
            if (pen) ctx.lineTo(q.x, q.y); else { ctx.moveTo(q.x, q.y); pen = true; }
          }
          const hov = S.hover && S.hover.type === 'city' && S.hover.id === a.city.key;
          ctx.strokeStyle = pal.cherry; ctx.globalAlpha = hov ? 1 : 0.55; ctx.lineWidth = hov ? 2.4 : 1.1 + Math.min(2.2, a.n / 14); ctx.stroke(); ctx.globalAlpha = 1;
          const p = pt(a.to);
          if (p && prog >= 1) {
            const rad = 3 + Math.min(7, Math.sqrt(a.n) * 1.1);
            ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 7); ctx.fillStyle = pal.honey; ctx.fill(); ctx.strokeStyle = pal.ink; ctx.lineWidth = hov ? 2 : 1; ctx.stroke();
            a._s = [p[0], p[1], rad + 5];
          } else a._s = null;
        });
        const from = pt(S.arcFrom);
        if (from) { ctx.beginPath(); ctx.arc(from[0], from[1], 6, 0, 7); ctx.fillStyle = pal.cherry; ctx.fill(); ctx.strokeStyle = pal.surface; ctx.lineWidth = 2; ctx.stroke(); }
        if (S.arcT >= 1) {
          ctx.font = '600 12px ' + css('--ui'); ctx.textBaseline = 'middle';
          const boxes = [];
          const put = (txt, p, rad, strong) => {
            const tw = ctx.measureText(txt).width, right = p[0] + rad + 8 + tw < W - 4, bx = right ? p[0] + rad + 7 : p[0] - rad - 7 - tw, box = [bx - 4, p[1] - 10, tw + 8, 20];
            if (boxes.some((b) => box[0] < b[0] + b[2] && box[0] + box[2] > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1])) return;
            boxes.push(box); label(txt, bx, p[1], tw, strong, 1);
          };
          if (from) put(S.arcLabel, from, 6, true);
          S.arcs.slice(0, 6).forEach((a) => { if (a._s) put(a.city.city, a._s, a._s[2] - 5, false); });
        }
      }
      // rim
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = pal.line2; ctx.lineWidth = 1; ctx.stroke();
    }

    /* ---- animation ---- */
    let raf = 0, anim = null, last = 0;
    function tick(t) {
      raf = 0;
      const dt = Math.min(64, t - (last || t)); last = t;
      let again = false;
      if (anim) {
        const u = Math.min(1, (t - anim.t0) / anim.dur), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        S.rot = [anim.r(e)[0], anim.r(e)[1]]; S.k = anim.k0 + (anim.k1 - anim.k0) * e;
        if (u >= 1) { const done = anim.done; anim = null; if (done) done(); } else again = true;
      } else if (S.spin && !S.dragging && !S.origin && S.k <= 1.05 && !document.hidden && t < S.spinEnd) { S.rot = [S.rot[0] + dt * 0.006, S.rot[1]]; again = true; }   // a slow turn that stops by itself
      if (S.arcT < 1) { S.arcT = Math.min(1, S.arcT + dt / 1500); again = true; }
      draw();
      if (again) kick();
    }
    function kick() { if (!raf) raf = requestAnimationFrame(tick); }
    function flyTo(c, k, done) {
      const target = [-c[0], -c[1]];
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { S.rot = target; S.k = k; draw(); if (done) done(); return; }
      anim = { t0: performance.now(), dur: 950, r: d3.interpolate(S.rot, [S.rot[0] + ((((target[0] - S.rot[0]) % 360) + 540) % 360) - 180, target[1]]), k0: S.k, k1: k, done };
      last = 0; kick();
    }

    /* ---- hit testing ---- */
    function hit(x, y) {
      const near = (s) => s && Math.hypot(x - s[0], y - s[1]) <= s[2];
      for (const a of S.arcs) if (near(a._s)) return { type: 'city', id: a.city.key, arc: a };
      if (S.origin) {
        const o = B.O[S.origin];
        for (const r of o.rg) if (near(r._s)) return { type: 'region', id: r.n, r };
      }
      const ll = proj.invert([x, y]);
      if (!ll || Math.hypot(x - W / 2, y - H / 2) > R0 * S.k) return null;
      if (S.origin) {
        const o = B.O[S.origin];
        for (const r of o.rg) { const a = admin[r.key]; if (a && d3.geoContains(a, ll)) return { type: 'region', id: r.n, r }; }
      }
      const hw = B.O.USA;
      if (hw && hw.n_all && d3.geoDistance(ll, [-155.6, 19.7]) < 0.07 / Math.sqrt(S.k)) return { type: 'origin', id: 'USA' };
      for (const [id, f] of originFeat) if (d3.geoDistance(ll, f.c) < f.rad + 0.01 && d3.geoContains(f, ll)) return { type: 'origin', id };
      return null;
    }
    function tipFor(h) {
      if (h.type === 'origin') { const o = B.O[h.id]; const st = S.mode === 'harvest' ? { h: 'Main harvest', f: 'Second harvest', a: 'Fresh crop arriving in the US' }[harvestState(o, S.month)] || 'Between harvests' : B.plural(o.n_listed, 'listed coffee'); return B.html`<b>${o.n}</b>${st}${S.mode === 'harvest' ? ' in ' + B.MONTHS[S.month - 1] : ''}`; }
      if (h.type === 'region') return B.html`<b>${h.r.n}</b>${h.r.count ? B.plural(h.r.count, 'coffee') + ' in the index' : 'No coffees recorded yet'}`;
      if (h.type === 'city') return B.html`<b>${h.arc.city.key}</b>${B.plural(h.arc.n, 'coffee')} from ${B.O[S.origin].n} sold here`;
      return '';
    }

    /* ---- pointer ---- */
    const pts = new Map(); let down = null, pinch = null;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      S.spin = false;
      if (pts.size === 1) down = { x: e.clientX, y: e.clientY, rot: S.rot.slice(), moved: false };
      else if (pts.size === 2) { const a = Array.from(pts.values()); pinch = { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), k: S.k }; down = null; }
    });
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size === 2) {
        const a = Array.from(pts.values()), d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
        S.k = Math.max(0.9, Math.min(22, pinch.k * d / pinch.d)); anim = null; draw(); return;
      }
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!down.moved && Math.hypot(dx, dy) < 4) return;
        down.moved = true; S.dragging = true; canvas.classList.add('dragging'); anim = null; B.tip.hide();
        const f = 0.32 / S.k * (360 / (R0 * 2)) * 2;
        S.rot = [down.rot[0] + dx * f, Math.max(-80, Math.min(80, down.rot[1] - dy * f))];
        draw(); return;
      }
      if (e.pointerType === 'touch') return;
      const h = hit(x, y), key = h ? h.type + h.id : '';
      if (key !== (S.hover ? S.hover.type + S.hover.id : '')) { S.hover = h; draw(); }
      canvas.style.cursor = h ? 'pointer' : 'grab';
      if (h) B.tip.show(tipFor(h), e.clientX, e.clientY); else B.tip.hide();
    });
    function up(e) {
      const wasDrag = down && down.moved;
      pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
      S.dragging = false; canvas.classList.remove('dragging');
      if (down && !wasDrag) {
        const r = canvas.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top);
        if (h && opt.onPick) opt.onPick(h);
        else if (!h && e.pointerType === 'touch') B.tip.hide();
      }
      down = null;
    }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', () => { if (!down) { S.hover = null; B.tip.hide(); draw(); } });
    canvas.addEventListener('dblclick', (e) => { e.preventDefault(); api.zoom(1.6); });
    canvas.addEventListener('keydown', (e) => {
      const step = 12 / S.k;
      if (e.key === 'ArrowLeft') S.rot[0] += step; else if (e.key === 'ArrowRight') S.rot[0] -= step;
      else if (e.key === 'ArrowUp') S.rot[1] = Math.max(-80, S.rot[1] - step); else if (e.key === 'ArrowDown') S.rot[1] = Math.min(80, S.rot[1] + step);
      else if (e.key === '+' || e.key === '=') { api.zoom(1.4); return; } else if (e.key === '-') { api.zoom(1 / 1.4); return; } else return;
      e.preventDefault(); S.spin = false; draw();
    });

    const ro = new ResizeObserver(resize); ro.observe(canvas);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => { pal = palette(); draw(); };
    mq.addEventListener('change', onTheme);
    const mo = new MutationObserver(onTheme); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const onWorld = new MutationObserver(onTheme); onWorld.observe(document.body, { attributes: true, attributeFilter: ['data-world'] });

    const api = {
      state: S, draw,
      zoom(f) { S.spin = false; anim = { t0: performance.now(), dur: 300, r: () => S.rot, k0: S.k, k1: Math.max(0.9, Math.min(22, S.k * f)) }; last = 0; kick(); },
      setMode(m, month) { S.mode = m; if (month) S.month = month; draw(); },
      select(originId, regionName, arcs) {
        S.origin = originId; S.region = regionName || null; S.hover = null; S.spin = false;
        S.arcs = []; S.arcT = 1;
        if (!originId) { flyTo([-S.rot[0], 8], 1); return; }
        const o = B.O[originId], fo = focusOf(o);
        let c = fo.c, k = fo.k;
        const r = regionName && o.reg[regionName];
        if (r && r.pt) { c = r.pt; k = Math.min(22, fo.k * 1.7); }
        if (arcs && arcs.length) {
          // show origin and the US together: turn to a point between them
          const from = r && r.pt ? r.pt : fo.c;
          S.arcs = arcs.map((a) => { const dist = d3.geoDistance(from, a.city.pt); return { city: a.city, n: a.n, to: a.city.pt, ip: d3.geoInterpolate(from, a.city.pt), h: 0.1 + dist * 0.11 }; });
          S.arcT = 0; S.arcFrom = from; S.arcLabel = r ? r.n : o.n;
          const v = [0, 0, 0];
          arcs.forEach((a) => { const w = Math.sqrt(a.n), l = a.city.pt[0] * RAD, f = a.city.pt[1] * RAD; v[0] += w * Math.cos(f) * Math.cos(l); v[1] += w * Math.cos(f) * Math.sin(l); v[2] += w * Math.sin(f); });
          const dest = [Math.atan2(v[1], v[0]) / RAD, Math.atan2(v[2], Math.hypot(v[0], v[1])) / RAD];
          c = d3.geoInterpolate(from, dest)(0.5); k = 1;      // origin and its US cities sit either side of centre
        }
        flyTo(c, k);
      },
      destroy() { ro.disconnect(); mo.disconnect(); onWorld.disconnect(); mq.removeEventListener('change', onTheme); cancelAnimationFrame(raf); },
    };
    resize(); kick();
    return api;
  };

  /* ====================================================================== US MAP */
  geo.USMap = function (host, opt) {
    const W = 960, H = 600;
    const fc = { type: 'FeatureCollection', features: usStates };
    const proj = d3.geoAlbersUsa().fitExtent([[10, 10], [W - 10, H - 10]], fc);
    const path = d3.geoPath(proj);
    const svg = d3.select(host).append('svg').attr('class', 'usmap').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Map of the United States with a circle for each city that has indexed coffee businesses');
    const g = svg.append('g');
    const gs = g.append('g'), gl = g.append('g'), gc = g.append('g'), gp = g.append('g');
    gs.selectAll('path').data(usStates).join('path').attr('class', 'st').attr('d', path)
      .on('click', (e, d) => opt.onState && opt.onState(d.id))
      .on('pointermove', (e, d) => B.tip.show(B.html`<b>${d.properties.n}</b>${opt.stateTip ? opt.stateTip(d.id) : ''}`, e.clientX, e.clientY))
      .on('pointerleave', () => B.tip.hide());
    gl.selectAll('text').data(usStates.filter((d) => path.area(d) > 1500)).join('text').attr('class', 'stl')
      .attr('transform', (d) => { const p = proj(d.properties.ct) || path.centroid(d); return `translate(${p[0]},${p[1] + 3})`; }).text((d) => d.id);
    let k = 1, data = [], pins = [], selCity = null, selState = null;
    const rScale = (n) => 3.2 + Math.sqrt(n) * 2.1;
    function drawCities() {
      const rows = data.map((c) => ({ c, p: proj(c.pt) })).filter((d) => d.p).sort((a, b) => b.c.v - a.c.v);
      gc.selectAll('circle').data(rows, (d) => d.c.key).join('circle').attr('class', (d) => 'city' + (d.c.key === selCity ? ' on' : ''))
        .attr('cx', (d) => d.p[0]).attr('cy', (d) => d.p[1]).attr('r', (d) => rScale(d.c.v) / Math.pow(k, 0.72))
        .attr('tabindex', 0).attr('role', 'button').attr('aria-label', (d) => d.c.key + ', ' + d.c.v + ' businesses')
        .on('click', (e, d) => opt.onCity && opt.onCity(d.c.key))
        .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opt.onCity && opt.onCity(d.c.key); } })
        .on('pointermove', (e, d) => B.tip.show(B.html`<b>${d.c.key}</b>${opt.cityTip ? opt.cityTip(d.c) : ''}`, e.clientX, e.clientY))
        .on('pointerleave', () => B.tip.hide());
      const prow = (k >= 5 ? pins : []).map((c) => ({ c, p: proj(c.pt) })).filter((d) => d.p);
      gp.selectAll('circle').data(prow, (d) => d.c.i).join('circle').attr('class', 'pin').attr('cx', (d) => d.p[0]).attr('cy', (d) => d.p[1]).attr('r', 5.5 / k)
        .on('click', (e, d) => B.openCompany(d.c.i))
        .on('pointermove', (e, d) => B.tip.show(B.html`<b>${d.c.n}</b>${d.c.addr || ''}`, e.clientX, e.clientY))
        .on('pointerleave', () => B.tip.hide());
      gs.selectAll('path').classed('on', (d) => d.id === selState);
      gl.selectAll('text').style('font-size', 9 / Math.pow(k, 0.85) + 'px');
    }
    const zoom = d3.zoom().scaleExtent([1, 40]).translateExtent([[0, 0], [W, H]])
      .filter((e) => (e.type === 'wheel' ? e.ctrlKey || e.metaKey : !e.button))
      .on('zoom', (e) => { k = e.transform.k; g.attr('transform', e.transform); drawCities(); });
    svg.call(zoom).on('dblclick.zoom', null);
    const api = {
      set(cities, addrPins) { data = cities; pins = addrPins || []; drawCities(); },
      select(cityKey, stateId) { selCity = cityKey || null; selState = stateId || null; drawCities(); },
      zoomBy(f) { svg.transition().duration(250).call(zoom.scaleBy, f); },
      reset() { svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity); },
      focusState(id) {
        const f = usStates.find((s) => s.id === id); if (!f) return;
        const b = path.bounds(f), dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1], s = Math.max(1, Math.min(14, 0.8 / Math.max(dx / W, dy / H)));
        svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - s * (b[0][0] + b[1][0]) / 2, H / 2 - s * (b[0][1] + b[1][1]) / 2).scale(s));
      },
      focusPoint(ptLL, s) {
        const p = proj(ptLL); if (!p) return;
        svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - s * p[0], H / 2 - s * p[1]).scale(s));
      },
      proj,
    };
    return api;
  };
})();
